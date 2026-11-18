const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, PORT, getAllowedOrigins } = require('../config.cjs');
const { parseBody, sendJson, sendError, escapeHtml } = require('../utils/core.cjs');
const {
  getClientIp,
  isIpBanned,
  recordSweepHit,
  isSensitiveProbe,
  logSecurity,
  getSecurityLogs,
  clearSecurityLogs,
  deleteSecurityLogById,
  getBannedIpsList,
  unbanIpAddress
} = require('../security/radar.cjs');
const {
  getSessionUser,
  isAdminOrSuper,
  isSuperAdmin,
  handleLogin,
  handleMasterLogin,
  handleLogout,
  handleMe
} = require('../auth/auth.cjs');
const {
  handleGetUsers,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser
} = require('../users/userService.cjs');
const {
  getProposalCount,
  handleGetStats,
  handleGetProposals,
  handleGetSingleProposal,
  handleCreateProposal,
  handleUpdateProposal,
  handleDeleteProposal,
  handleBulkStatus,
  handleGetNews,
  handleCreateNews,
  handleUpdateNews,
  handleDeleteNews,
  handleGetSettings,
  handleSaveSettings
} = require('../proposals/proposalService.cjs');

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

function applyCorsHeaders(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function requireAuthUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendError(res, 401, 'กรุณาเข้าสู่ระบบก่อนทำรายการ');
    return null;
  }
  return user;
}

function requireAdminUser(req, res) {
  const user = requireAuthUser(req, res);
  if (!user) return null;
  if (!isAdminOrSuper(user)) {
    sendError(res, 403, 'สิทธิ์ไม่เพียงพอ');
    return null;
  }
  return user;
}

function requireSuperAdminUser(req, res) {
  const user = requireAuthUser(req, res);
  if (!user) return null;
  if (!isSuperAdmin(user)) {
    sendError(res, 403, 'ระดับ Admin ไม่มีสิทธิ์เข้าถึงส่วนนี้ (เฉพาะผู้ถือ Master Key เท่านั้น)');
    return null;
  }
  return user;
}

