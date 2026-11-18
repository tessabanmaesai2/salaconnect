const fs = require('fs');
const path = require('path');
const { PROPOSALS_FILE, SETTINGS_FILE, NEWS_FILE, BACKUPS_DIR } = require('../config.cjs');
const { atomicSave, readJsonFile, parseBody, sendJson, sendError } = require('../utils/core.cjs');
const { getClientIp, logSecurity, isIpBanned, banIp, checkProposalRateLimit, isSpamText } = require('../security/radar.cjs');
const { saveUploadedPhoto } = require('./uploadService.cjs');

let state = {
  proposals: [],
  settings: {},
  news: []
};

function loadProposalData(usersList = []) {
  state.proposals = readJsonFile(PROPOSALS_FILE, []);
  if (!Array.isArray(state.proposals)) state.proposals = [];
  state.settings = readJsonFile(SETTINGS_FILE, {});
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  state.news = readJsonFile(NEWS_FILE, []);
  if (!Array.isArray(state.news)) state.news = [];
  createDailyBackup(usersList);
}

function saveProposals() { return atomicSave(PROPOSALS_FILE, state.proposals); }
function saveSettings() { return atomicSave(SETTINGS_FILE, state.settings); }
function saveNews() { return atomicSave(NEWS_FILE, state.news); }

function createDailyBackup(usersList = []) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const backupPath = path.join(BACKUPS_DIR, `sala_backup_${today}.json`);
    if (!fs.existsSync(backupPath)) {
      const backupPayload = {
        timestamp: new Date().toISOString(),
        proposals: state.proposals,
        users: usersList.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, status: u.status })),
        settings: state.settings,
        news: state.news
      };
      fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('[BACKUP] Failed daily backup:', e.message);
  }
}

function purgeSpamFromIp(ip, reason) {
  const before = state.proposals.length;
  state.proposals = state.proposals.filter(p => p.clientIp !== ip && !isSpamText(p.problem) && !isSpamText(p.solution));
  const removed = before - state.proposals.length;
  if (removed > 0) {
    saveProposals();
    logSecurity('SPAM_AUTO_PURGED', 'anti-bot-engine', null, `ตรวจพบสแปม! ลบข้อเสนอขยะทิ้งอัตโนมัติ ${removed} รายการ (${reason || 'Spam IP Purged'})`, 'CRITICAL');
  }
}

function maskPublicProposal(p) {
  return {
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
  };
}

function handleGetStats(req, res) {
  const stats = {
    total: state.proposals.length,
    byStatus: {},
    byCommunity: {},
    byCategory: {},
    totalBudget: 0
  };
  (state.settings.statuses || []).forEach(s => { stats.byStatus[s] = 0; });
  (state.settings.communities || []).forEach(c => { stats.byCommunity[c] = 0; });

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

  return sendJson(res, 200, { success: true, stats });
}

function handleGetProposals(req, res, parsedUrl, sessionUser) {
  const communityFilter = parsedUrl.searchParams.get('community');
  const statusFilter = parsedUrl.searchParams.get('status');
  const categoryFilter = parsedUrl.searchParams.get('category');
  const search = parsedUrl.searchParams.get('search');
  const forcePublicMask = parsedUrl.searchParams.get('public') === 'true' || !sessionUser;

  let results = [...state.proposals];
  if (communityFilter && communityFilter !== 'all') results = results.filter(p => p.community === communityFilter);
  if (statusFilter && statusFilter !== 'all') results = results.filter(p => p.status === statusFilter);
  if (categoryFilter && categoryFilter !== 'all') results = results.filter(p => p.category === categoryFilter);
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(p =>
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.problem && p.problem.toLowerCase().includes(q)) ||
      (p.solution && p.solution.toLowerCase().includes(q)) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (!forcePublicMask && p.name && p.name.toLowerCase().includes(q)) ||
      (p.community && p.community.toLowerCase().includes(q))
    );
  }

  if (forcePublicMask) {
    results = results.map(maskPublicProposal);
  }
  return sendJson(res, 200, { success: true, count: results.length, data: results });
}

function handleGetSingleProposal(req, res, id, sessionUser) {
  const proposal = state.proposals.find(p => p.id === id);
  if (!proposal) return sendError(res, 404, 'ไม่พบข้อมูลข้อเสนอโครงการ');
  const data = sessionUser ? proposal : maskPublicProposal(proposal);
  return sendJson(res, 200, { success: true, data });
}

