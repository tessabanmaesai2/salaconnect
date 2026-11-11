/**
 * ============================================================
 * MAESAI SALA CONNECT — Master Key & DEC-026 Security Radar JS
 * ============================================================
 */

let currentMasterUser = null;
let allMasterUsers = [];
let allRadarLogs = [];
let currentThreatFilter = 'ALL';

document.addEventListener('DOMContentLoaded', async () => {
  await checkMasterAuth();
});

// ─── AUTHENTICATION ──────────────────────────────────────────
async function checkMasterAuth() {
  const token = localStorage.getItem('sala_token');
  if (!token) {
    showMasterLogin();
    return;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.user && data.user.role === 'Super Admin') {
      currentMasterUser = data.user;
      showMasterDashboard();
      await loadUsers();
      await loadSecurityLogs();
      await loadBannedIps();
    } else {
      showMasterLogin();
    }
  } catch (e) {
    showMasterLogin();
  }
}

function showMasterLogin() {
  document.getElementById('masterLoginScreen').classList.remove('hidden');
  document.getElementById('masterDashboardScreen').classList.add('hidden');
  document.getElementById('btnMasterLogout').classList.add('hidden');
}

function showMasterDashboard() {
  document.getElementById('masterLoginScreen').classList.add('hidden');
  document.getElementById('masterDashboardScreen').classList.remove('hidden');
  document.getElementById('btnMasterLogout').classList.remove('hidden');
}

async function handleMasterLoginSubmit(e) {
  e.preventDefault();
  const masterKey = document.getElementById('masterKeyPasswordInput').value.trim();
  const btn = document.getElementById('btnMasterSubmit');

  if (!masterKey) return alert('กรุณากรอก Master Key Password');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบสิทธิ์...';

  try {
    const res = await fetch('/api/auth/master-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterKey })
    });
    const data = await res.json();
    if (data.success && data.token) {
      localStorage.setItem('sala_token', data.token);
      currentMasterUser = data.user;
      showMasterDashboard();
      document.getElementById('formMasterLogin').reset();
      await loadUsers();
      await loadSecurityLogs();
      await loadBannedIps();
    } else {
      alert(data.error || 'Master Key ไม่ถูกต้อง');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-key"></i> เข้าสู่ระบบความปลอดภัย';
  }
}

async function handleMasterLogout() {
  if (!confirm('ต้องการออกจากระบบ Super Admin หรือไม่?')) return;
  const token = localStorage.getItem('sala_token');
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }
  localStorage.removeItem('sala_token');
  currentMasterUser = null;
  showMasterLogin();
}

// ─── TAB SWITCHING ───────────────────────────────────────────
function switchMasterTab(tab) {
  const btnUsers = document.getElementById('tabBtnUsers');
  const btnRadar = document.getElementById('tabBtnRadar');
  const secUsers = document.getElementById('sectionUsers');
  const secRadar = document.getElementById('sectionRadar');

  if (tab === 'users') {
    btnUsers.className = 'btn-v3-pill';
    btnRadar.className = 'btn-v3-pill secondary';
    secUsers.classList.remove('hidden');
    secRadar.classList.add('hidden');
    loadUsers();
  } else {
    btnUsers.className = 'btn-v3-pill secondary';
    btnRadar.className = 'btn-v3-pill';
    secUsers.classList.add('hidden');
    secRadar.classList.remove('hidden');
    loadSecurityLogs();
    loadBannedIps();
  }
}

// ─── TAB 1: USER MANAGEMENT ──────────────────────────────────
async function loadUsers() {
  const token = localStorage.getItem('sala_token');
  const tbody = document.getElementById('userTableBody');
  try {
    const res = await fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      allMasterUsers = data.data;
      renderUsersTable(allMasterUsers);
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">ไม่สามารถโหลดข้อมูลเจ้าหน้าที่ได้</td></tr>`;
  }
}

