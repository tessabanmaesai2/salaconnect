const fs = require('fs');
const { USERS_FILE, getMasterCredentials } = require('../config.cjs');
const { atomicSave, readJsonFile, hashPassword, parseBody, sendJson, sendError } = require('../utils/core.cjs');
const { logSecurity } = require('../security/radar.cjs');

let usersState = [];

function loadUsers() {
  const parsed = readJsonFile(USERS_FILE, []);
  usersState = Array.isArray(parsed) ? parsed : [];
  let migrated = false;
  usersState.forEach(u => {
    if (u.password && !String(u.password).startsWith('pbkdf2$')) {
      u.password = hashPassword(String(u.password));
      u.updatedAt = new Date().toISOString();
      migrated = true;
    }
  });
  if (migrated) saveUsers();
  return usersState;
}

function saveUsers() {
  return atomicSave(USERS_FILE, usersState);
}

function getUsers() {
  return usersState;
}

function isSuperAdminUser(user) {
  if (!user) return false;
  const { masterKey } = getMasterCredentials();
  const mkLower = (masterKey || 'thedatazero').toLowerCase();
  const uLower = String(user.username || '').toLowerCase();
  const roleLower = String(user.role || '').toLowerCase();
  return Boolean(user.is_master || uLower === mkLower || uLower === 'thedatazero' || roleLower === 'super admin' || roleLower === 'superadmin');
}

function handleGetUsers(req, res) {
  const safeUsers = usersState.map(u => ({
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

async function handleCreateUser(req, res, currentUser) {
  const body = await parseBody(req);
  const { username, password, name, role } = body;
  if (!username || !password || !name) {
    return sendError(res, 400, 'กรุณากรอกข้อมูลให้ครบถ้วน');
  }
  const { masterKey } = getMasterCredentials();
  const uClean = String(username).trim();
  if (uClean.toLowerCase() === 'thedatazero' || (masterKey && uClean.toLowerCase() === masterKey.toLowerCase())) {
    return sendError(res, 403, 'ไม่สามารถสร้างชื่อผู้ใช้งานซ้ำกับบัญชี Master Key ได้');
  }
  if (usersState.some(u => String(u.username || '').toLowerCase() === uClean.toLowerCase())) {
    return sendError(res, 400, 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
  }

  const nextId = Math.max(1, usersState.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0)) + 1;
  const newUser = {
    id: nextId,
    username: uClean,
    name: String(name).trim(),
    role: role || 'Officer',
    password: hashPassword(String(password)),
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  usersState.push(newUser);
  saveUsers();
  logSecurity('USER_CREATE', currentUser.username, req, `สร้างผู้ใช้ใหม่: ${newUser.username} (${newUser.role})`);

  return sendJson(res, 201, {
    success: true,
    message: 'สร้างผู้ใช้ใหม่สำเร็จ',
    data: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, status: newUser.status }
  });
}

async function handleUpdateUser(req, res, currentUser, id) {
  const user = usersState.find(u => u.id === id);
  if (!user) return sendError(res, 404, 'ไม่พบผู้ใช้');
  if (isSuperAdminUser(user)) {
    return sendError(res, 403, 'บัญชี Master Key เป็นรากฐานของระบบ ล็อกถาวร ไม่สามารถแก้ไขผ่านเว็บได้');
  }

  const body = await parseBody(req);
  if (body.username && String(body.username).trim()) {
    const newUsername = String(body.username).trim();
    const { masterKey } = getMasterCredentials();
    if (newUsername.toLowerCase() === 'thedatazero' || (masterKey && newUsername.toLowerCase() === masterKey.toLowerCase())) {
      return sendError(res, 403, 'ไม่สามารถใช้ชื่อบัญชี Master Key ได้');
    }
    const conflict = usersState.find(u => u.id !== id && String(u.username || '').toLowerCase() === newUsername.toLowerCase());
    if (conflict) {
      return sendError(res, 400, `ชื่อผู้ใช้งาน "${newUsername}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
    }
    user.username = newUsername;
  }
  if (body.name) user.name = String(body.name).trim();
  if (body.role) user.role = body.role;
  if (body.status) user.status = body.status;
  if (body.password && String(body.password).trim()) user.password = hashPassword(String(body.password).trim());
  user.updatedAt = new Date().toISOString();

  saveUsers();
  logSecurity('USER_UPDATE', currentUser.username, req, `อัปเดตข้อมูลผู้ใช้: ${user.username}`);
  return sendJson(res, 200, { success: true, message: 'บันทึกข้อมูลผู้ใช้เรียบร้อย' });
}

function handleDeleteUser(req, res, currentUser, id) {
  if (id === currentUser.id) {
    return sendError(res, 400, 'ไม่อนุญาตให้ลบบัญชีที่กำลังใช้งาน');
  }
  const index = usersState.findIndex(u => u.id === id);
  if (index === -1) return sendError(res, 404, 'ไม่พบผู้ใช้');
  if (isSuperAdminUser(usersState[index])) {
    return sendError(res, 403, 'ไม่อนุญาตให้ลบบัญชี Master Key');
  }

  const deleted = usersState.splice(index, 1)[0];
  saveUsers();
  logSecurity('USER_DELETE', currentUser.username, req, `ลบผู้ใช้: ${deleted.username}`);
  return sendJson(res, 200, { success: true, message: 'ลบผู้ใช้สำเร็จ' });
}

function resetUsersStateForTests() {
  usersState = [];
}

module.exports = {
  loadUsers,
  saveUsers,
  getUsers,
  isSuperAdminUser,
  handleGetUsers,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
  resetUsersStateForTests
};
