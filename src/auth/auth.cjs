const crypto = require('crypto');
const { getMasterCredentials, getHmacSecret } = require('../config.cjs');
const { timingSafeMatch, verifyPassword, parseBody, sendJson, sendError } = require('../utils/core.cjs');
const { getClientIp, checkLoginRateLimit, recordFailedLogin, recordSuccessfulLogin, logSecurity } = require('../security/radar.cjs');
const { getUsers, isSuperAdminUser } = require('../users/userService.cjs');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const revokedTokens = new Set();

function signSessionToken(userObj) {
  const payloadObj = {
    id: userObj.id,
    u: userObj.username,
    n: userObj.name,
    r: userObj.role,
    m: Boolean(userObj.is_master),
    jti: crypto.randomBytes(8).toString('hex'),
    exp: Date.now() + SESSION_TTL_MS
  };
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getHmacSecret('sala_session_v1')).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  if (revokedTokens.has(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sigHex] = parts;
  const expectedHex = crypto.createHmac('sha256', getHmacSecret('sala_session_v1')).update(payload).digest('hex');
  if (!timingSafeMatch(sigHex, expectedHex)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed && typeof parsed.exp === 'number' && Date.now() <= parsed.exp && parsed.u) {
      return {
        id: parsed.id,
        username: parsed.u,
        name: parsed.n || parsed.u,
        role: parsed.r || 'Officer',
        is_master: Boolean(parsed.m)
      };
    }
  } catch (_) {}
  return null;
}

function extractToken(req) {
  const authHeader = String(req.headers['authorization'] || '');
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookie = String(req.headers['cookie'] || '');
  const match = cookie.match(/sala_token=([^;\s]+)/);
  return match ? match[1] : '';
}

function getSessionUser(req) {
  return verifySessionToken(extractToken(req));
}

function isAdminOrSuper(user) {
  if (!user) return false;
  const r = String(user.role || '').toLowerCase();
  return Boolean(user.is_master || r === 'admin' || r === 'super admin' || r === 'superadmin');
}

function isSuperAdmin(user) {
  if (!user) return false;
  return isSuperAdminUser(user);
}

function matchStaffAccount(username, password) {
  const cleanUser = String(username || '').trim();
  const uLower = cleanUser.toLowerCase();
  const users = getUsers();
  return users.find(u =>
    (
      (u.username && u.username.toLowerCase() === uLower) ||
      (u.name && u.name.trim().toLowerCase() === uLower) ||
      (u.name && u.name.trim() === cleanUser)
    ) &&
    verifyPassword(password, u.password)
  );
}