function renderUsersTable(list) {
  const tbody = document.getElementById('userTableBody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 25px; color: var(--slate-400);">ไม่พบบัญชีเจ้าหน้าที่ในระบบ</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => `
    <tr>
      <td style="text-align: center; font-weight: 700; color: var(--slate-400);">${u.id}</td>
      <td>
        <strong style="color: var(--primary); font-family: var(--font-heading);">${escapeHtml(u.username)}</strong>
      </td>
      <td>${escapeHtml(u.name || '-')}</td>
      <td style="text-align: center;">
        <span class="badge-status ${u.role === 'Admin' ? 'badge-review' : 'badge-pending'}">
          ${escapeHtml(u.role || 'Officer')}
        </span>
      </td>
      <td style="text-align: center;">
        <span class="badge-status ${u.status === 'Active' ? 'badge-completed' : 'badge-rejected'}">
          ${u.status === 'Active' ? 'เปิดใช้งาน' : 'ระงับชั่วคราว'}
        </span>
      </td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button type="button" class="btn-action" title="แก้ไขบัญชี" onclick="openEditUserModal(${u.id})">
            <i class="fas fa-edit" style="color: var(--primary);"></i>
          </button>
          <button type="button" class="btn-action danger" title="ลบบัญชี" onclick="deleteUserAccount(${u.id}, '${escapeHtml(u.username)}')">
            <i class="fas fa-trash-alt" style="color: var(--danger);"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddUserModal() {
  document.getElementById('userModalTitle').textContent = 'เพิ่มบัญชีเจ้าหน้าที่ใหม่';
  document.getElementById('userId').value = '';
  document.getElementById('formUser').reset();
  document.getElementById('inputUsername').disabled = false;
  document.getElementById('inputPassword').required = true;
  document.getElementById('passReqMark').style.display = 'inline';
  document.getElementById('userModal').classList.add('active');
}

function openEditUserModal(id) {
  const u = allMasterUsers.find(item => item.id === id);
  if (!u) return;

  document.getElementById('userModalTitle').textContent = `แก้ไขบัญชีเจ้าหน้าที่: ${u.username}`;
  document.getElementById('userId').value = u.id;
  document.getElementById('inputUsername').value = u.username;
  document.getElementById('inputUsername').disabled = true;
  document.getElementById('inputName').value = u.name || '';
  document.getElementById('inputRole').value = u.role || 'Officer';
  document.getElementById('inputStatus').value = u.status || 'Active';
  document.getElementById('inputPassword').value = '';
  document.getElementById('inputPassword').required = false;
  document.getElementById('passReqMark').style.display = 'none';

  document.getElementById('userModal').classList.add('active');
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
}

async function saveUserAccount(e) {
  e.preventDefault();
  const token = localStorage.getItem('sala_token');
  const id = document.getElementById('userId').value;
  const isEdit = Boolean(id);

  const payload = {
    username: document.getElementById('inputUsername').value.trim(),
    name: document.getElementById('inputName').value.trim(),
    role: document.getElementById('inputRole').value,
    status: document.getElementById('inputStatus').value
  };

  const pass = document.getElementById('inputPassword').value.trim();
  if (pass) payload.password = pass;

  try {
    const url = isEdit ? `/api/users/${id}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(isEdit ? 'อัปเดตข้อมูลเจ้าหน้าที่เรียบร้อย' : 'สร้างบัญชีเจ้าหน้าที่ใหม่เรียบร้อย');
      closeUserModal();
      await loadUsers();
    } else {
      alert(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

async function deleteUserAccount(id, username) {
  if (!confirm(`คุณต้องการลบบัญชีเจ้าหน้าที่ "${username}" หรือไม่?`)) return;
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      alert('ลบบัญชีเรียบร้อยแล้ว');
      await loadUsers();
    } else {
      alert(data.error || 'ไม่สามารถลบบัญชีนี้ได้');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

// ─── TAB 2: DEC-026 SECURITY RADAR ───────────────────────────
async function loadSecurityLogs() {
  const token = localStorage.getItem('sala_token');
  const tbody = document.getElementById('radarTableBody');
  try {
    const res = await fetch('/api/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      allRadarLogs = data.data;
      updateRadarStats();
      renderRadarLogs();
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">ไม่สามารถโหลดประวัติความปลอดภัยได้</td></tr>`;
  }
}

async function loadBannedIps() {
  const token = localStorage.getItem('sala_token');
  const container = document.getElementById('bannedIpsContainer');
  try {
    const res = await fetch('/api/security/banned-ips', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.bannedIps) && data.bannedIps.length > 0) {
      container.innerHTML = data.bannedIps.map(b => `
        <div class="banned-ip-alert">
          <div>
            <i class="fas fa-shield-virus"></i> <b>ตรวจพบการสกัดกั้น Brute-Force:</b> IP <span class="ip-mono">${b.ip}</span> ถูกระงับชั่วคราว (เหลือเวลา ${b.remainingMinutes} นาที)
          </div>
          <button type="button" class="btn-action danger" onclick="unbanIp('${b.ip}')">
            <i class="fas fa-unlock"></i> ปลดล็อก IP ทันที
          </button>
        </div>
      `).join('');
    } else {
      container.innerHTML = '';
    }
  } catch (e) {
    container.innerHTML = '';
  }
}

async function unbanIp(ip) {
  if (!confirm(`คุณต้องการปลดล็อก IP ${ip} ใช่หรือไม่?`)) return;
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch('/api/security/unban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ip })
    });
    const data = await res.json();
    if (data.success) {
      alert(`ปลดล็อก IP ${ip} สำเร็จ`);
      loadBannedIps();
      loadSecurityLogs();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการปลดล็อก');
  }
}