async function handleRequest(req, res) {
  const allowedOrigins = getAllowedOrigins();
  applyCorsHeaders(req, res, allowedOrigins);

  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    res.writeHead(origin && !allowedOrigins.includes(origin) ? 403 : 204);
    return res.end();
  }

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1:' + PORT}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    let normalizedPath = pathname;
    if (normalizedPath === '/sala' || normalizedPath === '/sala/') {
      normalizedPath = '/';
    } else if (normalizedPath.startsWith('/sala/')) {
      normalizedPath = normalizedPath.slice(5);
    }

    const clientIp = getClientIp(req);
    const ext = path.extname(normalizedPath).toLowerCase();
    const isStaticExt = ['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext);

    res.on('finish', () => {
      if (!isStaticExt && (res.statusCode === 404 || res.statusCode === 401)) {
        recordSweepHit(clientIp, normalizedPath, res.statusCode, req);
      }
    });

    if (normalizedPath.toLowerCase().endsWith('security.txt')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end("Contact: mailto:admin@maesaios.com\nExpires: 2027-12-31T23:59:59.000Z\nPreferred-Languages: th, en\nCanonical: https://maesaios.com/.well-known/security.txt\nPolicy: https://maesaios.com/\n");
    }

    const ban = isIpBanned(clientIp);
    if (ban.banned && ban.reason === 'SWEEP_404_401' && !normalizedPath.startsWith('/api/security/')) {
      return sendError(res, 429, `ตรวจพบการสแกนระบบผิดปกติ ระบบระงับ IP ชั่วคราว 15 นาที (404/401 Sweep Shield)`);
    }

    if (isSensitiveProbe(normalizedPath)) {
      logSecurity('BLOCKED_PROBE', 'probe-shield', req, `ตรวจพบการพยายามเจาะดูไฟล์ระบบ: ${normalizedPath}`, 'CRITICAL');
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden: Restricted system resource');
    }

    // API Routes
    if (normalizedPath.startsWith('/api/')) {
      const apiPath = normalizedPath.slice(4);

      if (apiPath === '/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          appName: 'SALA CONNECT',
          version: '4.0.0',
          port: PORT,
          status: 'OK',
          uptime: process.uptime(),
          proposalsCount: getProposalCount(),
          timestamp: new Date().toISOString()
        });
      }

      if (apiPath === '/settings' && req.method === 'GET') return handleGetSettings(req, res);
      if (apiPath === '/settings' && req.method === 'POST') {
        const u = requireAdminUser(req, res);
        if (!u) return;
        return handleSaveSettings(req, res, u);
      }

      if (apiPath === '/auth/login' && req.method === 'POST') return handleLogin(req, res);
      if (apiPath === '/auth/master-login' && req.method === 'POST') return handleMasterLogin(req, res);
      if (apiPath === '/auth/logout' && req.method === 'POST') return handleLogout(req, res);
      if (apiPath === '/auth/me' && req.method === 'GET') return handleMe(req, res);

      if (apiPath === '/stats' && req.method === 'GET') return handleGetStats(req, res);

      if (apiPath === '/proposals' && req.method === 'GET') {
        return handleGetProposals(req, res, parsedUrl, getSessionUser(req));
      }
      if (apiPath.startsWith('/proposals/') && req.method === 'GET') {
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleGetSingleProposal(req, res, id, getSessionUser(req));
      }
      if (apiPath === '/proposals' && req.method === 'POST') {
        return handleCreateProposal(req, res, getSessionUser(req));
      }
      if (apiPath.startsWith('/proposals/') && req.method === 'PUT') {
        const u = requireAuthUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleUpdateProposal(req, res, u, id);
      }
      if (apiPath.startsWith('/proposals/') && req.method === 'DELETE') {
        const u = requireAdminUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleDeleteProposal(req, res, u, id);
      }
      if (apiPath === '/proposals/bulk-status' && req.method === 'POST') {
        const u = requireAuthUser(req, res);
        if (!u) return;
        return handleBulkStatus(req, res, u);
      }

      if (apiPath === '/news' && req.method === 'GET') return handleGetNews(req, res);
      if (apiPath === '/news' && req.method === 'POST') {
        const u = requireAdminUser(req, res);
        if (!u) return;
        return handleCreateNews(req, res, u);
      }
      if (apiPath.startsWith('/news/') && req.method === 'PUT') {
        const u = requireAdminUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleUpdateNews(req, res, u, id);
      }
      if (apiPath.startsWith('/news/') && req.method === 'DELETE') {
        const u = requireAdminUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleDeleteNews(req, res, u, id);
      }

      // User & ID Management (DEC-027: Super Admin ONLY)
      if (apiPath === '/users' && req.method === 'GET') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        return handleGetUsers(req, res);
      }
      if (apiPath === '/users' && req.method === 'POST') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        return handleCreateUser(req, res, u);
      }
      if (apiPath.startsWith('/users/') && req.method === 'PUT') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleUpdateUser(req, res, u, id);
      }
      if (apiPath.startsWith('/users/') && req.method === 'DELETE') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        return handleDeleteUser(req, res, u, id);
      }

      // Security Radar Logs (DEC-027: Super Admin ONLY)
      if (apiPath === '/logs' && req.method === 'GET') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        return sendJson(res, 200, { success: true, data: getSecurityLogs().slice(0, 300) });
      }
      if (apiPath.startsWith('/logs/') && req.method === 'DELETE') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        const id = parseInt(apiPath.split('/')[2], 10);
        deleteSecurityLogById(id);
        return sendJson(res, 200, { success: true, message: 'ลบรายการบันทึกสำเร็จ' });
      }
      if (apiPath === '/logs' && req.method === 'DELETE') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        clearSecurityLogs(req);
        return sendJson(res, 200, { success: true, message: 'ล้างประวัติความปลอดภัยเรียบร้อยแล้ว' });
      }
      if (apiPath === '/security/banned-ips' && req.method === 'GET') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        return sendJson(res, 200, { success: true, bannedIps: getBannedIpsList() });
      }
      if (apiPath === '/security/unban' && req.method === 'POST') {
        const u = requireSuperAdminUser(req, res);
        if (!u) return;
        const body = await parseBody(req);
        unbanIpAddress(body.ip, req);
        return sendJson(res, 200, { success: true, message: `ปลดล็อก IP ${body.ip || ''} เรียบร้อยแล้ว` });
      }

      return sendError(res, 404, `Endpoint ${apiPath} not found`);
    }

    // Static Page Routing
    const publicRoot = path.resolve(PUBLIC_DIR);
    let filePath = '';
    if (normalizedPath === '/' || normalizedPath === '') {
      filePath = path.join(publicRoot, 'index.html');
    } else if (normalizedPath === '/manage') {
      filePath = path.join(publicRoot, 'manage.html');
    } else if (normalizedPath === '/back') {
      filePath = path.join(publicRoot, 'back.html');
    } else if (normalizedPath === '/print') {
      filePath = path.join(publicRoot, 'print.html');
    } else {
      const cleanRel = normalizedPath.replace(/^\/+/, '');
      filePath = path.resolve(publicRoot, cleanRel);
    }

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(publicRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Access Denied');
    }

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      const fExt = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[fExt] || 'application/octet-stream';
      const isDynamic = ['.html', '.js', '.css'].includes(fExt);
      const headers = { 'Content-Type': contentType };
      if (isDynamic) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      }
      res.writeHead(200, headers);
      return fs.createReadStream(resolvedPath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>404 ไม่พบหน้านี้ — SALA CONNECT</title></head><body style="font-family:sans-serif;text-align:center;padding:50px"><h1>404 ไม่พบหน้านี้</h1><p>ไม่พบหน้าที่คุณเรียกหา: <code>${escapeHtml(pathname)}</code></p><p><a href="/sala">กลับสู่หน้าหลัก /sala</a></p></body></html>`);
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
  }
}

module.exports = { handleRequest };
