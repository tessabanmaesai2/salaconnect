// ============================================================
// MAESAI SALA CONNECT — Control Center & Production Engine
// Dual Role: Local Control Dashboard (Port 3405) & Cloud Ingress Web Engine
// Standard: Municipal DEC-020 Two-Step GitOps & DEC-022 (Port 3405, /sala/)
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = parseInt(process.env.PORT, 10) || 3405;
const PROJECT_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(PROJECT_DIR, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');

const PROPOSALS_FILE = path.join(DATA_DIR, 'proposals.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const SECURITY_LOGS_FILE = path.join(DATA_DIR, 'security_logs.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

// Master Credentials Standard across Municipal Systems
const MASTER_KEY = process.env.MASTER_KEY || 'thedatazero';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'Kn123990002466119842528';

// Ensure directories exist
[DATA_DIR, BACKUPS_DIR, PUBLIC_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// MIME Type Mapping
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

// ─── IN-MEMORY STATE ─────────────────────────────────────────
let state = {
    proposals: [],
    users: [],
    settings: {},
    news: [],
    securityLogs: [],
    sessions: new Map() // token -> { user, expiresAt }
};

// Load All Databases
function loadData() {
    try {
        if (fs.existsSync(PROPOSALS_FILE)) {
            state.proposals = JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf8'));
        }
        if (fs.existsSync(USERS_FILE)) {
            state.users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
        if (fs.existsSync(SETTINGS_FILE)) {
            state.settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
        if (fs.existsSync(NEWS_FILE)) {
            state.news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
        }
        if (fs.existsSync(SECURITY_LOGS_FILE)) {
            state.securityLogs = JSON.parse(fs.readFileSync(SECURITY_LOGS_FILE, 'utf8'));
        }
        console.log(`[DB] Loaded: ${state.proposals.length} proposals, ${state.users.length} users, ${state.news.length} news items`);
        createDailyBackup();
    } catch (e) {
        console.error('[DB] Load error:', e.message);
    }
}

// Atomic File Saver
function atomicSave(filePath, data) {
    try {
        const payload = JSON.stringify(data, null, 2);
        const tmpFile = filePath + '.tmp';
        fs.writeFileSync(tmpFile, payload, 'utf8');
        fs.renameSync(tmpFile, filePath);
        return true;
    } catch (e) {
        console.error(`[DB] Save error for ${filePath}:`, e.message);
        return false;
    }
}

function saveProposals() { return atomicSave(PROPOSALS_FILE, state.proposals); }
function saveUsers() { return atomicSave(USERS_FILE, state.users); }
function saveSettings() { return atomicSave(SETTINGS_FILE, state.settings); }
function saveNews() { return atomicSave(NEWS_FILE, state.news); }
function saveSecurityLogs() { return atomicSave(SECURITY_LOGS_FILE, state.securityLogs); }

// ─── DEC-026 GEOLOCATION & BRUTE-FORCE RADAR ENGINE ──────────
const ipGeoCache = new Map();
const failedAttempts = new Map(); // ip -> { count, lockedUntil }

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
                } catch (e) {}
            });
        }).on('error', () => {});
    } catch (e) {}

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
    else if (ua.includes('windows')) os = 'Windows';

    let browser = 'Browser';
    if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari')) browser = 'Safari';

    return `${os} • ${browser}`;
}

function logSecurity(action, username, req, details, threatLevel = 'INFO') {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
        const userAgent = req ? (req.headers['user-agent'] || '') : '';
        const cleanIp = String(ip).replace(/^.*:/, '').trim() || '127.0.0.1';

        const logEntry = {
            id: state.securityLogs.length > 0 ? (state.securityLogs[0].id + 1) : 1,
            timestamp: new Date().toISOString(),
            app: 'SALA CONNECT',
            threatLevel: threatLevel, // INFO, WARN, CRITICAL
            action: action || 'UNKNOWN',
            username: username || 'anonymous',
            ip: cleanIp,
            geo: ipGeoCache.get(cleanIp) || resolveIpGeo(cleanIp),
            device: parseDevice(userAgent),
            details: details || ''
        };
        state.securityLogs.unshift(logEntry);
        if (state.securityLogs.length > 2000) state.securityLogs.pop();
        saveSecurityLogs();
    } catch (e) {
        console.error('[SECURITY LOG] Error logging:', e.message);
    }
}

function createDailyBackup() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const backupPath = path.join(BACKUPS_DIR, `sala_backup_${today}.json`);
        if (!fs.existsSync(backupPath)) {
            const backupPayload = {
                timestamp: new Date().toISOString(),
                proposals: state.proposals,
                users: state.users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, status: u.status })),
                settings: state.settings,
                news: state.news
            };
            fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
            console.log(`[BACKUP] Created daily backup: ${backupPath}`);
        }
    } catch (e) {
        console.error('[BACKUP] Failed daily backup:', e.message);
    }
}

// ─── AUTHENTICATION HELPERS ─────────────────────────────────
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSessionUser(req) {
    const authHeader = req.headers['authorization'] || '';
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    } else {
        const cookie = req.headers['cookie'] || '';
        const match = cookie.match(/sala_token=([a-f0-9]+)/);
        if (match) token = match[1];
    }
    if (!token) return null;
    const session = state.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
        state.sessions.delete(token);
        return null;
    }
    return session.user;
}

// ─── HTTP REQUEST UTILITIES ──────────────────────────────────
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 20 * 1024 * 1024) { // 20MB limit
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve({ raw: body });
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
    sendJson(res, statusCode, { success: false, error: message });
}