function updateRadarStats() {
  let info = 0, warn = 0, critical = 0;
  allRadarLogs.forEach(l => {
    const t = (l.threatLevel || 'INFO').toUpperCase();
    if (t === 'CRITICAL') critical++;
    else if (t === 'WARN') warn++;
    else info++;
  });

  document.getElementById('radarStatTotal').textContent = allRadarLogs.length;
  document.getElementById('radarStatInfo').textContent = info;
  document.getElementById('radarStatWarn').textContent = warn;
  document.getElementById('radarStatCritical').textContent = critical;
}

function setRadarThreatFilter(level) {
  currentThreatFilter = level;
  document.querySelectorAll('#sectionRadar .pill-btn').forEach(b => {
    if (b.id.startsWith('pillThreat')) b.classList.remove('active');
  });

  const activeBtn = document.getElementById(`pillThreat${level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()}`);
  if (activeBtn) activeBtn.classList.add('active');

  renderRadarLogs();
}

function handleRadarSearch() {
  renderRadarLogs();
}

function renderRadarLogs() {
  const query = (document.getElementById('radarSearchInput').value || '').toLowerCase().trim();
  const tbody = document.getElementById('radarTableBody');

  let list = allRadarLogs.filter(l => {
    const threat = (l.threatLevel || 'INFO').toUpperCase();
    if (currentThreatFilter !== 'ALL' && threat !== currentThreatFilter) return false;

    if (query) {
      const geoStr = l.geo ? `${l.geo.country} ${l.geo.region} ${l.geo.city} ${l.geo.isp}`.toLowerCase() : '';
      const match =
        (l.ip && l.ip.includes(query)) ||
        (l.action && l.action.toLowerCase().includes(query)) ||
        (l.username && l.username.toLowerCase().includes(query)) ||
        (l.device && l.device.toLowerCase().includes(query)) ||
        (l.details && l.details.toLowerCase().includes(query)) ||
        geoStr.includes(query);
      if (!match) return false;
    }
    return true;
  });

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--slate-400);">ไม่พบบันทึกเหตุการณ์ที่ตรงกับเงื่อนไข</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => {
    const threat = (l.threatLevel || 'INFO').toUpperCase();
    let badgeClass = 'threat-info';
    let badgeLabel = '🟢 ปกติ';
    if (threat === 'CRITICAL') {
      badgeClass = 'threat-critical';
      badgeLabel = '🚨 อันตราย';
    } else if (threat === 'WARN') {
      badgeClass = 'threat-warn';
      badgeLabel = '🟡 น่าสงสัย';
    }

    const geo = l.geo || { country: 'ไม่ระบุ', region: '', isp: '' };
    const locLine = geo.isLocal ? 'เครือข่ายภายใน • Localhost / LAN' : `${geo.country || 'ต่างประเทศ'} • ${geo.region || geo.city || ''}`;
    const ispLine = geo.isp || 'Internal Network';

    return `
      <tr>
        <td style="font-size: 0.8rem; color: var(--slate-600); white-space: nowrap;">
          ${l.timestamp ? l.timestamp.replace('T', ' ').slice(0, 19) : ''}
        </td>
        <td style="text-align: center;">
          <span class="badge-app-sala">SALA CONNECT</span>
        </td>
        <td style="text-align: center;">
          <span class="threat-badge ${badgeClass}">${badgeLabel}</span>
        </td>
        <td>
          <span class="ip-mono">${escapeHtml(l.ip || '127.0.0.1')}</span>
          <div style="font-size: 0.78rem; font-weight: 600; color: var(--slate-700); margin-top: 2px;">
            ${escapeHtml(locLine)}
          </div>
          <div style="font-size: 0.75rem; color: #2563eb; font-weight: 600;">
            ${escapeHtml(ispLine)}
          </div>
        </td>
        <td style="font-size: 0.8rem; color: var(--slate-600);">
          ${escapeHtml(l.device || 'ไม่ระบุ')}
        </td>
        <td>
          <strong style="font-size: 0.82rem; color: var(--slate-800);">${escapeHtml(l.action || '-')}</strong>
          <div style="font-size: 0.75rem; color: var(--slate-400);">โดย: ${escapeHtml(l.username || 'guest')}</div>
        </td>
        <td style="font-size: 0.82rem; color: var(--slate-600); line-height: 1.4;">
          ${escapeHtml(l.details || '-')}
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-action danger" title="ลบรายการนี้" onclick="deleteSingleLog(${l.id})">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteSingleLog(id) {
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch(`/api/logs/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      loadSecurityLogs();
    }
  } catch (e) {}
}

async function clearAllSecurityLogs() {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติความปลอดภัยทั้งหมด?')) return;
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch('/api/logs', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      alert('ล้างประวัติความปลอดภัยทั้งหมดเรียบร้อยแล้ว');
      loadSecurityLogs();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด');
  }
}

function exportSecurityLogsJson() {
  if (allRadarLogs.length === 0) return alert('ไม่มีข้อมูลสำหรับส่งออก');
  const blob = new Blob([JSON.stringify(allRadarLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SALA_CONNECT_Security_Logs_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