async function handleLogin(req, res) {
  const clientIp = getClientIp(req);
  const body = await parseBody(req);
  const { username, password } = body;
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();

  const rateCheck = checkLoginRateLimit(clientIp, cleanUser);
  if (!rateCheck.allowed) {
    logSecurity('BRUTE_FORCE_BLOCKED', cleanUser || 'login', req, `IP ถูกระงับชั่วคราว เหลือ ${rateCheck.remainingMinutes} นาที`, 'CRITICAL');
    return sendError(res, 429, `IP ของท่านถูกระงับชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกินกำหนด กรุณารอ ${rateCheck.remainingMinutes} นาที`);
  }

  if (!cleanUser || !cleanPass) {
    return sendError(res, 400, 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน');
  }

  let matchedUser = null;
  const { masterKey, masterPassword, configured } = getMasterCredentials();
  if (configured && (cleanUser.toLowerCase() === masterKey.toLowerCase() || cleanUser.toLowerCase() === 'thedatazero') && timingSafeMatch(cleanPass, masterPassword)) {
    matchedUser = {
      id: 0,
      username: masterKey,
      name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
      role: 'Super Admin',
      is_master: true,
      status: 'Active'
    };
  } else {
    matchedUser = matchStaffAccount(cleanUser, cleanPass);
  }

  if (!matchedUser) {
    recordFailedLogin(clientIp, cleanUser, req);
    logSecurity('LOGIN_FAILED', cleanUser, req, 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง', 'WARN');
    return sendError(res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  if (matchedUser.status === 'Disabled') {
    logSecurity('LOGIN_BLOCKED', cleanUser, req, 'บัญชีถูกระงับการใช้งาน', 'WARN');
    return sendError(res, 403, 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }

  recordSuccessfulLogin(clientIp, cleanUser);
  const token = signSessionToken(matchedUser);
  logSecurity('LOGIN_SUCCESS', matchedUser.username, req, `เข้าสู่ระบบสำเร็จในบทบาท ${matchedUser.role}`);

  return sendJson(res, 200, {
    success: true,
    token,
    user: {
      id: matchedUser.id,
      username: matchedUser.username,
      name: matchedUser.name,
      role: matchedUser.role,
      is_master: Boolean(matchedUser.is_master)
    }
  });
}

async function handleMasterLogin(req, res) {
  const clientIp = getClientIp(req);
  const body = await parseBody(req);
  const username = String(body.username || body.master_key || body.masterKey || '').trim();
  const password = String(body.password || body.master_password || body.masterPassword || '').trim();

  const rateCheck = checkLoginRateLimit(clientIp, username || 'masterkey');
  if (!rateCheck.allowed) {
    logSecurity('BRUTE_FORCE_BLOCKED', 'masterkey', req, `IP ถูกระงับชั่วคราว เหลือ ${rateCheck.remainingMinutes} นาที`, 'CRITICAL');
    return sendError(res, 429, `IP ของท่านถูกระงับชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกินกำหนด กรุณารอ ${rateCheck.remainingMinutes} นาที`);
  }

  if (!username || !password) {
    return sendError(res, 400, 'กรุณาระบุชื่อผู้ใช้งานและรหัสผ่าน Master Key');
  }

  const uLower = username.toLowerCase();
  const { masterKey, masterPassword, configured } = getMasterCredentials();
  const isMasterKeyMatch = configured && (uLower === masterKey.toLowerCase() || uLower === 'thedatazero') && timingSafeMatch(password, masterPassword);

  let matchedAdminUser = null;
  if (!isMasterKeyMatch) {
    const matchedStaff = matchStaffAccount(username, password);
    if (matchedStaff && !isSuperAdminUser(matchedStaff)) {
      logSecurity('UNAUTHORIZED_BACK_OFFICE_ATTEMPT', username, req, `บัญชี [${username}] ระดับ ${matchedStaff.role} พยายามเข้าสู่ระบบหลังบ้าน sala/back แต่ถูกปฏิเสธ (DEC-027)`, 'WARN');
      return sendError(res, 403, 'ระดับ Admin ไม่มีสิทธิ์เข้าถึง sala/back (เฉพาะผู้ถือ Master Key เท่านั้น)');
    }
    if (matchedStaff && isSuperAdminUser(matchedStaff) && matchedStaff.status !== 'Disabled') {
      matchedAdminUser = matchedStaff;
    }
  }

  if (isMasterKeyMatch || matchedAdminUser) {
    recordSuccessfulLogin(clientIp, username);
    const userObj = matchedAdminUser ? {
      id: matchedAdminUser.id,
      username: matchedAdminUser.username,
      name: matchedAdminUser.name,
      role: matchedAdminUser.role,
      is_master: Boolean(matchedAdminUser.is_master)
    } : {
      id: 0,
      username: masterKey,
      name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
      role: 'Super Admin',
      is_master: true
    };
    const token = signSessionToken(userObj);
    logSecurity('MASTER_LOGIN_SUCCESS', userObj.username, req, `เข้าสู่ระบบความปลอดภัยสำเร็จ (${userObj.role})`, 'INFO');
    return sendJson(res, 200, { success: true, token, user: userObj });
  }

  const fail = recordFailedLogin(clientIp, username, req);
  if (fail.locked) {
    logSecurity('ANTI_BRUTE_FORCE_TRIGGERED', username, req, `ใส่ Master Key ผิด ${fail.count} ครั้ง ถูกระงับ 15 นาที`, 'CRITICAL');
  } else {
    logSecurity('MASTER_LOGIN_FAILED', username, req, `ใส่ Master Key ไม่ถูกต้อง (ครั้งที่ ${fail.count}/${fail.maxAllowed})`, 'WARN');
  }
  return sendError(res, 401, 'ชื่อผู้ใช้งานหรือรหัสผ่าน Master Key ไม่ถูกต้อง');
}

function handleLogout(req, res) {
  const token = extractToken(req);
  const user = verifySessionToken(token);
  if (token) revokedTokens.add(token);
  if (user) logSecurity('LOGOUT', user.username, req, 'ออกจากระบบ');
  return sendJson(res, 200, { success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
}

function handleMe(req, res) {
  const user = getSessionUser(req);
  if (!user) return sendError(res, 401, 'ยังไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ');
  return sendJson(res, 200, { success: true, user });
}

function resetAuthStateForTests() {
  revokedTokens.clear();
}

module.exports = {
  signSessionToken,
  verifySessionToken,
  getSessionUser,
  isAdminOrSuper,
  isSuperAdmin,
  handleLogin,
  handleMasterLogin,
  handleLogout,
  handleMe,
  resetAuthStateForTests
};