// ─── PHOTO UPLOAD HANDLER ────────────────────────────────────
function saveUploadedPhoto(code, base64Data) {
    if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
        return null;
    }
    try {
        const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (!matches || matches.length < 3) return null;

        let ext = matches[1].toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) ext = 'jpg';

        const safeCode = (code || 'prop').replace(/[^a-zA-Z0-9_-]/g, '');
        const filename = `prop_${safeCode}_${Date.now()}.${ext}`;
        const diskPath = path.resolve(UPLOADS_DIR, filename);

        // Path Traversal Security check: must reside inside UPLOADS_DIR
        if (!diskPath.startsWith(path.resolve(UPLOADS_DIR))) {
            console.error('[SECURITY ALERT] Path traversal attempt in image upload:', filename);
            return null;
        }

        const buffer = Buffer.from(matches[2], 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
            console.error('[SECURITY ALERT] Uploaded image exceeds 5MB limit');
            return null;
        }

        fs.writeFileSync(diskPath, buffer);
        return `uploads/${filename}`;
    } catch (e) {
        console.error('[UPLOAD ERROR]', e.message);
        return null;
    }
}

// ─── DEC-026 ANTI-SPAM & BOT RADAR ENGINE ────────────────────
const proposalRateLimit = new Map(); // ip -> [timestamps]

const SPAM_PATTERNS = [
    /https?:\/\//i,
    /www\./i,
    /t\.me\//i,
    /bit\.ly/i,
    /tinyurl/i,
    /slot/i,
    /casino/i,
    /baccarat/i,
    /บาคาร่า/i,
    /สล็อต/i,
    /เว็บพนัน/i,
    /แทงบอล/i,
    /คาสิโน/i,
    /เครดิตฟรี/i,
    /ufabet/i,
    /pgslot/i,
    /viagra/i,
    /crypto/i
];

function isSpamText(text) {
    if (!text || typeof text !== 'string') return false;
    return SPAM_PATTERNS.some(regex => regex.test(text));
}

function purgeSpamFromIp(ip, reason) {
    const before = state.proposals.length;
    state.proposals = state.proposals.filter(p => p.clientIp !== ip && !isSpamText(p.problem) && !isSpamText(p.solution));
    const removed = before - state.proposals.length;
    if (removed > 0) {
        saveProposals();
        logSecurity('SPAM_AUTO_PURGED', 'anti-bot-engine', null, `ตรวจพบสแปม! ลบข้อเสนอขยะทิ้งอัตโนมัติทันที ${removed} รายการ (${reason || 'Spam IP Purged'})`, 'CRITICAL');
    }
}

