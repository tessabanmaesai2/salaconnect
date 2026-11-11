const API_BASE = window.location.pathname.startsWith('/sala') ? '/sala/api' : '/api';

/**
 * ============================================================
 * MAESAI SALA CONNECT — Staff Management Workspace Logic
 * Features: Staff Login Gate, KPI Cards, Comprehensive Filtering,
 * Fluid Full-Width Table (No horizontal scroll on PC),
 * Inline Status Change, Edit Modal, A4 Print Linking, Excel Export
 * Strict Invariants: NO budget column, NO budget fields, NO budget calculations
 * ============================================================
 */

let allProposals = [];
let filteredProposals = [];
let currentUser = null;
let currentQuickFilter = 'all';
const selectedManageIds = new Set();

function formatThaiDateTimeBE(dateStr, withLineBreak = true) {
  if (!dateStr) return '-';
  const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // Match YYYY-MM-DD HH:mm:ss or ISO
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (m) {
    const y = parseInt(m[1], 10);
    const yearBE = y > 2400 ? y : y + 543;
    const day = parseInt(m[3], 10);
    const month = parseInt(m[2], 10);
    const monthName = shortMonths[month - 1] || '';
    const timeStr = m[4] && m[5] ? `${m[4]}:${m[5]} น.` : '';

    if (timeStr) {
      if (withLineBreak) {
        return `${day} ${monthName} ${yearBE}<br><span style="font-size: 8pt; color: #64748b; font-weight: 500;">${timeStr}</span>`;
      }
      return `${day} ${monthName} ${yearBE} (${timeStr})`;
    }
    return `${day} ${monthName} ${yearBE}`;
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const day = d.getDate();
    const monthName = shortMonths[d.getMonth()] || '';
    const yearBE = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${mins} น.`;
    if (withLineBreak) {
      return `${day} ${monthName} ${yearBE}<br><span style="font-size: 8pt; color: #64748b; font-weight: 500;">${timeStr}</span>`;
    }
    return `${day} ${monthName} ${yearBE} (${timeStr})`;
  }

  return dateStr;
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthSession();
});

// ─── AUTHENTICATION & LOGIN GATE ─────────────────────────────
async function checkAuthSession() {
  const token = localStorage.getItem('sala_token');
  if (!token) {
    showLoginGate();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      showDashboard();
      await loadProposals();
    } else {
      localStorage.removeItem('sala_token');
      showLoginGate();
    }
  } catch (e) {
    showLoginGate();
  }
}

function showLoginGate() {
  document.getElementById('loginGateScreen').classList.remove('hidden');
  document.getElementById('mainDashboardScreen').classList.add('hidden');
  const staffNav = document.getElementById('staffNavActions');
  if (staffNav) {
    staffNav.classList.add('hidden');
    staffNav.style.display = 'none';
  }

  // Ensure fields are 100% blank by default
  const f = document.getElementById('formStaffGateLogin');
  if (f) f.reset();
  const u = document.getElementById('gateUser');
  const p = document.getElementById('gatePass');
  if (u) u.value = '';
  if (p) p.value = '';
}

function showDashboard() {
  document.getElementById('loginGateScreen').classList.add('hidden');
  document.getElementById('mainDashboardScreen').classList.remove('hidden');

  const staffNav = document.getElementById('staffNavActions');
  if (staffNav) {
    staffNav.classList.remove('hidden');
    staffNav.style.display = 'inline-flex';
  }

  const staffTag = document.getElementById('staffTag');
  const btnLogout = document.getElementById('btnLogout');
  if (staffTag && currentUser) {
    staffTag.textContent = `เจ้าหน้าที่: ${currentUser.name || currentUser.username} (${currentUser.role})`;
    staffTag.classList.remove('hidden');
  }
  if (btnLogout) btnLogout.classList.remove('hidden');
}

function togglePasswordVisibility(inputId, eyeId) {
  const inp = document.getElementById(inputId);
  const eye = document.getElementById(eyeId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (eye) {
      eye.classList.remove('fa-eye');
      eye.classList.add('fa-eye-slash');
    }
  } else {
    inp.type = 'password';
    if (eye) {
      eye.classList.remove('fa-eye-slash');
      eye.classList.add('fa-eye');
    }
  }
}

// ─── TOAST NOTIFICATION UTILITY ──────────────────────────────
function showToast(msg, type = 'info') {
  let container = document.getElementById('salaToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'salaToastContainer';
    container.className = 'sala-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `sala-toast ${type}`;
  let icon = 'info-circle';
  if (type === 'error') icon = 'exclamation-circle';
  else if (type === 'success') icon = 'check-circle';
  else if (type === 'warning') icon = 'exclamation-triangle';

  toast.innerHTML = `
    <i class="fas fa-${icon} sala-toast-icon"></i>
    <span class="sala-toast-text">${msg}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

async function handleGateLogin(e) {
  e.preventDefault();
  const username = document.getElementById('gateUser').value.trim();
  const password = document.getElementById('gatePass').value.trim();
  const btn = document.getElementById('btnGateSubmit');
  const errBox = document.getElementById('loginErrorMsg');
  const errTxt = document.getElementById('loginErrorText');

  if (errBox) errBox.style.display = 'none';

  function showLoginErr(msg) {
    if (errBox && errTxt) {
      errTxt.textContent = msg;
      errBox.style.display = 'flex';
    } else {
      showToast(msg, 'error');
    }
  }

  if (!username) return showLoginErr('กรุณากรอกชื่อผู้ใช้งานหรือชื่อเจ้าหน้าที่');
  if (!password) return showLoginErr('กรุณากรอกรหัสผ่าน');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ...';

  try {
    const res = await fetch(`${API_BASE}/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      localStorage.setItem('sala_token', data.token);
      currentUser = data.user;
      showDashboard();
      showToast(`เข้าสู่ระบบสำเร็จในบทบาท ${data.user.role}`, 'success');
      await loadProposals();
    } else {
      showLoginErr(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  } catch (err) {
    showLoginErr('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบจัดการ';
  }
}

async function handleLogout() {
  if (!confirm('คุณต้องการออกจากระบบหรือไม่?')) return;
  const token = localStorage.getItem('sala_token');
  if (token) {
    try {
      await fetch(`${API_BASE}/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }
  localStorage.removeItem('sala_token');
  currentUser = null;
  showLoginGate();
}

// ─── DATA LOADING & POPULATION ───────────────────────────────
async function loadProposals() {
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch(`${API_BASE}/proposals', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      allProposals = data.data;
      selectedManageIds.clear();
      allProposals.forEach(p => selectedManageIds.add(p.id));

      // Extract unique Buddhist years dynamically
      const yearSet = new Set();
      allProposals.forEach(p => {
        let yearTh = null;
        if (p.code && p.code.includes('-')) {
          const m = p.code.match(/PRJ-(\d{4})-/);
          if (m) yearTh = m[1];
        }
        if (!yearTh && p.timestamp) {
          const y = parseInt(p.timestamp.slice(0, 4), 10);
          if (!isNaN(y)) yearTh = String(y > 2400 ? y : y + 543);
        }
        if (yearTh) yearSet.add(yearTh);
      });

      const yearSelect = document.getElementById('manageYearFilter');
      if (yearSelect && yearSet.size > 0) {
        const sortedYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
        yearSelect.innerHTML = '<option value="all">ทุกปี พ.ศ.</option>' +
          sortedYears.map(y => `<option value="${y}">พ.ศ. ${y}</option>`).join('');
      }

      updateKpiCards();
      filterTable();
    }
  } catch (err) {
    console.error('Failed to load proposals:', err);
  }
}

// ─── KPI SUMMARY CARDS ───────────────────────────────────────
function updateKpiCards() {
  let pending = 0, review = 0, inPlan = 0, completed = 0, rejected = 0;

  allProposals.forEach(p => {
    let s = p.status || 'เสนอเรื่องเข้ามา';
    if (s === 'รอดำเนินการ' || s === 'เข้าระบบแล้ว') s = 'เสนอเรื่องเข้ามา';
    if (s === 'บรรจุในแผนชุมชน') s = 'บรรจุในแผน';

    if (s.includes('สำเร็จ') || s.includes('แล้วเสร็จ')) completed++;
    else if (s.includes('บรรจุ') || s.includes('แผน')) inPlan++;
    else if (s.includes('พิจารณา')) review++;
    else if (s.includes('ไม่')) rejected++;
    else pending++;
  });

  document.getElementById('countAll').textContent = allProposals.length;
  document.getElementById('countPending').textContent = pending;
  document.getElementById('countReview').textContent = review;
  document.getElementById('countInPlan').textContent = inPlan;
  document.getElementById('countCompleted').textContent = completed;
  document.getElementById('countRejected').textContent = rejected;
}

function setFilterStatus(status) {
  currentQuickFilter = status;
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active-filter'));

  if (status === 'all') {
    document.getElementById('kpiAll').classList.add('active-filter');
    document.getElementById('manageStatusFilter').value = 'all';
  } else if (status.includes('พิจารณา')) {
    document.getElementById('kpiReview').classList.add('active-filter');
    document.getElementById('manageStatusFilter').value = 'อยู่ระหว่างพิจารณา';
  } else if (status.includes('บรรจุ') || status.includes('แผน')) {
    document.getElementById('kpiInPlan').classList.add('active-filter');
    document.getElementById('manageStatusFilter').value = 'บรรจุในแผน';
  } else if (status.includes('แล้วเสร็จ') || status.includes('สำเร็จ')) {
    document.getElementById('kpiCompleted').classList.add('active-filter');
    document.getElementById('manageStatusFilter').value = 'ดำเนินการแล้วเสร็จ';
  } else if (status.includes('ไม่')) {
    document.getElementById('kpiRejected').classList.add('active-filter');
    document.getElementById('manageStatusFilter').value = 'ไม่สามารถดำเนินการได้';
  } else {
    document.getElementById('kpiPending').classList.add('active-filter');
    document.getElementById('manageStatusFilter').value = 'เสนอเรื่องเข้ามา';
  }

  filterTable();
}

function resetFilters() {
  document.getElementById('manageSearchInput').value = '';
  document.getElementById('manageYearFilter').value = 'all';
  document.getElementById('manageCommunityFilter').value = 'all';
  document.getElementById('manageStatusFilter').value = 'all';
  document.getElementById('manageDateFrom').value = '';
  document.getElementById('manageDateTo').value = '';
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active-filter'));
  document.getElementById('kpiAll').classList.add('active-filter');
  filterTable();
}

// ─── FILTER & RENDER TABLE ───────────────────────────────────
function filterTable() {
  const query = (document.getElementById('manageSearchInput').value || '').toLowerCase().trim();
  const yearFilter = document.getElementById('manageYearFilter').value;
  const commFilter = document.getElementById('manageCommunityFilter').value;
  const statusFilter = document.getElementById('manageStatusFilter').value;
  const dateFrom = document.getElementById('manageDateFrom').value;
  const dateTo = document.getElementById('manageDateTo').value;

  filteredProposals = allProposals.filter(p => {
    // Year filter (Buddhist Year)
    if (yearFilter !== 'all') {
      let pYear = '';
      if (p.code) {
        const m = p.code.match(/PRJ-(\d{4})-/);
        if (m) pYear = m[1];
      }
      if (!pYear && p.timestamp) {
        const y = parseInt(p.timestamp.slice(0, 4), 10);
        if (!isNaN(y)) pYear = String(y > 2400 ? y : y + 543);
      }
      if (pYear !== yearFilter) return false;
    }

    // Community filter
    if (commFilter !== 'all' && p.community !== commFilter) return false;

    // Status filter (with backward compatibility normalization)
    if (statusFilter !== 'all') {
      let pNorm = p.status || 'เสนอเรื่องเข้ามา';
      if (pNorm === 'รอดำเนินการ' || pNorm === 'เข้าระบบแล้ว') pNorm = 'เสนอเรื่องเข้ามา';
      if (pNorm === 'บรรจุในแผนชุมชน') pNorm = 'บรรจุในแผน';

      let fNorm = statusFilter;
      if (fNorm === 'รอดำเนินการ' || fNorm === 'เข้าระบบแล้ว') fNorm = 'เสนอเรื่องเข้ามา';
      if (fNorm === 'บรรจุในแผนชุมชน') fNorm = 'บรรจุในแผน';

      if (pNorm !== fNorm && p.status !== statusFilter) return false;
    }

    // Date range
    if (dateFrom && p.timestamp && p.timestamp.slice(0, 10) < dateFrom) return false;
    if (dateTo && p.timestamp && p.timestamp.slice(0, 10) > dateTo) return false;

    // Search query
    if (query) {
      const match =
        (p.code && p.code.toLowerCase().includes(query)) ||
        (p.community && p.community.toLowerCase().includes(query)) ||
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.problem && p.problem.toLowerCase().includes(query)) ||
        (p.solution && p.solution.toLowerCase().includes(query)) ||
        (p.location && p.location.toLowerCase().includes(query)) ||
        (p.phone && p.phone.includes(query)) ||
        (p.reject_reason && p.reject_reason.toLowerCase().includes(query));
      if (!match) return false;
    }

    return true;
  });

  document.getElementById('foundRowsCount').textContent = filteredProposals.length;
  renderTable(filteredProposals);
}

function renderTable(list) {
  const tbody = document.getElementById('manageTableBody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 40px; color: var(--slate-400);">ไม่พบรายการข้อเสนอที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
    updateManageSelectionSummary();
    updateHeaderSelectAllState();
    return;
  }

  tbody.innerHTML = list.map(p => {
    let normStatus = p.status || 'เสนอเรื่องเข้ามา';
    if (normStatus === 'รอดำเนินการ' || normStatus === 'เข้าระบบแล้ว') normStatus = 'เสนอเรื่องเข้ามา';
    if (normStatus === 'บรรจุในแผนชุมชน') normStatus = 'บรรจุในแผน';

    const reasonText = p.reject_reason || p.notes || '';
    const isChecked = selectedManageIds.has(p.id);

    return `
    <tr>
      <td style="text-align: center; vertical-align: middle;">
        <input type="checkbox" class="manage-row-chk" value="${p.id}" ${isChecked ? 'checked' : ''} onchange="toggleManageRowCheck(${p.id}, this.checked)" style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--primary);">
      </td>
      <td style="text-align: center; vertical-align: middle; line-height: 1.3;">
        <div style="font-weight: 600; color: var(--slate-800); font-size: 0.85rem;">
          ${formatThaiDateTimeBE(p.timestamp || p.created_at)}
        </div>
        <div style="margin-top: 5px; display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
          ${p.photo ? `
            <a href="${p.photo}" target="_blank" style="display: inline-flex; align-items: center; gap: 2px; font-size: 0.72rem; color: var(--primary); background: #faf5ff; border: 1px solid var(--primary-light); padding: 1px 5px; border-radius: 3px; text-decoration: none;" title="คลิกเปิดดูรูปถ่าย">
              <i class="fas fa-camera"></i> รูป
            </a>
          ` : ''}
          ${p.gps_lat && p.gps_lng ? `
            <a href="https://www.google.com/maps?q=${p.gps_lat},${p.gps_lng}" target="_blank" style="display: inline-flex; align-items: center; gap: 2px; font-size: 0.72rem; color: #065f46; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 1px 5px; border-radius: 3px; text-decoration: none;" title="เปิดดูแผนที่ Google Maps">
              <i class="fas fa-map-marker-alt"></i> GPS
            </a>
          ` : ''}
        </div>
      </td>
      <td style="white-space: nowrap; font-weight: 600; vertical-align: middle;">
        ${escapeHtml(p.community || '-')}
      </td>
      <td>
        <div style="font-weight: 500; line-height: 1.4;">${escapeHtml(p.problem || '-')}</div>
      </td>
      <td>
        <div style="color: var(--slate-600); line-height: 1.4;">${escapeHtml(p.solution || '-')}</div>
      </td>
      <td>
        <div style="font-size: 0.8rem; color: var(--slate-600);">${escapeHtml(p.location || '-')}</div>
      </td>
      <td style="vertical-align: middle;">
        <div style="font-weight: 600; white-space: nowrap;">${escapeHtml(p.prefix || '')}${escapeHtml(p.name || '-')}</div>
        <div style="font-size: 0.78rem; color: var(--slate-500); margin-top: 2px; white-space: nowrap;">
          ${p.age ? `อายุ ${p.age} ปี` : ''} ${p.phone ? `• โทร ${escapeHtml(p.phone)}` : ''}
        </div>
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <select class="select-status-inline" onchange="changeStatusInline(${p.id}, this.value)">
          <option value="เสนอเรื่องเข้ามา" ${normStatus === 'เสนอเรื่องเข้ามา' ? 'selected' : ''}>เสนอเรื่องเข้ามา</option>
          <option value="อยู่ระหว่างพิจารณา" ${normStatus === 'อยู่ระหว่างพิจารณา' ? 'selected' : ''}>อยู่ระหว่างพิจารณา</option>
          <option value="บรรจุในแผน" ${normStatus === 'บรรจุในแผน' ? 'selected' : ''}>บรรจุในแผน</option>
          <option value="ดำเนินการแล้วเสร็จ" ${normStatus === 'ดำเนินการแล้วเสร็จ' ? 'selected' : ''}>ดำเนินการแล้วเสร็จ</option>
          <option value="ไม่สามารถดำเนินการได้" ${normStatus === 'ไม่สามารถดำเนินการได้' ? 'selected' : ''}>ไม่สามารถดำเนินการได้</option>
        </select>
        ${normStatus === 'ไม่สามารถดำเนินการได้' && reasonText ? `
          <div style="font-size: 0.72rem; color: #9f1239; margin-top: 4px; line-height: 1.3; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3; text-align: left;" title="${escapeHtml(reasonText)}">
            <b>เหตุผล:</b> ${escapeHtml(reasonText.length > 25 ? reasonText.slice(0, 25) + '...' : reasonText)}
          </div>
        ` : ''}
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button type="button" class="btn-action" title="แก้ไขข้อเสนอ" onclick="openEditModal(${p.id})">
            <i class="fas fa-edit" style="color: var(--primary);"></i>
          </button>
          <a href="/sala/print?template=individual&id=${p.id}" class="btn-action" title="พิมพ์แบบฟอร์ม A4 รายบุคคล" target="_blank">
            <i class="fas fa-print" style="color: var(--slate-600);"></i>
          </a>
          <button type="button" class="btn-action danger" title="ลบข้อเสนอ" onclick="deleteProposal(${p.id})">
            <i class="fas fa-trash-alt" style="color: var(--danger);"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  updateManageSelectionSummary();
  updateHeaderSelectAllState();
  initTableResizable();
}

// ─── ITEM-BY-ITEM SELECTION LOGIC ─────────────────────────────
function toggleManageRowCheck(id, isChecked) {
  if (isChecked) {
    selectedManageIds.add(id);
  } else {
    selectedManageIds.delete(id);
  }
  updateManageSelectionSummary();
  updateHeaderSelectAllState();
}

function toggleSelectAllProposals(selectAll) {
  if (selectAll) {
    filteredProposals.forEach(p => selectedManageIds.add(p.id));
  } else {
    filteredProposals.forEach(p => selectedManageIds.delete(p.id));
  }
  const checkboxes = document.querySelectorAll('.manage-row-chk');
  checkboxes.forEach(cb => {
    const pid = parseInt(cb.value, 10);
    cb.checked = selectedManageIds.has(pid);
  });
  updateManageSelectionSummary();
  updateHeaderSelectAllState();
}

function updateHeaderSelectAllState() {
  const chk = document.getElementById('thSelectAll');
  if (!chk) return;
  if (filteredProposals.length === 0) {
    chk.checked = false;
    chk.indeterminate = false;
    return;
  }
  const selectedCount = filteredProposals.filter(p => selectedManageIds.has(p.id)).length;
  if (selectedCount === filteredProposals.length) {
    chk.checked = true;
    chk.indeterminate = false;
  } else if (selectedCount > 0) {
    chk.checked = false;
    chk.indeterminate = true;
  } else {
    chk.checked = false;
    chk.indeterminate = false;
  }
}

function updateManageSelectionSummary() {
  const selectedCount = filteredProposals.filter(p => selectedManageIds.has(p.id)).length;
  const summaryEl = document.getElementById('manageSelectionSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `เลือกแล้ว <b style="color: var(--primary);">${selectedCount}</b> / ${filteredProposals.length} รายการ`;
  }
}

// ─── DRAG-TO-RESIZE COLUMN LOGIC ──────────────────────────────
function initTableResizable() {
  const table = document.querySelector('.manage-table');
  if (!table) return;
  const cols = table.querySelectorAll('thead th');
  cols.forEach((th, index) => {
    if (th.querySelector('.col-resizer')) return;
    if (index === 0) return; // Keep checkbox column fixed width

    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    resizer.title = 'คลิกค้างแล้วลากเพื่อปรับขนาดความกว้างคอลัมน์ (ยืด/หด)';
    th.appendChild(resizer);

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.pageX;
      startWidth = th.offsetWidth;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        const diff = moveEvent.pageX - startX;
        const newWidth = Math.max(70, startWidth + diff);
        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
      };

      const onMouseUp = () => {
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// ─── INLINE STATUS CHANGE ────────────────────────────────────
async function changeStatusInline(id, newStatus) {
  const token = localStorage.getItem('sala_token');
  const match = allProposals.find(p => p.id === id);
  let rejectReason = match ? (match.reject_reason || match.notes || '') : '';

  if (newStatus === 'ไม่สามารถดำเนินการได้') {
    const inputReason = prompt('โปรดระบุเหตุผลที่ไม่สามารถดำเนินการได้ (สำหรับให้ประชาชนผู้เสนอเรื่องตรวจสอบได้ เช่น "ส่งต่อหน่วยงานภายนอก (แขวงทางหลวงชนบท / การไฟฟ้า)", "อยู่นอกเขตพื้นที่รับผิดชอบ"):', rejectReason);
    if (inputReason === null) {
      // User cancelled prompt
      renderTable(filteredProposals);
      return;
    }
    rejectReason = inputReason.trim();
  }

  try {
    const res = await fetch(`${API_BASE}/proposals/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: newStatus,
        reject_reason: rejectReason,
        notes: rejectReason
      })
    });
    const data = await res.json();
    if (data.success) {
      if (match) {
        match.status = newStatus;
        match.reject_reason = rejectReason;
        match.notes = rejectReason;
      }
      updateKpiCards();
      renderTable(filteredProposals);
    } else {
      showToast(data.error || 'ไม่สามารถเปลี่ยนสถานะได้', 'error');
      loadProposals();
    }
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
  }
}

// ─── ADD / EDIT MODAL & ATTACHMENTS (STAFF PARITY WITH CITIZEN STANDARD) ───
let staffPhotoBase64 = null;

function openStaffPhotoChoiceModal() {
  const modal = document.getElementById('staffPhotoChoiceModal');
  if (modal) modal.classList.add('active');
}

function closeStaffPhotoChoiceModal(e) {
  if (e && e.target && e.target !== e.currentTarget) return;
  const modal = document.getElementById('staffPhotoChoiceModal');
  if (modal) modal.classList.remove('active');
}

function triggerStaffCameraInput() {
  closeStaffPhotoChoiceModal();
  const el = document.getElementById('staffCameraFile');
  if (el) el.click();
}

function triggerStaffGalleryInput() {
  closeStaffPhotoChoiceModal();
  const el = document.getElementById('staffGalleryFile');
  if (el) el.click();
}

function handleStaffPhotoSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)', 'error');
    return;
  }

  showToast('กำลังเตรียมและปรับขนาดรูปภาพ...', 'info');

  const reader = new FileReader();
  reader.onload = function(e) {
    const rawData = e.target.result;
    const img = new Image();
    img.onload = function() {
      // Resize to standard 1280px max for municipal fast load
      const maxDim = 1280;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      staffPhotoBase64 = canvas.toDataURL('image/jpeg', 0.82);
      const sizeKB = Math.round((staffPhotoBase64.length * 3 / 4) / 1024);
      renderStaffPhotoPreview(staffPhotoBase64, `${w}×${h}px • ${sizeKB} KB`);
      showToast('แนบรูปถ่ายเรียบร้อยแล้ว', 'success');
    };
    img.src = rawData;
  };
  reader.readAsDataURL(file);
}

function renderStaffPhotoPreview(src, sizeInfo) {
  const triggerBtn = document.getElementById('btnStaffPhotoTrigger');
  const previewWrap = document.getElementById('staffPhotoPreviewWrap');
  const previewImg = document.getElementById('staffPhotoPreviewImg');
  const sizeBadge = document.getElementById('staffPhotoSizeBadge');

  if (src) {
    if (previewImg) previewImg.src = src;
    if (sizeBadge) sizeBadge.textContent = sizeInfo || 'รูปถ่ายสภาพปัญหา';
    if (previewWrap) previewWrap.style.display = 'block';
    if (triggerBtn) triggerBtn.style.display = 'none';
  } else {
    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (triggerBtn) triggerBtn.style.display = 'flex';
  }
}

function changeStaffPhoto() {
  openStaffPhotoChoiceModal();
}

function removeStaffPhoto() {
  staffPhotoBase64 = ''; // explicit empty to indicate removal
  const cIn = document.getElementById('staffCameraFile');
  const gIn = document.getElementById('staffGalleryFile');
  if (cIn) cIn.value = '';
  if (gIn) gIn.value = '';
  renderStaffPhotoPreview('', '');
  showToast('ลบรูปภาพแล้ว', 'info');
}

function getStaffGpsLocation() {
  if (!navigator.geolocation) {
    showToast('เบราว์เซอร์ไม่รองรับการดึงพิกัด GPS', 'error');
    return;
  }

  showToast('กำลังค้นหาพิกัด GPS ปัจจุบัน...', 'info');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      document.getElementById('editGpsLat').value = lat;
      document.getElementById('editGpsLng').value = lng;
      updateStaffGpsPreview();
      showToast(`ดึงพิกัด GPS สำเร็จ: ${lat}, ${lng}`, 'success');
    },
    err => {
      showToast('ไม่สามารถดึงพิกัด GPS ได้ (กรุณาอนุญาตการเข้าถึงตำแหน่ง)', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function updateStaffGpsPreview() {
  const lat = document.getElementById('editGpsLat')?.value.trim();
  const lng = document.getElementById('editGpsLng')?.value.trim();
  const triggerBtn = document.getElementById('btnStaffGetGps');
  const resultWrap = document.getElementById('staffGpsLocationResult');
  const coordsText = document.getElementById('staffGpsCoordsText');
  const mapLink = document.getElementById('staffGpsMapLink');

  if (lat && lng) {
    if (coordsText) coordsText.innerHTML = `<i class="fas fa-check-circle text-success me-1"></i> พิกัด: <code>${lat}, ${lng}</code>`;
    if (mapLink) mapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
    if (resultWrap) resultWrap.style.display = 'block';
    if (triggerBtn) triggerBtn.style.display = 'none';
  } else {
    if (resultWrap) resultWrap.style.display = 'none';
    if (triggerBtn) triggerBtn.style.display = 'flex';
  }
}

function removeStaffGpsLocation() {
  if (document.getElementById('editGpsLat')) document.getElementById('editGpsLat').value = '';
  if (document.getElementById('editGpsLng')) document.getElementById('editGpsLng').value = '';
  updateStaffGpsPreview();
  showToast('ลบพิกัด GPS แล้ว', 'info');
}

function handleModalStatusChange(val) {
  const group = document.getElementById('groupRejectReason');
  if (group) {
    group.style.display = (val === 'ไม่สามารถดำเนินการได้') ? 'block' : 'none';
  }
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'เพิ่มข้อเสนอโครงการใหม่ (เจ้าหน้าที่)';
  document.getElementById('editId').value = '';
  document.getElementById('formEdit').reset();
  document.getElementById('editStatus').value = 'เสนอเรื่องเข้ามา';
  document.getElementById('editRejectReason').value = '';
  handleModalStatusChange('เสนอเรื่องเข้ามา');

  staffPhotoBase64 = null;
  renderStaffPhotoPreview('', '');
  if (document.getElementById('editGpsLat')) document.getElementById('editGpsLat').value = '';
  if (document.getElementById('editGpsLng')) document.getElementById('editGpsLng').value = '';
  updateStaffGpsPreview();

  document.getElementById('editModal').classList.add('active');
}

function openEditModal(id) {
  const p = allProposals.find(item => item.id === id);
  if (!p) return;

  document.getElementById('modalTitle').textContent = `แก้ไขข้อเสนอโครงการ: ${p.code || ''}`;
  document.getElementById('editId').value = p.id;
  document.getElementById('editCommunity').value = p.community || 'ชุมชนแม่สาย หมู่ 1';
  document.getElementById('editPrefix').value = p.prefix || 'นาย';
  document.getElementById('editName').value = p.name || '';
  document.getElementById('editAge').value = p.age || '';
  document.getElementById('editPhone').value = p.phone || '';
  document.getElementById('editProblem').value = p.problem || '';
  document.getElementById('editSolution').value = p.solution || '';
  document.getElementById('editLocation').value = p.location || '';

  let normStatus = p.status || 'เสนอเรื่องเข้ามา';
  if (normStatus === 'รอดำเนินการ' || normStatus === 'เข้าระบบแล้ว') normStatus = 'เสนอเรื่องเข้ามา';
  if (normStatus === 'บรรจุในแผนชุมชน') normStatus = 'บรรจุในแผน';

  document.getElementById('editStatus').value = normStatus;
  document.getElementById('editRejectReason').value = p.reject_reason || p.notes || '';
  handleModalStatusChange(normStatus);

  // Load Photo
  staffPhotoBase64 = null; // null means do not change unless user modifies
  if (p.photo) {
    renderStaffPhotoPreview(p.photo, 'รูปภาพเดิมที่บันทึกไว้');
  } else {
    renderStaffPhotoPreview('', '');
  }

  // Load GPS
  if (document.getElementById('editGpsLat')) document.getElementById('editGpsLat').value = p.gps_lat || '';
  if (document.getElementById('editGpsLng')) document.getElementById('editGpsLng').value = p.gps_lng || '';
  updateStaffGpsPreview();

  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

async function saveProposal(e) {
  e.preventDefault();
  const token = localStorage.getItem('sala_token');
  const id = document.getElementById('editId').value;
  const isEdit = Boolean(id);

  const statusVal = document.getElementById('editStatus').value;
  const rejectReasonVal = document.getElementById('editRejectReason')?.value.trim() || '';

  const payload = {
    community: document.getElementById('editCommunity').value,
    prefix: document.getElementById('editPrefix').value,
    name: document.getElementById('editName').value.trim(),
    age: document.getElementById('editAge').value ? parseInt(document.getElementById('editAge').value, 10) : null,
    phone: document.getElementById('editPhone').value.trim(),
    problem: document.getElementById('editProblem').value.trim(),
    solution: document.getElementById('editSolution').value.trim(),
    location: document.getElementById('editLocation').value.trim(),
    status: statusVal,
    reject_reason: rejectReasonVal,
    notes: rejectReasonVal,
    gps_lat: document.getElementById('editGpsLat')?.value.trim() || null,
    gps_lng: document.getElementById('editGpsLng')?.value.trim() || null
  };

  // If photo was explicitly changed or added
  if (staffPhotoBase64 !== null) {
    payload.photo = staffPhotoBase64;
  }

  const btn = document.getElementById('btnSaveProposal');
  btn.disabled = true;

  try {
    const url = isEdit ? `${API_BASE}/proposals/${id}` : API_BASE + '/proposals';
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
      showToast(isEdit ? 'แก้ไขข้อมูลเรียบร้อยแล้ว' : 'สร้างข้อเสนอใหม่เรียบร้อยแล้ว', 'success');
      closeEditModal();
      await loadProposals();
    } else {
      showToast(data.error || 'บันทึกข้อมูลไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteProposal(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อเสนอโครงการนี้?')) return;
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch(`${API_BASE}/proposals/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('ลบข้อมูลเรียบร้อยแล้ว', 'success');
      await loadProposals();
    } else {
      showToast(data.error || 'สิทธิ์ไม่เพียงพอสำหรับการลบ', 'error');
    }
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
  }
}

// ─── EXPORT TO EXCEL (Strict: NO Budget Column & NO Code) ─────
function exportToExcel() {
  const targetProposals = filteredProposals.filter(p => selectedManageIds.has(p.id));
  if (targetProposals.length === 0) {
    return showToast('กรุณาเลือกรายการที่ต้องการส่งออก (ทำเครื่องหมายถูกในช่องสี่เหลี่ยม)', 'warning');
  }

  const exportData = targetProposals.map((p, idx) => {
    let normStatus = p.status || 'เสนอเรื่องเข้ามา';
    if (normStatus === 'รอดำเนินการ' || normStatus === 'เข้าระบบแล้ว') normStatus = 'เสนอเรื่องเข้ามา';
    if (normStatus === 'บรรจุในแผนชุมชน') normStatus = 'บรรจุในแผน';

    return {
      'ลำดับ': idx + 1,
      'วัน เวลา (พ.ศ.) ที่ส่งเรื่อง': formatThaiDateTimeBE(p.timestamp || p.created_at, false),
      'ชุมชน / หมู่บ้าน': p.community || '',
      'คำนำหน้า': p.prefix || '',
      'ชื่อ-นามสกุล': p.name || '',
      'อายุ (ปี)': p.age || '',
      'เบอร์โทรศัพท์': p.phone || '',
      'สภาพปัญหาและสาเหตุ': p.problem || '',
      'แนวทางแก้ไขหรือโครงการที่ต้องการ': p.solution || '',
      'สถานที่ดำเนินการ': p.location || '',
      'สถานะ': normStatus,
      'เหตุผลกรณีไม่สามารถดำเนินการได้': p.reject_reason || p.notes || ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ข้อเสนอชุมชน');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `SALA_CONNECT_Proposals_${today}.xlsx`);
  showToast(`ส่งออก Excel สำเร็จ (${targetProposals.length} รายการ)`, 'success');
}

// ─── STATUS NORMALIZATION HELPER ─────────────────────────────
function normalizeStatus(st) {
  let s = st || 'เสนอเรื่องเข้ามา';
  if (s === 'รอดำเนินการ' || s === 'เข้าระบบแล้ว') s = 'เสนอเรื่องเข้ามา';
  if (s === 'บรรจุในแผนชุมชน') s = 'บรรจุในแผน';
  return s;
}

// ─── EXPORT TO PDF (Direct Client-Side Download, Matching Official Print Standard) ──
async function exportToPDF() {
  const targetProposals = filteredProposals.filter(p => selectedManageIds.has(p.id));
  if (targetProposals.length === 0) {
    return showToast('กรุณาเลือกรายการที่ต้องการส่งออกเป็น PDF (ทำเครื่องหมายถูกในช่องสี่เหลี่ยม)', 'warning');
  }

  if (typeof html2pdf === 'undefined') {
    return showToast('กำลังโหลดโมดูล PDF กรุณาลองใหม่อีกครั้ง', 'warning');
  }

  const includePhotos = document.getElementById('manageIncludePhotos')?.checked;
  showToast(`กำลังสร้างไฟล์ PDF (${targetProposals.length} รายการ)... กรุณารอสักครู่`, 'info');

  const today = new Date();
  const yearBE = today.getFullYear() + 543;
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const dateFormattedThai = `${today.getDate()} ${thaiMonths[today.getMonth()]} พ.ศ. ${yearBE}`;
  const filenameDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${yearBE}`;

  let container = null;
  try {
    // Build Table Rows (Strict: NO PRJ CODE, clean Thai date/time, clean wrap)
    let rowCounter = 0;
    const tableRowsHtml = targetProposals.map(p => {
      rowCounter++;
      const st = normalizeStatus(p.status);
      const reason = p.reject_reason || p.notes || '';
      const dateFormatted = formatThaiDateTimeBE(p.timestamp || p.created_at || p.pdpa_timestamp, false);

      return `
        <tr>
          <td style="border: 1px solid #333333; padding: 6px 4px; text-align: center; vertical-align: top; font-weight: 700;">${rowCounter}</td>
          <td style="border: 1px solid #333333; padding: 6px 6px; text-align: center; vertical-align: top; font-size: 8.5pt;">${dateFormatted}</td>
          <td style="border: 1px solid #333333; padding: 6px 8px; vertical-align: top; font-weight: 600; font-size: 9pt;">${escapeHtml(p.community || '-')}</td>
          <td style="border: 1px solid #333333; padding: 6px 8px; vertical-align: top;">
            <div style="font-weight: 600; font-size: 9.5pt; color: #0f172a; line-height: 1.35;">${escapeHtml(p.problem || '-')}</div>
            <div style="font-size: 8.5pt; color: #475569; margin-top: 4px; line-height: 1.3;"><b>แนวทางแก้ไข:</b> ${escapeHtml(p.solution || '-')}</div>
          </td>
          <td style="border: 1px solid #333333; padding: 6px 8px; vertical-align: top; font-size: 8.5pt;">
            <div>${escapeHtml(p.location || '-')}</div>
            ${p.gps_lat && p.gps_lng ? `<div style="font-size: 7.5pt; color: #0284c7; margin-top: 2px;">พิกัด GPS: ${p.gps_lat}, ${p.gps_lng}</div>` : ''}
            ${p.photo ? `<div style="font-size: 7.5pt; color: #7c3aed; margin-top: 2px; font-weight: 600;">[มีรูปภาพแนบ]</div>` : ''}
          </td>
          <td style="border: 1px solid #333333; padding: 6px 8px; vertical-align: top; font-size: 8.5pt;">
            <div style="font-weight: 600;">${escapeHtml(p.prefix || '')}${escapeHtml(p.name || '-')}</div>
            <div style="color: #64748b; font-size: 8pt; margin-top: 2px;">${p.age ? `อายุ ${p.age} ปี` : ''} ${p.phone ? `โทร: ${escapeHtml(p.phone)}` : ''}</div>
          </td>
          <td style="border: 1px solid #333333; padding: 6px 6px; text-align: center; vertical-align: top; font-size: 8.5pt;">
            <div style="font-weight: 700; color: ${st === 'เสนอเรื่องเข้ามา' ? '#92400e' : (st === 'ไม่สามารถดำเนินการได้' ? '#991b1b' : '#1e293b')};">${st}</div>
            ${st === 'ไม่สามารถดำเนินการได้' && reason ? `<div style="font-size: 7.5pt; color: #9f1239; margin-top: 2px;">(${escapeHtml(reason)})</div>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Build Appendix if photos included
    let appendixHtml = '';
    if (includePhotos) {
      const photosItems = targetProposals.filter(p => p.photo);
      if (photosItems.length > 0) {
        const cardsHtml = photosItems.map((p, idx) => `
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 12px; background: #ffffff; page-break-inside: avoid; break-inside: avoid;">
            <div style="display: flex; gap: 14px;">
              <div style="width: 200px; flex-shrink: 0; text-align: center;">
                <img src="${p.photo}" style="width: 100%; max-height: 160px; object-fit: cover; border-radius: 4px; border: 1px solid #94a3b8;" crossorigin="anonymous">
              </div>
              <div style="flex: 1; font-size: 9pt; line-height: 1.4;">
                <div style="font-weight: 700; color: #7c3aed; margin-bottom: 4px;">ภาพประกอบลำดับที่ ${idx + 1}: ${escapeHtml(p.community || '')}</div>
                <div style="margin-bottom: 3px;"><b>สภาพปัญหา:</b> ${escapeHtml(p.problem || '-')}</div>
                <div style="margin-bottom: 3px;"><b>แนวทางแก้ไข:</b> ${escapeHtml(p.solution || '-')}</div>
                <div style="margin-bottom: 3px;"><b>สถานที่:</b> ${escapeHtml(p.location || '-')} ${p.gps_lat && p.gps_lng ? `(GPS: ${p.gps_lat}, ${p.gps_lng})` : ''}</div>
                <div><b>ผู้เสนอ:</b> ${escapeHtml(p.prefix || '')}${escapeHtml(p.name || '-')} ${p.phone ? `(${escapeHtml(p.phone)})` : ''}</div>
              </div>
            </div>
          </div>
        `).join('');

        appendixHtml = `
          <div style="page-break-before: always; break-before: page; margin-top: 20px; padding-top: 14px;">
            <div style="text-align: center; margin-bottom: 14px;">
              <div style="font-size: 13pt; font-weight: 700; color: #000000;">ภาคผนวก: ภาพถ่ายสภาพปัญหาและรายละเอียดประกอบข้อเสนอ</div>
              <div style="font-size: 10pt; color: #475569;">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
            </div>
            ${cardsHtml}
          </div>
        `;
      }
    }

    // Create temporary container
    container = document.createElement('div');
    container.id = 'tempPdfRenderContainer';
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '1120px';
    container.style.background = '#ffffff';
    container.style.color = '#000000';
    container.style.fontFamily = "'Sarabun', 'Prompt', sans-serif";
    container.style.padding = '16px';
    container.style.boxSizing = 'border-box';
    container.style.zIndex = '-9999';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';

    container.innerHTML = `
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 14px;">
        <img src="logo/logoicon.png" style="height: 52px; width: auto; margin: 0 auto 6px auto; display: block;" onerror="this.style.display='none'">
        <div style="font-size: 14pt; font-weight: 700; color: #000000; line-height: 1.3;">แบบสรุปข้อเสนอโครงการและปัญหาความต้องการของประชาชน</div>
        <div style="font-size: 11pt; color: #333333; margin-top: 2px;">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
        <div style="font-size: 9pt; color: #64748b; margin-top: 4px;">รายงานข้อมูล ณ วันที่ ${dateFormattedThai} (จำนวนที่เลือกส่งออก ${targetProposals.length} รายการ)</div>
      </div>

      <!-- Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 8px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="border: 1px solid #333333; padding: 6px 4px; width: 32px; text-align: center;">ที่</th>
            <th style="border: 1px solid #333333; padding: 6px 6px; width: 120px; text-align: center;">วัน เวลา (พ.ศ.) ที่ส่งเรื่อง</th>
            <th style="border: 1px solid #333333; padding: 6px 8px; width: 150px; text-align: left;">ชุมชน / หมู่บ้าน</th>
            <th style="border: 1px solid #333333; padding: 6px 8px; text-align: left;">สภาพปัญหาและแนวทางแก้ไขที่ต้องการ</th>
            <th style="border: 1px solid #333333; padding: 6px 8px; width: 170px; text-align: left;">สถานที่ดำเนินการ</th>
            <th style="border: 1px solid #333333; padding: 6px 8px; width: 135px; text-align: left;">ผู้เสนอ (อายุ / เบอร์โทร)</th>
            <th style="border: 1px solid #333333; padding: 6px 6px; width: 110px; text-align: center;">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      ${appendixHtml}
    `;

    document.body.appendChild(container);

    const opt = {
      margin: [8, 8, 8, 8],
      filename: `แบบสรุปข้อเสนอโครงการ_เทศบาลตำบลแม่สาย_${filenameDate}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 1.5, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    await html2pdf().set(opt).from(container).save();
    showToast(`ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว (${targetProposals.length} รายการ)`, 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast(`เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ${err.message}`, 'error');
  } finally {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
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

// ─── ANNOUNCEMENTS & NEWS MANAGEMENT (Staff Only) ────────────
let manageNewsData = [];

async function openManageNewsModal() {
  const modal = document.getElementById('manageNewsModal');
  if (modal) modal.classList.add('active');
  resetManageNewsForm();
  await loadManageNewsList();
}

function closeManageNewsModal() {
  const modal = document.getElementById('manageNewsModal');
  if (modal) modal.classList.remove('active');
}

async function loadManageNewsList() {
  const container = document.getElementById('manageNewsList');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/news');
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      manageNewsData = data.data;
      if (manageNewsData.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--slate-400);">ยังไม่มีรายการประกาศ</div>';
        return;
      }
      container.innerHTML = manageNewsData.map(n => `
        <div style="background: #ffffff; border: 1px solid var(--slate-200); border-radius: var(--radius-sm); padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem; color: var(--slate-800);">${escapeHtml(n.title)}</div>
            <div style="font-size: 0.8rem; color: var(--slate-500); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(n.detail.replace(/\\n/g, ' '))}</div>
          </div>
          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button type="button" class="btn-sub-action" style="padding: 4px 10px; font-size: 0.78rem; height: 30px;" onclick="editManageNews(${n.id})">
              <i class="fas fa-edit"></i> แก้ไข
            </button>
            <button type="button" class="btn-sub-action danger" style="padding: 4px 10px; font-size: 0.78rem; height: 30px;" onclick="deleteManageNews(${n.id})">
              <i class="fas fa-trash"></i> ลบ
            </button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = '<div style="color: var(--danger); padding: 10px;">เกิดข้อผิดพลาดในการโหลดรายการ</div>';
  }
}

function editManageNews(id) {
  const item = manageNewsData.find(n => n.id === id);
  if (!item) return;
  document.getElementById('manageNewsId').value = item.id;
  document.getElementById('manageNewsTitle').value = item.title || '';
  document.getElementById('manageNewsDetail').value = item.detail || '';
  document.getElementById('manageNewsFormTitle').textContent = `แก้ไขประกาศ: ${item.title}`;
  document.getElementById('btnSaveManageNews').textContent = 'บันทึกการแก้ไข';
  document.getElementById('btnCancelNewsEdit').style.display = 'inline-flex';
}

function resetManageNewsForm() {
  document.getElementById('manageNewsId').value = '';
  document.getElementById('manageNewsTitle').value = '';
  document.getElementById('manageNewsDetail').value = '';
  document.getElementById('manageNewsFormTitle').textContent = '+ เพิ่มประกาศ/กำหนดการประชาคมใหม่';
  document.getElementById('btnSaveManageNews').textContent = 'บันทึกประกาศ';
  document.getElementById('btnCancelNewsEdit').style.display = 'none';
}

async function handleManageNewsSubmit(e) {
  e.preventDefault();
  const token = localStorage.getItem('sala_token');
  if (!token) return showToast('กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนดำเนินการ', 'warning');

  const id = document.getElementById('manageNewsId').value.trim();
  const title = document.getElementById('manageNewsTitle').value.trim();
  const detail = document.getElementById('manageNewsDetail').value.trim();
  if (!title || !detail) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');

  const isEditing = Boolean(id);
  const url = isEditing ? `${API_BASE}/news/${id}` : API_BASE + '/news';
  const method = isEditing ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title, detail })
    });
    const data = await res.json();
    if (data.success) {
      showToast(isEditing ? 'แก้ไขประกาศเรียบร้อยแล้ว' : 'เพิ่มประกาศเรียบร้อยแล้ว', 'success');
      resetManageNewsForm();
      await loadManageNewsList();
    } else {
      showToast(data.error || 'ไม่สามารถดำเนินการได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function deleteManageNews(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบประกาศนี้?')) return;
  const token = localStorage.getItem('sala_token');
  if (!token) return showToast('กรุณาเข้าสู่ระบบก่อน', 'warning');
  try {
    const res = await fetch(`${API_BASE}/news/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('ลบประกาศเรียบร้อยแล้ว', 'success');
      await loadManageNewsList();
    } else {
      showToast(data.error || 'ลบประกาศไม่สำเร็จ', 'error');
    }
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการลบประกาศ', 'error');
  }
}
