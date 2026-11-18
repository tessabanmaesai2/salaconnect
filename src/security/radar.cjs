const http = require('http');
const { SECURITY_LOGS_FILE } = require('../config.cjs');
const { atomicSave, readJsonFile } = require('../utils/core.cjs');

const ipGeoCache = new Map();
const failedAttempts = new Map(); // ip -> { count, firstAttempt, lockedUntil, reason }
const accountAttempts = new Map(); // usernameLower -> { count, firstAttempt, ips: Set, alerted }
const sweepAttempts = new Map();  // ip -> { count, firstAttempt, paths: Set }
const proposalRateLimit = new Map(); // ip -> [timestamps]

const MAX_LOGIN_ATTEMPTS = 5;
const SURGE_IP_MAX_ATTEMPTS = 2;
const MAX_ACCOUNT_SURGE_ATTEMPTS = 8;
const ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const SWEEP_WINDOW_MS = 60 * 1000;
const MAX_SWEEP_HITS = 20;

let securityLogs = [];

function loadSecurityLogs() {
  const parsed = readJsonFile(SECURITY_LOGS_FILE, []);
  securityLogs = Array.isArray(parsed) ? parsed : [];
  return securityLogs;
}

function saveSecurityLogs() {
  return atomicSave(SECURITY_LOGS_FILE, securityLogs.slice(0, 2000));
}

function getSecurityLogs() {
  return securityLogs;
}

function clearSecurityLogs(req) {
  securityLogs = [];
  saveSecurityLogs();
  logSecurity('ALL_LOGS_CLEARED', 'masterkey', req, 'ล้างประวัติความปลอดภัยทั้งหมดโดยผู้ดูแลระบบ', 'WARN');
}

function deleteSecurityLogById(id) {
  const idx = securityLogs.findIndex(l => l.id === id);
  if (idx !== -1) {
    securityLogs.splice(idx, 1);
    saveSecurityLogs();
    return true;
  }
  return false;
}

function getClientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  if (req?.headers?.['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  const raw = req?.socket?.remoteAddress || '127.0.0.1';
  return String(raw).replace(/^::ffff:/, '').trim() || '127.0.0.1';
}

function isPrivateIp(ip) {
  if (!ip || ip === 'unknown') return true;
  const cleanIp = ip.replace(/^.*:/, '').trim();
  if (cleanIp === '127.0.0.1' || cleanIp === 'localhost' || ip === '::1') return true;
  const parts = cleanIp.split('.').map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
  }
  return false;
}

function getPrivateGeo() {
  return {
    country: 'เครือข่ายภายใน',
    region: 'Localhost / LAN',
    city: 'Local Server',
    isp: 'Internal Network / Loopback',
    isLocal: true
  };
}

