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
    const res = await fetch('/api/auth/me', {
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
  document.getElementById('staffTag').classList.add('hidden');
  document.getElementById('btnLogout').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginGateScreen').classList.add('hidden');
  document.getElementById('mainDashboardScreen').classList.remove('hidden');

  const staffTag = document.getElementById('staffTag');
  const btnLogout = document.getElementById('btnLogout');
  if (staffTag && currentUser) {
    staffTag.textContent = `เจ้าหน้าที่: ${currentUser.name || currentUser.username} (${currentUser.role})`;
    staffTag.classList.remove('hidden');
  }
  if (btnLogout) btnLogout.classList.remove('hidden');
}

async function handleGateLogin(e) {
  e.preventDefault();
  const username = document.getElementById('gateUser').value.trim();
  const password = document.getElementById('gatePass').value.trim();
  const btn = document.getElementById('btnGateSubmit');

  if (!username || !password) return alert('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      localStorage.setItem('sala_token', data.token);
      currentUser = data.user;
      showDashboard();
      await loadProposals();
    } else {
      alert(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
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
      await fetch('/api/auth/logout', {
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
    const res = await fetch('/api/proposals', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      allProposals = data.data;

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
    let s = p.status || 'เข้าระบบแล้ว';
    if (s === 'รอดำเนินการ') s = 'เข้าระบบแล้ว';
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
    document.getElementById('manageStatusFilter').value = 'เข้าระบบแล้ว';
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
      let pNorm = p.status || 'เข้าระบบแล้ว';
      if (pNorm === 'รอดำเนินการ') pNorm = 'เข้าระบบแล้ว';
      if (pNorm === 'บรรจุในแผนชุมชน') pNorm = 'บรรจุในแผน';

      let fNorm = statusFilter;
      if (fNorm === 'รอดำเนินการ') fNorm = 'เข้าระบบแล้ว';
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--slate-400);">ไม่พบรายการข้อเสนอที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    let normStatus = p.status || 'เข้าระบบแล้ว';
    if (normStatus === 'รอดำเนินการ') normStatus = 'เข้าระบบแล้ว';
    if (normStatus === 'บรรจุในแผนชุมชน') normStatus = 'บรรจุในแผน';

    const reasonText = p.reject_reason || p.notes || '';

    return `
    <tr>
      <td>
        <strong style="color: var(--primary); font-family: var(--font-heading);">${escapeHtml(p.code || 'PRJ')}</strong>
        <div style="font-size: 0.75rem; color: var(--slate-400); margin-top: 2px;">
          ${p.timestamp ? p.timestamp.slice(0, 10) : ''}
        </div>
        <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
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
      <td>
        <strong>${escapeHtml(p.community || '-')}</strong>
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
      <td>
        <div style="font-weight: 600;">${escapeHtml(p.prefix || '')}${escapeHtml(p.name || '-')}</div>
        <div style="font-size: 0.78rem; color: var(--slate-500);">
          ${p.age ? `อายุ ${p.age} ปี` : ''} ${p.phone ? `• โทร ${escapeHtml(p.phone)}` : ''}
        </div>
      </td>
      <td style="text-align: center;">
        <select class="select-status-inline" onchange="changeStatusInline(${p.id}, this.value)">
          <option value="เข้าระบบแล้ว" ${normStatus === 'เข้าระบบแล้ว' ? 'selected' : ''}>เข้าระบบแล้ว</option>
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
      <td style="text-align: center;">
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
    const res = await fetch(`/api/proposals/${id}`, {
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
      alert(data.error || 'ไม่สามารถเปลี่ยนสถานะได้');
      loadProposals();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

// ─── ADD / EDIT MODAL ────────────────────────────────────────
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
  document.getElementById('editStatus').value = 'เข้าระบบแล้ว';
  document.getElementById('editRejectReason').value = '';
  handleModalStatusChange('เข้าระบบแล้ว');

  const photoArea = document.getElementById('editPhotoPreviewArea');
  const gpsArea = document.getElementById('editGpsPreviewArea');
  if (photoArea) photoArea.innerHTML = '<span style="font-size: 0.8rem; color: var(--slate-400);">ไม่มีรูปภาพแนบ</span>';
  if (gpsArea) gpsArea.innerHTML = '<span style="font-size: 0.8rem; color: var(--slate-400);">ไม่มีพิกัด GPS แนบ</span>';

  document.getElementById('editModal').classList.add('active');
}

function openEditModal(id) {
  const p = allProposals.find(item => item.id === id);
  if (!p) return;

  document.getElementById('modalTitle').textContent = `แก้ไขข้อเสนอโครงการ: ${p.code || ''}`;
  document.getElementById('editId').value = p.id;
  document.getElementById('editCommunity').value = p.community || 'แม่สาย หมู่ 1';
  document.getElementById('editPrefix').value = p.prefix || 'นาย';
  document.getElementById('editName').value = p.name || '';
  document.getElementById('editAge').value = p.age || '';
  document.getElementById('editPhone').value = p.phone || '';
  document.getElementById('editProblem').value = p.problem || '';
  document.getElementById('editSolution').value = p.solution || '';
  document.getElementById('editLocation').value = p.location || '';

  let normStatus = p.status || 'เข้าระบบแล้ว';
  if (normStatus === 'รอดำเนินการ') normStatus = 'เข้าระบบแล้ว';
  if (normStatus === 'บรรจุในแผนชุมชน') normStatus = 'บรรจุในแผน';

  document.getElementById('editStatus').value = normStatus;
  document.getElementById('editRejectReason').value = p.reject_reason || p.notes || '';
  handleModalStatusChange(normStatus);

  const photoArea = document.getElementById('editPhotoPreviewArea');
  const gpsArea = document.getElementById('editGpsPreviewArea');
  if (photoArea) {
    if (p.photo) {
      photoArea.innerHTML = `
        <div style="font-size: 0.8rem; margin-bottom: 4px;"><b>รูปถ่ายสภาพปัญหา:</b></div>
        <a href="${p.photo}" target="_blank" title="คลิกเพื่อดูรูปขนาดเต็ม">
          <img src="${p.photo}" alt="รูปถ่าย" style="max-height: 120px; max-width: 100%; object-fit: contain; border-radius: 4px; border: 1px solid #ccc;">
        </a>
      `;
    } else {
      photoArea.innerHTML = '<span style="font-size: 0.8rem; color: var(--slate-400);">ไม่มีรูปภาพแนบ</span>';
    }
  }

  if (gpsArea) {
    if (p.gps_lat && p.gps_lng) {
      gpsArea.innerHTML = `
        <div style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between;">
          <span><b>พิกัด GPS:</b> <code>${p.gps_lat}, ${p.gps_lng}</code></span>
          <a href="https://www.google.com/maps?q=${p.gps_lat},${p.gps_lng}" target="_blank" class="btn-attach" style="padding: 2px 8px; font-size: 0.75rem; text-decoration: none;">
            <i class="fas fa-map"></i> ดูใน Google Maps
          </a>
        </div>
      `;
    } else {
      gpsArea.innerHTML = '<div style="margin-top: 4px; font-size: 0.8rem; color: var(--slate-400);">ไม่มีพิกัด GPS แนบ</div>';
    }
  }

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
    notes: rejectReasonVal
  };

  const btn = document.getElementById('btnSaveProposal');
  btn.disabled = true;

  try {
    const url = isEdit ? `/api/proposals/${id}` : '/api/proposals';
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
      alert(isEdit ? 'แก้ไขข้อมูลเรียบร้อยแล้ว' : 'สร้างข้อเสนอใหม่เรียบร้อยแล้ว');
      closeEditModal();
      await loadProposals();
    } else {
      alert(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    btn.disabled = false;
  }
}
  }
}

async function deleteProposal(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อเสนอโครงการนี้?')) return;
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch(`/api/proposals/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      alert('ลบข้อมูลเรียบร้อยแล้ว');
      await loadProposals();
    } else {
      alert(data.error || 'สิทธิ์ไม่เพียงพอสำหรับการลบ');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

// ─── EXPORT TO EXCEL (Strict: NO Budget Column) ──────────────
function exportToExcel() {
  if (filteredProposals.length === 0) {
    return alert('ไม่มีข้อมูลสำหรับส่งออก');
  }

  const exportData = filteredProposals.map((p, idx) => ({
    'ลำดับ': idx + 1,
    'รหัสข้อเสนอ': p.code || '',
    'วันที่บันทึก': p.timestamp || '',
    'ชุมชน / หมู่บ้าน': p.community || '',
    'คำนำหน้า': p.prefix || '',
    'ชื่อ-นามสกุล': p.name || '',
    'อายุ (ปี)': p.age || '',
    'เบอร์โทรศัพท์': p.phone || '',
    'สภาพปัญหาและสาเหตุ': p.problem || '',
    'แนวทางแก้ไขหรือโครงการที่ต้องการ': p.solution || '',
    'สถานที่ดำเนินการ': p.location || '',
    'สถานะโครงการ': (p.status === 'รอดำเนินการ') ? 'เข้าระบบแล้ว' : ((p.status === 'บรรจุในแผนชุมชน') ? 'บรรจุในแผน' : (p.status || 'เข้าระบบแล้ว')),
    'เหตุผลกรณีไม่สามารถดำเนินการได้': p.reject_reason || p.notes || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ข้อเสนอชุมชน');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `SALA_CONNECT_Proposals_${today}.xlsx`);
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