async function handleCreateProposal(req, res, sessionUser) {
  const clientIp = getClientIp(req);
  const ban = isIpBanned(clientIp);
  if (ban.banned) {
    logSecurity('BOT_REQUEST_REJECTED', 'bot-shield', req, `บล็อกการส่งข้อมูลจาก IP ที่ถูกระงับ (เหลือ ${ban.remainingMinutes} นาที)`, 'CRITICAL');
    return sendError(res, 403, `IP ของท่านถูกระงับการส่งข้อเสนอเนื่องจากตรวจพบพฤติกรรมผิดปกติ กรุณารอ ${ban.remainingMinutes} นาที`);
  }

  const body = await parseBody(req);

  if (body.website_trap_hp) {
    banIp(clientIp, 24 * 60 * 60 * 1000, 'HONEYPOT');
    purgeSpamFromIp(clientIp, 'Honeypot Trap Triggered');
    logSecurity('BOT_HONEYPOT_BLOCKED', 'honeypot', req, `ตรวจพบบอทกรอกฟอร์ม (${body.website_trap_hp}) บล็อก IP 24 ชม.`, 'CRITICAL');
    return sendError(res, 403, 'ระบบตรวจพบพฤติกรรมอัตโนมัติ (Bot detected) การส่งข้อมูลถูกปฏิเสธ');
  }

  const formInitTime = parseInt(body.form_token_time, 10);
  if (formInitTime && (Date.now() - formInitTime < 1500)) {
    banIp(clientIp, 6 * 60 * 60 * 1000, 'FAST_SUBMIT');
    purgeSpamFromIp(clientIp, 'Fast Submission Time-trap');
    logSecurity('FAST_SUBMISSION_BOT_BLOCKED', 'time-trap', req, `ตรวจพบบอทกรอกฟอร์มเร็วผิดปกติ (${Date.now() - formInitTime}ms)`, 'CRITICAL');
    return sendError(res, 403, 'ระบบตรวจพบการส่งข้อมูลที่เร็วผิดปกติ การส่งข้อมูลถูกปฏิเสธ');
  }

  if (!checkProposalRateLimit(clientIp)) {
    banIp(clientIp, 2 * 60 * 60 * 1000, 'PROPOSAL_FLOOD');
    purgeSpamFromIp(clientIp, 'Rate Limit Exceeded (>3 per min)');
    logSecurity('RAPID_SPAM_FLOOD_BLOCKED', 'rate-limiter', req, 'ตรวจพบการยิงส่งข้อมูลสแปมรัวเกินกำหนด (>3 ครั้ง/นาที)', 'CRITICAL');
    return sendError(res, 429, 'ท่านส่งคำขอบ่อยเกินไป ระบบระงับการส่งข้อมูลชั่วคราวเพื่อป้องกันสแปม');
  }

  if (isSpamText(body.problem) || isSpamText(body.solution) || isSpamText(body.name) || isSpamText(body.location)) {
    banIp(clientIp, 24 * 60 * 60 * 1000, 'SPAM_KEYWORD');
    purgeSpamFromIp(clientIp, 'Malicious Keywords / Spam Links');
    logSecurity('SPAM_KEYWORD_BLOCKED', 'content-filter', req, 'ตรวจพบคำโฆษณา/ลิงก์สแปม/การพนัน บล็อก IP 24 ชม.', 'CRITICAL');
    return sendError(res, 403, 'ข้อความของท่านมีคำที่ไม่ได้รับอนุญาต หรือเข้าข่ายสแปมโฆษณา');
  }

  const nowTime = Date.now();
  const isDuplicate = state.proposals.some(p =>
    p.problem && p.problem === body.problem &&
    p.community === body.community &&
    (nowTime - new Date(p.timestamp || nowTime).getTime() < 5 * 60 * 1000)
  );
  if (isDuplicate) {
    logSecurity('DUPLICATE_SPAM_REJECTED', 'anti-spam', req, 'ตรวจพบการส่งข้อเสนอซ้ำซ้อนในเวลาใกล้เคียงกัน', 'WARN');
    return sendError(res, 400, 'ตรวจพบข้อเสนอที่มีข้อความซ้ำกันเพิ่งส่งเข้ามาเมื่อสักครู่');
  }

  if (!body.community || !body.problem) {
    return sendError(res, 400, 'กรุณาระบุชุมชนและรายละเอียดปัญหา');
  }

  const now = new Date();
  const yearTh = now.getFullYear() + 543;
  const nextId = state.proposals.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
  const code = `PRJ-${yearTh}-${String(nextId).padStart(3, '0')}`;

  let savedPhoto = null;
  if (body.photo) {
    try {
      savedPhoto = saveUploadedPhoto(code, body.photo);
    } catch (e) {
      return sendError(res, 400, e.message || 'ไฟล์รูปภาพไม่ถูกต้อง');
    }
  }

  const newProposal = {
    id: nextId,
    code,
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
    clientIp,
    updatedAt: now.toISOString()
  };

  state.proposals.unshift(newProposal);
  saveProposals();
  logSecurity('PROPOSAL_CREATE', sessionUser ? sessionUser.username : 'public_citizen', req, `สร้างข้อเสนอใหม่ ${code} ชุมชน ${newProposal.community}`);
  return sendJson(res, 201, { success: true, message: 'บันทึกข้อเสนอโครงการเรียบร้อยแล้ว', data: sessionUser ? newProposal : maskPublicProposal(newProposal) });
}