// ─── ROUTER & HANDLERS ──────────────────────────────────────
const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }

    try {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        let pathname = decodeURIComponent(parsedUrl.pathname);

        // Normalize path: strip leading '/sala' if present to make routes unified
        let normalizedPath = pathname;
        if (normalizedPath === '/sala' || normalizedPath === '/sala/') {
            normalizedPath = '/';
        } else if (normalizedPath.startsWith('/sala/')) {
            normalizedPath = normalizedPath.slice(5); // remove '/sala'
        }

        // ─── API ROUTES ──────────────────────────────────────────
        if (normalizedPath.startsWith('/api/')) {
            const apiPath = normalizedPath.slice(4); // e.g. '/health', '/auth/login'

            // GET /api/health
            if (apiPath === '/health' && req.method === 'GET') {
                return sendJson(res, 200, {
                    success: true,
                    appName: state.settings.appName || 'SALA CONNECT',
                    version: '4.0.0',
                    port: PORT,
                    status: 'OK',
                    uptime: process.uptime(),
                    proposalsCount: state.proposals.length,
                    timestamp: new Date().toISOString()
                });
            }

            // GET /api/settings
            if (apiPath === '/settings' && req.method === 'GET') {
                return sendJson(res, 200, { success: true, settings: state.settings });
            }

            // POST /api/settings (Admin only)
            if (apiPath === '/settings' && req.method === 'POST') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอสำหรับการตั้งค่าระบบ');
                }
                const body = await parseBody(req);
                state.settings = { ...state.settings, ...body, updatedAt: new Date().toISOString() };
                saveSettings();
                logSecurity('SETTINGS_UPDATE', currentUser.username, req, 'อัปเดตการตั้งค่าระบบ');
                return sendJson(res, 200, { success: true, settings: state.settings });
            }

            // POST /api/auth/login
            if (apiPath === '/auth/login' && req.method === 'POST') {
                const body = await parseBody(req);
                const { username, password } = body;
                if (!username || !password) {
                    return sendError(res, 400, 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน');
                }

                // Check Master Key & Staff Users (Flexible: matches username or display name, case-insensitive)
                let matchedUser = null;
                const cleanUser = (username || '').trim();
                const cleanPass = (password || '').trim();

                if ((cleanUser === MASTER_KEY || cleanUser.toLowerCase() === 'thedatazero' || cleanUser.toLowerCase() === MASTER_KEY.toLowerCase()) && 
                    (cleanPass === MASTER_PASSWORD || cleanPass === MASTER_KEY)) {
                    matchedUser = {
                        id: 0,
                        username: MASTER_KEY,
                        name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
                        role: 'Super Admin',
                        status: 'Active'
                    };
                } else {
                    const uLower = cleanUser.toLowerCase();
                    matchedUser = state.users.find(u => 
                        (
                            (u.username && u.username.toLowerCase() === uLower) || 
                            (u.name && u.name.trim().toLowerCase() === uLower) ||
                            (u.name && u.name.trim() === cleanUser)
                        ) && 
                        (u.password === cleanPass)
                    );
                }

                if (!matchedUser) {
                    logSecurity('LOGIN_FAILED', username, req, 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง');
                    return sendError(res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                }

                if (matchedUser.status === 'Disabled') {
                    logSecurity('LOGIN_BLOCKED', username, req, 'บัญชีถูกระงับการใช้งาน');
                    return sendError(res, 403, 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
                }

                const token = generateToken();
                state.sessions.set(token, {
                    user: {
                        id: matchedUser.id,
                        username: matchedUser.username,
                        name: matchedUser.name,
                        role: matchedUser.role
                    },
                    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
                });

                logSecurity('LOGIN_SUCCESS', matchedUser.username, req, `เข้าสู่ระบบสำเร็จในบทบาท ${matchedUser.role}`);

                return sendJson(res, 200, {
                    success: true,
                    token: token,
                    user: {
                        id: matchedUser.id,
                        username: matchedUser.username,
                        name: matchedUser.name,
                        role: matchedUser.role
                    }
                });
            }

            // POST /api/auth/master-login (Strict: Master Key Username & Password, DEC-026 Protected)
            if (apiPath === '/auth/master-login' && req.method === 'POST') {
                const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '').trim();

                const body = await parseBody(req);
                const username = (body.username || body.master_key || body.masterKey || '').trim();
                const password = (body.password || body.master_password || body.masterPassword || '').trim();

                if (!password && !username) {
                    return sendError(res, 400, 'กรุณาระบุชื่อผู้ใช้งานและรหัสผ่าน Master Key');
                }

                // Verify credentials against Master Key OR Admin/Super Admin staff accounts
                const uLower = (username || '').toLowerCase().trim();
                const pClean = (password || '').trim();

                const isMasterKeyMatch = (
                    (username && (username === MASTER_KEY || uLower === 'thedatazero' || uLower === MASTER_KEY.toLowerCase())) &&
                    (pClean === MASTER_PASSWORD || pClean === MASTER_KEY)
                ) || (
                    !username && (pClean === MASTER_PASSWORD || pClean === MASTER_KEY)
                );

                let matchedAdminUser = null;
                if (!isMasterKeyMatch) {
                    matchedAdminUser = state.users.find(u => 
                        (u.role === 'Admin' || u.role === 'Super Admin') &&
                        (
                            (u.username && u.username.toLowerCase() === uLower) || 
                            (u.name && u.name.trim().toLowerCase() === uLower) ||
                            (u.name && u.name.trim() === username)
                        ) &&
                        (u.password === pClean) &&
                        (u.status !== 'Disabled')
                    );
                }

                if (isMasterKeyMatch || matchedAdminUser) {
                    failedAttempts.delete(clientIp);
                    const userObj = matchedAdminUser ? {
                        id: matchedAdminUser.id,
                        username: matchedAdminUser.username,
                        name: matchedAdminUser.name,
                        role: matchedAdminUser.role
                    } : {
                        id: 0,
                        username: MASTER_KEY,
                        name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
                        role: 'Super Admin'
                    };

                    const token = generateToken();
                    state.sessions.set(token, {
                        user: userObj,
                        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
                    });
                    logSecurity('MASTER_LOGIN_SUCCESS', userObj.username, req, `เข้าสู่ระบบความปลอดภัยสำเร็จ (${userObj.role})`, 'INFO');
                    return sendJson(res, 200, {
                        success: true,
                        token: token,
                        user: userObj
                    });
                }

                const lockInfo = failedAttempts.get(clientIp);
                if (lockInfo && lockInfo.lockedUntil && Date.now() < lockInfo.lockedUntil) {
                    const remainingMinutes = Math.ceil((lockInfo.lockedUntil - Date.now()) / 60000);
                    logSecurity('BRUTE_FORCE_BLOCKED', 'masterkey', req, `IP ถูกระงับชั่วคราว เหลือ ${remainingMinutes} นาที`, 'CRITICAL');
                    return sendError(res, 429, `IP ของท่านถูกระงับชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกินกำหนด กรุณารอ ${remainingMinutes} นาที`);
                } else {
                    let att = failedAttempts.get(clientIp) || { count: 0, lockedUntil: null };
                    att.count++;
                    if (att.count >= 5) {
                        att.lockedUntil = Date.now() + (15 * 60 * 1000); // 15 min lock
                        logSecurity('ANTI_BRUTE_FORCE_TRIGGERED', username || 'masterkey', req, `ใส่ Master Key ผิด 5 ครั้ง ถูกระงับ 15 นาที`, 'CRITICAL');
                    } else {
                        logSecurity('MASTER_LOGIN_FAILED', username || 'masterkey', req, `ใส่ Master Key ไม่ถูกต้อง (ครั้งที่ ${att.count}/5)`, 'WARN');
                    }
                    failedAttempts.set(clientIp, att);
                    return sendError(res, 401, 'ชื่อผู้ใช้งานหรือรหัสผ่าน Master Key ไม่ถูกต้อง');
                }
            }

            // POST /api/auth/logout
            if (apiPath === '/auth/logout' && req.method === 'POST') {
                const authHeader = req.headers['authorization'] || '';
                const token = authHeader.replace('Bearer ', '').trim();
                if (token && state.sessions.has(token)) {
                    const session = state.sessions.get(token);
                    logSecurity('LOGOUT', session.user.username, req, 'ออกจากระบบ');
                    state.sessions.delete(token);
                }
                return sendJson(res, 200, { success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
            }

            // GET /api/auth/me
            if (apiPath === '/auth/me' && req.method === 'GET') {
                const user = getSessionUser(req);
                if (!user) return sendError(res, 401, 'ยังไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ');
                return sendJson(res, 200, { success: true, user: user });
            }

            // GET /api/stats (Overview metrics)
            if (apiPath === '/stats' && req.method === 'GET') {
                const stats = {
                    total: state.proposals.length,
                    byStatus: {},
                    byCommunity: {},
                    byCategory: {},
                    totalBudget: 0
                };

                state.settings.statuses.forEach(s => stats.byStatus[s] = 0);
                state.settings.communities.forEach(c => stats.byCommunity[c] = 0);

                state.proposals.forEach(p => {
                    let s = p.status || 'เสนอเรื่องเข้ามา';
                    if (s === 'รอดำเนินการ' || s === 'เข้าระบบแล้ว') s = 'เสนอเรื่องเข้ามา';
                    if (s === 'บรรจุในแผนชุมชน') s = 'บรรจุในแผน';
                    stats.byStatus[s] = (stats.byStatus[s] || 0) + 1;

                    const c = p.community || 'ไม่ระบุ';
                    stats.byCommunity[c] = (stats.byCommunity[c] || 0) + 1;

                    const cat = p.category || 'ไม่ระบุ';
                    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
                });

                return sendJson(res, 200, { success: true, stats: stats });
            }

            // GET /api/proposals (List with filtering)
            if (apiPath === '/proposals' && req.method === 'GET') {
                const communityFilter = parsedUrl.searchParams.get('community');
                const statusFilter = parsedUrl.searchParams.get('status');
                const categoryFilter = parsedUrl.searchParams.get('category');
                const search = parsedUrl.searchParams.get('search');
                const isPublic = parsedUrl.searchParams.get('public') === 'true';

                let results = [...state.proposals];

                if (communityFilter && communityFilter !== 'all') {
                    results = results.filter(p => p.community === communityFilter);
                }
                if (statusFilter && statusFilter !== 'all') {
                    results = results.filter(p => p.status === statusFilter);
                }
                if (categoryFilter && categoryFilter !== 'all') {
                    results = results.filter(p => p.category === categoryFilter);
                }
                if (search) {
                    const q = search.toLowerCase();
                    results = results.filter(p =>
                        (p.code && p.code.toLowerCase().includes(q)) ||
                        (p.problem && p.problem.toLowerCase().includes(q)) ||
                        (p.solution && p.solution.toLowerCase().includes(q)) ||
                        (p.location && p.location.toLowerCase().includes(q)) ||
                        (p.name && p.name.toLowerCase().includes(q)) ||
                        (p.community && p.community.toLowerCase().includes(q))
                    );
                }

                // If public mode, mask private PII per PDPA rule
                if (isPublic) {
                    results = results.map(p => ({
                        id: p.id,
                        code: p.code,
                        timestamp: p.timestamp,
                        community: p.community,
                        category: p.category,
                        problem: p.problem,
                        solution: p.solution,
                        location: p.location,
                        status: p.status,
                        reject_reason: p.reject_reason,
                        photo: p.photo,
                        gps_lat: p.gps_lat,
                        gps_lng: p.gps_lng,
                        department: p.department
                    }));
                }

                return sendJson(res, 200, { success: true, count: results.length, data: results });
            }

            // GET /api/proposals/:id
            if (apiPath.startsWith('/proposals/') && req.method === 'GET') {
                const id = parseInt(apiPath.split('/')[2], 10);
                const proposal = state.proposals.find(p => p.id === id);
                if (!proposal) return sendError(res, 404, 'ไม่พบข้อมูลข้อเสนอโครงการ');
                return sendJson(res, 200, { success: true, data: proposal });
            }

            // POST /api/proposals (Submit new proposal - Public or Staff, DEC-026 Anti-Spam Protected)
            if (apiPath === '/proposals' && req.method === 'POST') {
                const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '').trim();

                // 1. Check if IP is banned in Security Radar
                const lockInfo = failedAttempts.get(clientIp);
                if (lockInfo && lockInfo.lockedUntil && Date.now() < lockInfo.lockedUntil) {
                    const remainingMinutes = Math.ceil((lockInfo.lockedUntil - Date.now()) / 60000);
                    logSecurity('BOT_REQUEST_REJECTED', 'bot-shield', req, `บล็อกการส่งข้อมูลจาก IP ที่ถูกระงับ (เหลือ ${remainingMinutes} นาที)`, 'CRITICAL');
                    return sendError(res, 403, `IP ของท่านถูกระงับการส่งข้อเสนอเนื่องจากตรวจพบพฤติกรรมสแปมหรือยิงคำขอผิดปกติ (Anti-Bot Protection) กรุณารอ ${remainingMinutes} นาที`);
                }

                const body = await parseBody(req);

                // 2. Honeypot Trap check (website_trap_hp must be empty)
                if (body.website_trap_hp) {
                    failedAttempts.set(clientIp, { count: 99, lockedUntil: Date.now() + (24 * 60 * 60 * 1000) });
                    purgeSpamFromIp(clientIp, 'Honeypot Trap Triggered');
                    logSecurity('BOT_HONEYPOT_BLOCKED', 'honeypot', req, `ตรวจพบบอทกรอกฟอร์ม (ติดกับดัก Honeypot: ${body.website_trap_hp}) บล็อก IP 24 ชม. และลบสแปมทันที`, 'CRITICAL');
                    return sendError(res, 403, 'ระบบตรวจพบพฤติกรรมอัตโนมัติ (Bot detected) การส่งข้อมูลถูกปฏิเสธ');
                }

                // 3. Fast Submission Time-Trap (< 1500ms)
                const formInitTime = parseInt(body.form_token_time, 10);
                if (formInitTime && (Date.now() - formInitTime < 1500)) {
                    failedAttempts.set(clientIp, { count: 99, lockedUntil: Date.now() + (6 * 60 * 60 * 1000) });
                    purgeSpamFromIp(clientIp, 'Fast Submission Time-trap');
                    logSecurity('FAST_SUBMISSION_BOT_BLOCKED', 'time-trap', req, `ตรวจพบบอทกรอกฟอร์มเร็วผิดปกติ (${Date.now() - formInitTime}ms) บล็อก IP 6 ชม. และลบสแปมทันที`, 'CRITICAL');
                    return sendError(res, 403, 'ระบบตรวจพบการส่งข้อมูลที่เร็วผิดปกติ การส่งข้อมูลถูกปฏิเสธ');
                }

                // 4. Rate-Limiting per IP (max 3 proposals per minute)
                const nowTime = Date.now();
                const timestamps = (proposalRateLimit.get(clientIp) || []).filter(t => nowTime - t < 60000);
                if (timestamps.length >= 3) {
                    failedAttempts.set(clientIp, { count: 99, lockedUntil: nowTime + (2 * 60 * 60 * 1000) });
                    purgeSpamFromIp(clientIp, 'Rate Limit Exceeded (>3 per min)');
                    logSecurity('RAPID_SPAM_FLOOD_BLOCKED', 'rate-limiter', req, `ตรวจพบการยิงส่งข้อมูลสแปมรัวเกินกำหนด (>3 ครั้ง/นาที) บล็อก IP 2 ชม. และลบสแปมทันที`, 'CRITICAL');
                    return sendError(res, 429, 'ท่านส่งคำขอบ่อยเกินไป ระบบระงับการส่งข้อมูลชั่วคราวเพื่อป้องกันสแปม');
                }
                timestamps.push(nowTime);
                proposalRateLimit.set(clientIp, timestamps);

                // 5. Content Heuristics & Link/Casino Spam Detection
                if (isSpamText(body.problem) || isSpamText(body.solution) || isSpamText(body.name) || isSpamText(body.location)) {
                    failedAttempts.set(clientIp, { count: 99, lockedUntil: nowTime + (24 * 60 * 60 * 1000) });
                    purgeSpamFromIp(clientIp, 'Malicious Keywords / Spam Links');
                    logSecurity('SPAM_KEYWORD_BLOCKED', 'content-filter', req, `ตรวจพบคำโฆษณา/ลิงก์สแปม/การพนัน บล็อก IP 24 ชม. และลบสแปมทันที`, 'CRITICAL');
                    return sendError(res, 403, 'ข้อความของท่านมีคำที่ไม่ได้รับอนุญาต หรือเข้าข่ายสแปมโฆษณา');
                }

                // 6. Duplicate spam check (identical problem within 5 minutes)
                const isDuplicate = state.proposals.some(p =>
                    p.problem && p.problem === body.problem &&
                    p.community === body.community &&
                    (nowTime - new Date(p.timestamp || nowTime).getTime() < 5 * 60 * 1000)
                );
                if (isDuplicate) {
                    logSecurity('DUPLICATE_SPAM_REJECTED', 'anti-spam', req, `ตรวจพบการส่งข้อเสนอซ้ำซ้อนในเวลาใกล้เคียงกัน`, 'WARN');
                    return sendError(res, 400, 'ตรวจพบข้อเสนอที่มีข้อความซ้ำกันเพิ่งส่งเข้ามาเมื่อสักครู่');
                }

                if (!body.community || !body.problem) {
                    return sendError(res, 400, 'กรุณาระบุชุมชนและรายละเอียดปัญหา');
                }

                const now = new Date();
                const yearTh = now.getFullYear() + 543;
                const nextId = state.proposals.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
                const code = `PRJ-${yearTh}-${String(nextId).padStart(3, '0')}`;

                // Process optional photo upload (stored cleanly in public/uploads/)
                const savedPhoto = saveUploadedPhoto(code, body.photo);

                const newProposal = {
                    id: nextId,
                    code: code,
                    timestamp: now.toISOString().replace('T', ' ').slice(0, 19),
                    community: body.community || '',
                    prefix: body.prefix || '',
                    name: body.name || '',
                    age: body.age ? parseInt(body.age, 10) : null,
                    phone: body.phone || '',
                    category: body.category || 'ด้านโครงสร้างพื้นฐาน (ถนน/ท่อระบายน้ำ/ไฟฟ้า)',
                    problem: body.problem || '',
                    solution: body.solution || '',
                    location: body.location || '',
                    photo: savedPhoto || null,
                    gps_lat: body.gps_lat ? String(body.gps_lat).slice(0, 20) : null,
                    gps_lng: body.gps_lng ? String(body.gps_lng).slice(0, 20) : null,
                    department: body.department || 'กองช่าง',
                    status: (body.status === 'รอดำเนินการ' || body.status === 'เข้าระบบแล้ว') ? 'เสนอเรื่องเข้ามา' : ((body.status === 'บรรจุในแผนชุมชน') ? 'บรรจุในแผน' : (body.status || 'เสนอเรื่องเข้ามา')),
                    reject_reason: body.reject_reason || body.notes || '',
                    pdpa_consent: body.pdpa_consent === true || body.pdpa_consent === 'true',
                    pdpa_timestamp: now.toISOString(),
                    notes: body.notes || body.reject_reason || '',
                    clientIp: clientIp,
                    updatedAt: now.toISOString()
                };

                state.proposals.unshift(newProposal);
                saveProposals();

                const user = getSessionUser(req);
                logSecurity('PROPOSAL_CREATE', user ? user.username : 'public_citizen', req, `สร้างข้อเสนอใหม่ ${code} ชุมชน ${newProposal.community} (รูป: ${savedPhoto ? 'มี' : 'ไม่มี'}, GPS: ${newProposal.gps_lat ? 'มี' : 'ไม่มี'})`);

                return sendJson(res, 201, { success: true, message: 'บันทึกข้อเสนอโครงการเรียบร้อยแล้ว', data: newProposal });
            }

            // PUT /api/proposals/:id (Update proposal - Staff/Admin)
            if (apiPath.startsWith('/proposals/') && req.method === 'PUT') {
                const currentUser = getSessionUser(req);
                if (!currentUser) return sendError(res, 401, 'กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล');

                const id = parseInt(apiPath.split('/')[2], 10);
                const index = state.proposals.findIndex(p => p.id === id);
                if (index === -1) return sendError(res, 404, 'ไม่พบข้อมูลที่ต้องการแก้ไข');

                const body = await parseBody(req);
                const existing = state.proposals[index];

                let updatedStatus = body.status !== undefined ? body.status : existing.status;
                if (updatedStatus === 'รอดำเนินการ' || updatedStatus === 'เข้าระบบแล้ว') updatedStatus = 'เสนอเรื่องเข้ามา';
                if (updatedStatus === 'บรรจุในแผนชุมชน') updatedStatus = 'บรรจุในแผน';

                const updatedRejectReason = body.reject_reason !== undefined ? body.reject_reason : (body.notes !== undefined ? body.notes : (existing.reject_reason || ''));

                let updatedPhoto = existing.photo;
                if (body.photo !== undefined) {
                    if (body.photo && body.photo.startsWith('data:image/')) {
                        updatedPhoto = saveUploadedPhoto(existing.code, body.photo);
                    } else {
                        updatedPhoto = body.photo;
                    }
                }

                state.proposals[index] = {
                    ...existing,
                    community: body.community !== undefined ? body.community : existing.community,
                    prefix: body.prefix !== undefined ? body.prefix : existing.prefix,
                    name: body.name !== undefined ? body.name : existing.name,
                    age: body.age !== undefined ? (body.age ? parseInt(body.age, 10) : null) : existing.age,
                    phone: body.phone !== undefined ? body.phone : existing.phone,
                    category: body.category !== undefined ? body.category : existing.category,
                    problem: body.problem !== undefined ? body.problem : existing.problem,
                    solution: body.solution !== undefined ? body.solution : existing.solution,
                    location: body.location !== undefined ? body.location : existing.location,
                    photo: updatedPhoto,
                    gps_lat: body.gps_lat !== undefined ? (body.gps_lat ? String(body.gps_lat).slice(0, 20) : null) : existing.gps_lat,
                    gps_lng: body.gps_lng !== undefined ? (body.gps_lng ? String(body.gps_lng).slice(0, 20) : null) : existing.gps_lng,
                    department: body.department !== undefined ? body.department : existing.department,
                    status: updatedStatus,
                    reject_reason: updatedRejectReason,
                    notes: body.notes !== undefined ? body.notes : updatedRejectReason,
                    updatedAt: new Date().toISOString()
                };

                saveProposals();
                logSecurity('PROPOSAL_UPDATE', currentUser.username, req, `แก้ไขข้อเสนอ ${existing.code} (สถานะ: ${state.proposals[index].status})`);

                return sendJson(res, 200, { success: true, message: 'แก้ไขข้อมูลสำเร็จ', data: state.proposals[index] });
            }

            // DELETE /api/proposals/:id (Admin only)
            if (apiPath.startsWith('/proposals/') && req.method === 'DELETE') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอสำหรับการลบข้อมูล');
                }

                const id = parseInt(apiPath.split('/')[2], 10);
                const index = state.proposals.findIndex(p => p.id === id);
                if (index === -1) return sendError(res, 404, 'ไม่พบข้อมูลที่ต้องการลบ');

                const deleted = state.proposals.splice(index, 1)[0];
                saveProposals();
                logSecurity('PROPOSAL_DELETE', currentUser.username, req, `ลบข้อเสนอโครงการ ${deleted.code} ชุมชน ${deleted.community}`);

                return sendJson(res, 200, { success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' });
            }

            // POST /api/proposals/bulk-status (Bulk change status)
            if (apiPath === '/proposals/bulk-status' && req.method === 'POST') {
                const currentUser = getSessionUser(req);
                if (!currentUser) return sendError(res, 401, 'กรุณาเข้าสู่ระบบ');

                const body = await parseBody(req);
                const { ids, status } = body;
                if (!Array.isArray(ids) || !status) {
                    return sendError(res, 400, 'ข้อมูลไม่ถูกต้อง');
                }

                let updatedCount = 0;
                state.proposals.forEach(p => {
                    if (ids.includes(p.id)) {
                        p.status = status;
                        p.updatedAt = new Date().toISOString();
                        updatedCount++;
                    }
                });

                if (updatedCount > 0) saveProposals();
                logSecurity('BULK_STATUS_UPDATE', currentUser.username, req, `เปลี่ยนสถานะ ${updatedCount} รายการเป็น: ${status}`);

                return sendJson(res, 200, { success: true, count: updatedCount, message: `อัปเดตสถานะสำเร็จ ${updatedCount} รายการ` });
            }

            // GET /api/news
            if (apiPath === '/news' && req.method === 'GET') {
                return sendJson(res, 200, { success: true, data: state.news });
            }

            // POST /api/news (Admin only)
            if (apiPath === '/news' && req.method === 'POST') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอ');
                }

                const body = await parseBody(req);
                const nextId = state.news.reduce((max, n) => Math.max(max, n.id || 0), 0) + 1;
                const newNews = {
                    id: nextId,
                    date: body.date || new Date().toISOString().split('T')[0],
                    title: body.title || '',
                    detail: body.detail || '',
                    published: body.published !== false,
                    createdAt: new Date().toISOString()
                };

                state.news.unshift(newNews);
                saveNews();
                logSecurity('NEWS_CREATE', currentUser.username, req, `เพิ่มข่าว/กำหนดการ: ${newNews.title}`);
                return sendJson(res, 201, { success: true, data: newNews });
            }

            // PUT /api/news/:id (Update News - Admin only)
            if (apiPath.startsWith('/news/') && req.method === 'PUT') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอ');
                }
                const id = parseInt(apiPath.split('/')[2], 10);
                const index = state.news.findIndex(n => n.id === id);
                if (index === -1) return sendError(res, 404, 'ไม่พบข่าวที่ต้องการแก้ไข');

                const body = await parseBody(req);
                state.news[index] = {
                    ...state.news[index],
                    date: body.date || state.news[index].date,
                    title: (body.title !== undefined) ? body.title : state.news[index].title,
                    detail: (body.detail !== undefined) ? body.detail : state.news[index].detail,
                    published: (body.published !== undefined) ? body.published : state.news[index].published,
                    updatedAt: new Date().toISOString()
                };
                saveNews();
                logSecurity('NEWS_UPDATE', currentUser.username, req, `แก้ไขข่าว/กำหนดการ: ${state.news[index].title}`);
                return sendJson(res, 200, { success: true, message: 'แก้ไขข่าวเรียบร้อยแล้ว', data: state.news[index] });
            }

            // DELETE /api/news/:id (Admin only)
            if (apiPath.startsWith('/news/') && req.method === 'DELETE') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอ');
                }
                const id = parseInt(apiPath.split('/')[2], 10);
                const index = state.news.findIndex(n => n.id === id);
                if (index === -1) return sendError(res, 404, 'ไม่พบข่าว');
                const deleted = state.news.splice(index, 1)[0];
                saveNews();
                logSecurity('NEWS_DELETE', currentUser.username, req, `ลบข่าว: ${deleted.title}`);
                return sendJson(res, 200, { success: true, message: 'ลบข่าวสำเร็จ' });
            }

            // ─── USER & ID MANAGEMENT ──────────────────────────────
            // GET /api/users (Admin only)
            if (apiPath === '/users' && req.method === 'GET') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอสำหรับดูรายชื่อผู้ใช้');
                }

                const safeUsers = state.users.map(u => ({
                    id: u.id,
                    username: u.username,
                    name: u.name,
                    role: u.role,
                    status: u.status,
                    createdAt: u.createdAt,
                    updatedAt: u.updatedAt
                }));
                return sendJson(res, 200, { success: true, data: safeUsers });
            }

            // POST /api/users (Admin only)
            if (apiPath === '/users' && req.method === 'POST') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอสร้างผู้ใช้');
                }

                const body = await parseBody(req);
                const { username, password, name, role } = body;
                if (!username || !password || !name) {
                    return sendError(res, 400, 'กรุณากรอกข้อมูลให้ครบถ้วน');
                }

                if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                    return sendError(res, 400, 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
                }

                const nextId = state.users.reduce((max, u) => Math.max(max, u.id || 0), 0) + 1;
                const newUser = {
                    id: nextId,
                    username: username.trim(),
                    name: name.trim(),
                    role: role || 'Officer',
                    password: password,
                    status: 'Active',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                state.users.push(newUser);
                saveUsers();
                logSecurity('USER_CREATE', currentUser.username, req, `สร้างผู้ใช้ใหม่: ${newUser.username} (${newUser.role})`);

                return sendJson(res, 201, {
                    success: true,
                    message: 'สร้างผู้ใช้ใหม่สำเร็จ',
                    data: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, status: newUser.status }
                });
            }

            // PUT /api/users/:id (Admin only)
            if (apiPath.startsWith('/users/') && req.method === 'PUT') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอแก้ไขผู้ใช้');
                }

                const id = parseInt(apiPath.split('/')[2], 10);
                const user = state.users.find(u => u.id === id);
                if (!user) return sendError(res, 404, 'ไม่พบผู้ใช้');

                if (id === 1 || user.username === MASTER_KEY || user.role === 'Super Admin') {
                    return sendError(res, 403, 'บัญชี Master Key เป็นรากฐานของระบบ ล็อกถาวร ไม่สามารถแก้ไขผ่านเว็บได้');
                }

                const body = await parseBody(req);
                if (body.username && body.username.trim() && id !== 1) {
                    const newUsername = body.username.trim();
                    const conflict = state.users.find(u => u.id !== id && u.username.toLowerCase() === newUsername.toLowerCase());
                    if (conflict) {
                        return sendError(res, 400, `ชื่อผู้ใช้งาน "${newUsername}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
                    }
                    user.username = newUsername;
                }
                if (body.name) user.name = body.name.trim();
                if (body.role) user.role = body.role;
                if (body.status) user.status = body.status;
                if (body.password) user.password = body.password;
                user.updatedAt = new Date().toISOString();

                saveUsers();
                logSecurity('USER_UPDATE', currentUser.username, req, `อัปเดตข้อมูลผู้ใช้: ${user.username}`);

                return sendJson(res, 200, { success: true, message: 'บันทึกข้อมูลผู้ใช้เรียบร้อย' });
            }

            // DELETE /api/users/:id (Admin only)
            if (apiPath.startsWith('/users/') && req.method === 'DELETE') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอลบผู้ใช้');
                }

                const id = parseInt(apiPath.split('/')[2], 10);
                if (id === 1 || id === currentUser.id) {
                    return sendError(res, 400, 'ไม่อนุญาตให้ลบบัญชี Master Key หรือบัญชีที่กำลังใช้งาน');
                }

                const index = state.users.findIndex(u => u.id === id);
                if (index === -1) return sendError(res, 404, 'ไม่พบผู้ใช้');

                const deleted = state.users.splice(index, 1)[0];
                saveUsers();
                logSecurity('USER_DELETE', currentUser.username, req, `ลบผู้ใช้: ${deleted.username}`);

                return sendJson(res, 200, { success: true, message: 'ลบผู้ใช้สำเร็จ' });
            }

            // GET /api/logs (Security audit trail)
            if (apiPath === '/logs' && req.method === 'GET') {
                const currentUser = getSessionUser(req);
                if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Super Admin')) {
                    return sendError(res, 403, 'สิทธิ์ไม่เพียงพอเข้าถึงบันทึกความปลอดภัย');
                }
                return sendJson(res, 200, { success: true, data: state.securityLogs.slice(0, 300) });
            }

            // DELETE /api/logs/:id (Delete single log)
            if (apiPath.startsWith('/logs/') && req.method === 'DELETE') {
                const currentUser = getSessionUser(req);
                if (!currentUser || currentUser.role !== 'Super Admin') {
                    return sendError(res, 403, 'สิทธิ์เฉพาะ Master Key เท่านั้น');
                }
                const id = parseInt(apiPath.split('/')[2], 10);
                const idx = state.securityLogs.findIndex(l => l.id === id);
                if (idx !== -1) {
                    state.securityLogs.splice(idx, 1);
                    saveSecurityLogs();
                }
                return sendJson(res, 200, { success: true, message: 'ลบรายการบันทึกสำเร็จ' });
            }

            // DELETE /api/logs (Clear all logs)
            if (apiPath === '/logs' && req.method === 'DELETE') {
                const currentUser = getSessionUser(req);
                if (!currentUser || currentUser.role !== 'Super Admin') {
                    return sendError(res, 403, 'สิทธิ์เฉพาะ Master Key เท่านั้น');
                }
                state.securityLogs = [];
                saveSecurityLogs();
                logSecurity('ALL_LOGS_CLEARED', 'masterkey', req, 'ล้างประวัติความปลอดภัยทั้งหมดโดยผู้ดูแลระบบ', 'WARN');
                return sendJson(res, 200, { success: true, message: 'ล้างประวัติความปลอดภัยเรียบร้อยแล้ว' });
            }

            // GET /api/security/banned-ips
            if (apiPath === '/security/banned-ips' && req.method === 'GET') {
                const bannedList = [];
                const now = Date.now();
                failedAttempts.forEach((info, ip) => {
                    if (info.lockedUntil && info.lockedUntil > now) {
                        bannedList.push({
                            ip: ip,
                            remainingMinutes: Math.ceil((info.lockedUntil - now) / 60000),
                            count: info.count
                        });
                    }
                });
                return sendJson(res, 200, { success: true, bannedIps: bannedList });
            }

            // POST /api/security/unban
            if (apiPath === '/security/unban' && req.method === 'POST') {
                const currentUser = getSessionUser(req);
                if (!currentUser || currentUser.role !== 'Super Admin') {
                    return sendError(res, 403, 'สิทธิ์เฉพาะ Master Key เท่านั้น');
                }
                const body = await parseBody(req);
                const { ip } = body;
                if (ip && failedAttempts.has(ip)) {
                    failedAttempts.delete(ip);
                    logSecurity('IP_UNBANNED', 'masterkey', req, `ปลดล็อก IP: ${ip} สำเร็จ`, 'INFO');
                }
                return sendJson(res, 200, { success: true, message: `ปลดล็อก IP ${ip} เรียบร้อยแล้ว` });
            }

            return sendError(res, 404, `Endpoint ${apiPath} not found`);
        }

        // ─── STATIC PAGE ROUTING ─────────────────────────────────
        // Support friendly URL aliases:
        // / -> index.html
        // /manage -> manage.html
        // /back -> back.html
        // /print -> print.html
        let filePath = '';
        if (normalizedPath === '/' || normalizedPath === '') {
            filePath = path.join(PUBLIC_DIR, 'index.html');
        } else if (normalizedPath === '/manage') {
            filePath = path.join(PUBLIC_DIR, 'manage.html');
        } else if (normalizedPath === '/back') {
            filePath = path.join(PUBLIC_DIR, 'back.html');
        } else if (normalizedPath === '/print') {
            filePath = path.join(PUBLIC_DIR, 'print.html');
        } else {
            filePath = path.join(PUBLIC_DIR, normalizedPath);
        }

        // Security check: ensure filePath is within PUBLIC_DIR
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(PUBLIC_DIR)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Access Denied');
        }

        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
            const ext = path.extname(resolvedPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            const stream = fs.createReadStream(resolvedPath);
            return stream.pipe(res);
        }

        // Fallback: 404 Not Found
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html lang="th">
            <head><meta charset="utf-8"><title>404 ไม่พบหน้านี้ — SALA CONNECT</title>
            <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8fafc;color:#1e293b}a{color:#4f46e5;text-decoration:none;font-weight:bold}</style>
            </head>
            <body>
            <h1>404 ไม่พบหน้านี้</h1>
            <p>ไม่พบหน้าที่คุณเรียกหา: <code>${pathname}</code></p>
            <p><a href="/sala">กลับสู่หน้าหลัก /sala</a></p>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
    }
});

// Start Server
loadData();
server.listen(PORT, '0.0.0.0', () => {
    console.log('============================================================');
    console.log(`🏛️ MAESAI SALA CONNECT — Engine Started`);
    console.log(`Port: ${PORT}`);
    console.log(`Main Web:     http://localhost:${PORT}/sala`);
    console.log(`Management:   http://localhost:${PORT}/sala/manage`);
    console.log(`ID/Back:      http://localhost:${PORT}/sala/back`);
    console.log(`Print:        http://localhost:${PORT}/sala/print`);
    console.log(`API Health:   http://localhost:${PORT}/sala/api/health`);
    console.log('============================================================');
});