function resolveIpGeo(ip) {
  if (!ip || isPrivateIp(ip)) return getPrivateGeo();
  if (ipGeoCache.has(ip)) return ipGeoCache.get(ip);

  try {
    http.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org`, { timeout: 2500 }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.status === 'success') {
            ipGeoCache.set(ip, {
              country: data.country || 'ต่างประเทศ',
              region: data.regionName || '',
              city: data.city || '',
              isp: data.org || data.isp || 'Internet Service Provider',
              isLocal: false
            });
          }
        } catch (_) {}
      });
    }).on('error', () => {});
  } catch (_) {}

  return {
    country: 'กำลังตรวจสอบ',
    region: 'เครือข่ายอินเทอร์เน็ต',
    city: '',
    isp: 'External Network',
    isLocal: false
  };
}

function parseDevice(userAgent) {
  if (!userAgent) return 'ไม่ระบุอุปกรณ์';
  const ua = userAgent.toLowerCase();
  let os = 'Windows';
  if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';

  let browser = 'Browser';
  if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  return `${os} • ${browser}`;
}

function logSecurity(action, username, req, details, threatLevel = 'INFO') {
  try {
    const cleanIp = req ? getClientIp(req) : '127.0.0.1';
    const userAgent = req ? (req.headers['user-agent'] || '') : '';
    const logEntry = {
      id: securityLogs.length > 0 ? (securityLogs[0].id + 1) : 1,
      timestamp: new Date().toISOString(),
      app: 'SALA CONNECT',
      threatLevel,
      action: action || 'UNKNOWN',
      username: username || 'anonymous',
      ip: cleanIp,
      geo: ipGeoCache.get(cleanIp) || resolveIpGeo(cleanIp),
      device: parseDevice(userAgent),
      details: details || ''
    };
    securityLogs.unshift(logEntry);
    if (securityLogs.length > 2000) securityLogs.pop();
    saveSecurityLogs();
  } catch (e) {
    console.error('[SECURITY LOG] Error logging:', e.message);
  }
}

function isAccountUnderSurge(username) {
  if (!username) return false;
  const key = String(username).trim().toLowerCase();
  const acct = accountAttempts.get(key);
  if (!acct) return false;
  if (Date.now() - acct.firstAttempt > ACCOUNT_WINDOW_MS) {
    accountAttempts.delete(key);
    return false;
  }
  return acct.count >= MAX_ACCOUNT_SURGE_ATTEMPTS;
}

function checkLoginRateLimit(ip, username = '') {
  const now = Date.now();
  const lockInfo = failedAttempts.get(ip);
  const maxAllowed = isAccountUnderSurge(username) ? SURGE_IP_MAX_ATTEMPTS : MAX_LOGIN_ATTEMPTS;
  if (!lockInfo) return { allowed: true };

  if (lockInfo.lockedUntil) {
    if (now < lockInfo.lockedUntil) {
      return { allowed: false, remainingMinutes: Math.ceil((lockInfo.lockedUntil - now) / 60000) };
    }
    failedAttempts.delete(ip);
    return { allowed: true };
  }

  if (lockInfo.firstAttempt && (now - lockInfo.firstAttempt > LOGIN_WINDOW_MS)) {
    failedAttempts.delete(ip);
    return { allowed: true };
  }

  if (lockInfo.count >= maxAllowed) {
    lockInfo.lockedUntil = now + LOCKOUT_DURATION_MS;
    return { allowed: false, remainingMinutes: 15 };
  }
  return { allowed: true };
}

function recordFailedLogin(ip, username = '', req = null) {
  const now = Date.now();
  let maxAllowed = MAX_LOGIN_ATTEMPTS;
  if (username) {
    const key = String(username).trim().toLowerCase();
    if (key) {
      let acct = accountAttempts.get(key);
      if (!acct || (now - acct.firstAttempt > ACCOUNT_WINDOW_MS)) {
        acct = { count: 1, firstAttempt: now, ips: new Set([ip]), alerted: false };
        accountAttempts.set(key, acct);
      } else {
        acct.count += 1;
        acct.ips.add(ip);
        if (acct.count >= MAX_ACCOUNT_SURGE_ATTEMPTS) {
          maxAllowed = SURGE_IP_MAX_ATTEMPTS;
          if (!acct.alerted) {
            acct.alerted = true;
            logSecurity('DISTRIBUTED_BRUTE_FORCE', key, req, `ตรวจพบการสุ่มรหัสผ่านบัญชี [${key}] ต่อเนื่อง ${acct.count} ครั้ง จาก ${acct.ips.size} IP`, 'CRITICAL');
          }
        }
      }
    }
  }

  const att = failedAttempts.get(ip);
  if (!att || (att.firstAttempt && now - att.firstAttempt > LOGIN_WINDOW_MS)) {
    failedAttempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: null, reason: 'BRUTE_FORCE' });
    return { count: 1, maxAllowed, locked: false };
  }
  att.count += 1;
  if (att.count >= maxAllowed) {
    att.lockedUntil = now + LOCKOUT_DURATION_MS;
    att.reason = 'BRUTE_FORCE';
    return { count: att.count, maxAllowed, locked: true };
  }
  return { count: att.count, maxAllowed, locked: false };
}

function recordSuccessfulLogin(ip, username = '') {
  failedAttempts.delete(ip);
  if (username) {
    const key = String(username).trim().toLowerCase();
    if (key) accountAttempts.delete(key);
  }
}

function banIp(ip, durationMs, reason = 'BOT_SHIELD') {
  failedAttempts.set(ip, { count: 99, firstAttempt: Date.now(), lockedUntil: Date.now() + durationMs, reason });
}

function isIpBanned(ip) {
  const lockInfo = failedAttempts.get(ip);
  if (!lockInfo || !lockInfo.lockedUntil) return { banned: false };
  if (Date.now() < lockInfo.lockedUntil) {
    return { banned: true, reason: lockInfo.reason, remainingMinutes: Math.ceil((lockInfo.lockedUntil - Date.now()) / 60000) };
  }
  failedAttempts.delete(ip);
  return { banned: false };
}

function recordSweepHit(ip, urlPath, statusCode, req = null) {
  if (!ip || (statusCode !== 404 && statusCode !== 401)) return false;
  const ban = isIpBanned(ip);
  if (ban.banned && ban.reason === 'SWEEP_404_401') return true;

  const now = Date.now();
  let entry = sweepAttempts.get(ip);
  if (!entry || (now - entry.firstAttempt > SWEEP_WINDOW_MS)) {
    sweepAttempts.set(ip, { count: 1, firstAttempt: now, paths: new Set([urlPath]) });
    return false;
  }
  entry.count += 1;
  if (entry.paths.size < 25) entry.paths.add(urlPath);

  if (entry.count >= MAX_SWEEP_HITS) {
    banIp(ip, LOCKOUT_DURATION_MS, 'SWEEP_404_401');
    sweepAttempts.delete(ip);
    logSecurity('SWEEP_DETECTED', 'sweep-radar', req, `ตรวจพบการสแกน Path/Auth (404/401 Sweep) ${entry.count} ครั้งใน 1 นาที — ระงับ IP 15 นาที`, 'CRITICAL');
    return true;
  }
  return false;
}

function getBannedIpsList() {
  const bannedList = [];
  const now = Date.now();
  failedAttempts.forEach((info, ip) => {
    if (info.lockedUntil && info.lockedUntil > now) {
      bannedList.push({
        ip,
        reason: info.reason || 'BRUTE_FORCE',
        remainingMinutes: Math.ceil((info.lockedUntil - now) / 60000),
        count: info.count
      });
    }
  });
  return bannedList;
}

function unbanIpAddress(ip, req) {
  if (ip && (failedAttempts.has(ip) || sweepAttempts.has(ip))) {
    failedAttempts.delete(ip);
    sweepAttempts.delete(ip);
    logSecurity('IP_UNBANNED', 'masterkey', req, `ปลดล็อก IP: ${ip} สำเร็จ`, 'INFO');
    return true;
  }
  return false;
}

// Anti-spam patterns
const SPAM_PATTERNS = [
  /https?:\/\//i, /www\./i, /t\.me\//i, /bit\.ly/i, /tinyurl/i,
  /slot/i, /casino/i, /baccarat/i, /บาคาร่า/i, /สล็อต/i, /เว็บพนัน/i,
  /แทงบอล/i, /คาสิโน/i, /เครดิตฟรี/i, /ufabet/i, /pgslot/i, /viagra/i, /crypto/i
];

function isSpamText(text) {
  if (!text || typeof text !== 'string') return false;
  return SPAM_PATTERNS.some(regex => regex.test(text));
}

function checkProposalRateLimit(ip) {
  const nowTime = Date.now();
  const timestamps = (proposalRateLimit.get(ip) || []).filter(t => nowTime - t < 60000);
  if (timestamps.length >= 3) return false;
  timestamps.push(nowTime);
  proposalRateLimit.set(ip, timestamps);
  return true;
}

function isSensitiveProbe(pathname) {
  const lower = String(pathname || '').toLowerCase();
  return lower.includes('..') ||
    (lower.includes('/.') && !lower.includes('/.well-known/')) ||
    lower.endsWith('.env') ||
    lower.endsWith('.git') ||
    lower.endsWith('package.json') ||
    lower.endsWith('dockerfile') ||
    lower.endsWith('docker-compose.yml') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.sh') ||
    lower.endsWith('.bat') ||
    lower.includes('/data/') ||
    lower.includes('/security_logs.json');
}

function resetRadarStateForTests() {
  failedAttempts.clear();
  accountAttempts.clear();
  sweepAttempts.clear();
  proposalRateLimit.clear();
  securityLogs = [];
}

module.exports = {
  loadSecurityLogs,
  saveSecurityLogs,
  getSecurityLogs,
  clearSecurityLogs,
  deleteSecurityLogById,
  getClientIp,
  logSecurity,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  banIp,
  isIpBanned,
  recordSweepHit,
  getBannedIpsList,
  unbanIpAddress,
  isSpamText,
  checkProposalRateLimit,
  isSensitiveProbe,
  resetRadarStateForTests
};