async function handleUpdateProposal(req, res, currentUser, id) {
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
    if (body.photo && String(body.photo).startsWith('data:image/')) {
      try {
        updatedPhoto = saveUploadedPhoto(existing.code, body.photo);
      } catch (e) {
        return sendError(res, 400, e.message || 'ไฟล์รูปภาพไม่ถูกต้อง');
      }
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

function handleDeleteProposal(req, res, currentUser, id) {
  const index = state.proposals.findIndex(p => p.id === id);
  if (index === -1) return sendError(res, 404, 'ไม่พบข้อมูลที่ต้องการลบ');
  const deleted = state.proposals.splice(index, 1)[0];
  saveProposals();
  logSecurity('PROPOSAL_DELETE', currentUser.username, req, `ลบข้อเสนอโครงการ ${deleted.code} ชุมชน ${deleted.community}`);
  return sendJson(res, 200, { success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' });
}

async function handleBulkStatus(req, res, currentUser) {
  const body = await parseBody(req);
  const { ids, status } = body;
  if (!Array.isArray(ids) || !status) return sendError(res, 400, 'ข้อมูลไม่ถูกต้อง');
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

function handleGetNews(req, res) {
  return sendJson(res, 200, { success: true, data: state.news });
}

async function handleCreateNews(req, res, currentUser) {
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

async function handleUpdateNews(req, res, currentUser, id) {
  const index = state.news.findIndex(n => n.id === id);
  if (index === -1) return sendError(res, 404, 'ไม่พบข่าวที่ต้องการแก้ไข');
  const body = await parseBody(req);
  state.news[index] = {
    ...state.news[index],
    date: body.date || state.news[index].date,
    title: body.title !== undefined ? body.title : state.news[index].title,
    detail: body.detail !== undefined ? body.detail : state.news[index].detail,
    published: body.published !== undefined ? body.published : state.news[index].published,
    updatedAt: new Date().toISOString()
  };
  saveNews();
  logSecurity('NEWS_UPDATE', currentUser.username, req, `แก้ไขข่าว/กำหนดการ: ${state.news[index].title}`);
  return sendJson(res, 200, { success: true, message: 'แก้ไขข่าวเรียบร้อยแล้ว', data: state.news[index] });
}

function handleDeleteNews(req, res, currentUser, id) {
  const index = state.news.findIndex(n => n.id === id);
  if (index === -1) return sendError(res, 404, 'ไม่พบข่าว');
  const deleted = state.news.splice(index, 1)[0];
  saveNews();
  logSecurity('NEWS_DELETE', currentUser.username, req, `ลบข่าว: ${deleted.title}`);
  return sendJson(res, 200, { success: true, message: 'ลบข่าวสำเร็จ' });
}

function handleGetSettings(req, res) {
  return sendJson(res, 200, { success: true, settings: state.settings });
}

async function handleSaveSettings(req, res, currentUser) {
  const body = await parseBody(req);
  state.settings = { ...state.settings, ...body, updatedAt: new Date().toISOString() };
  saveSettings();
  logSecurity('SETTINGS_UPDATE', currentUser.username, req, 'อัปเดตการตั้งค่าระบบ');
  return sendJson(res, 200, { success: true, settings: state.settings });
}

function getProposalCount() {
  return state.proposals.length;
}

function resetProposalStateForTests() {
  state = { proposals: [], settings: {}, news: [] };
}

module.exports = {
  loadProposalData,
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
  handleSaveSettings,
  resetProposalStateForTests
};
