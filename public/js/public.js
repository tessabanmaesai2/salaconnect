/**
 * ============================================================
 * MAESAI SALA CONNECT — Public Citizen SPA Logic (v3.8.5)
 * ============================================================
 */

let currentUser = null;
let allNews = [];
let allProposals = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
  loadNews();
});

// ─── AUTHENTICATION CHECK ────────────────────────────────────
async function checkAuthSession() {
  const token = localStorage.getItem('sala_token');
  if (!token) {
    updateAuthUI(null);
    return;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      updateAuthUI(currentUser);
    } else {
      localStorage.removeItem('sala_token');
      updateAuthUI(null);
    }
  } catch (e) {
    updateAuthUI(null);
  }
}

function updateAuthUI(user) {
  const btnLogin = document.getElementById('btnLoginTrigger');
  const staffSection = document.getElementById('userStaffSection');
  const staffNameTag = document.getElementById('staffNameTag');
  const btnAddNews = document.getElementById('btnAddNewsBtn');

  if (user) {
    if (btnLogin) btnLogin.classList.add('hidden');
    if (staffSection) staffSection.classList.remove('hidden');
    if (staffNameTag) staffNameTag.textContent = user.name || user.username;
    if (btnAddNews) btnAddNews.classList.remove('hidden');
  } else {
    if (btnLogin) btnLogin.classList.remove('hidden');
    if (staffSection) staffSection.classList.add('hidden');
    if (btnAddNews) btnAddNews.classList.add('hidden');
  }
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.add('active');
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.remove('active');
}

async function handleStaffLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  const btn = document.getElementById('btnLoginSubmit');

  if (!username || !password) return alert('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  btn.disabled = true;
  btn.textContent = 'กำลังตรวจสอบ...';

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
      updateAuthUI(currentUser);
      closeLoginModal();
      alert(`ยินดีต้อนรับ เจ้าหน้าที่: ${currentUser.name || currentUser.username}`);
      loadNews();
    } else {
      alert(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ตกลง';
  }
}

async function handleLogout() {
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
  updateAuthUI(null);
  alert('ออกจากระบบเรียบร้อยแล้ว');
  switchPage('home');
}

// ─── SPA TAB SWITCHING ───────────────────────────────────────
function switchPage(page) {
  document.getElementById('tab-home').classList.add('hidden');
  document.getElementById('tab-proposal').classList.add('hidden');
  document.getElementById('tab-history').classList.add('hidden');

  document.getElementById('navHome').classList.remove('active');
  document.getElementById('navProposal').classList.remove('active');
  document.getElementById('navHistory').classList.remove('active');

  if (page === 'home') {
    document.getElementById('tab-home').classList.remove('hidden');
    document.getElementById('navHome').classList.add('active');
    loadNews();
  } else if (page === 'proposal') {
    document.getElementById('tab-proposal').classList.remove('hidden');
    document.getElementById('navProposal').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (page === 'history') {
    document.getElementById('tab-history').classList.remove('hidden');
    document.getElementById('navHistory').classList.add('active');
    loadHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ─── NEWS MODULE ─────────────────────────────────────────────
async function loadNews() {
  const container = document.getElementById('newsContainer');
  try {
    const res = await fetch('/api/news');
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      allNews = data.data;
      container.innerHTML = allNews.map(n => `
        <div class="news-card">
          <div class="news-card-date"><i class="fas fa-calendar-alt"></i> ${n.date || ''}</div>
          <div class="news-card-title">${escapeHtml(n.title)}</div>
          <div class="news-card-preview">${escapeHtml(n.detail)}</div>
          ${currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin') ? `
            <div style="margin-top: 10px; text-align: right;">
              <button class="btn-v3-pill danger" style="padding: 4px 10px; font-size: 0.75rem;" onclick="deleteNews(${n.id})">
                <i class="fas fa-trash"></i> ลบข่าว
              </button>
            </div>
          ` : ''}
        </div>
      `).join('');
    } else {
      container.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--slate-400);">ยังไม่มีประกาศข่าวสารในขณะนี้</div>`;
    }
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--danger);">ไม่สามารถโหลดข่าวสารได้</div>`;
  }
}

function openAddNewsModal() {
  const modal = document.getElementById('newsModal');
  if (modal) modal.classList.add('active');
}

function closeAddNewsModal() {
  const modal = document.getElementById('newsModal');
  if (modal) modal.classList.remove('active');
}

async function submitNews(e) {
  e.preventDefault();
  const token = localStorage.getItem('sala_token');
  if (!token) return alert('กรุณาเข้าสู่ระบบก่อนดำเนินการ');

  const title = document.getElementById('newsTitle').value.trim();
  const detail = document.getElementById('newsDetail').value.trim();
  if (!title || !detail) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

  try {
    const res = await fetch('/api/news', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title, detail })
    });
    const data = await res.json();
    if (data.success) {
      alert('บันทึกข่าวสารเรียบร้อยแล้ว');
      document.getElementById('formAddNews').reset();
      closeAddNewsModal();
      loadNews();
    } else {
      alert(data.error || 'ไม่สามารถบันทึกข่าวสารได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}

async function deleteNews(id) {
  if (!confirm('คุณต้องการลบข่าวสารนี้ใช่หรือไม่?')) return;
  const token = localStorage.getItem('sala_token');
  try {
    const res = await fetch(`/api/news/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      alert('ลบข่าวสารเรียบร้อยแล้ว');
      loadNews();
    } else {
      alert(data.error || 'ลบข่าวสารไม่สำเร็จ');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด');
  }
}

// ─── PROPOSAL SUBMISSION ─────────────────────────────────────
async function submitProposal(e) {
  e.preventDefault();
  const form = document.getElementById('formProposal');
  const btn = document.getElementById('btnSubmitProp');

  const payload = {
    community: form.community.value.trim(),
    prefix: form.prefix.value.trim(),
    name: form.name.value.trim(),
    age: form.age.value ? parseInt(form.age.value, 10) : null,
    problem: form.problem.value.trim(),
    solution: form.solution.value.trim(),
    location: form.location.value.trim(),
    phone: form.phone.value.trim(),
    pdpa_consent: form.pdpa_consent.checked
  };

  if (!payload.community || !payload.problem || !payload.solution || !payload.location) {
    return alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...';

  try {
    const res = await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`บันทึกข้อเสนอโครงการเรียบร้อยแล้ว!\nรหัสข้อเสนอของคุณคือ: ${data.data.code}`);
      form.reset();
      switchPage('history');
    } else {
      alert(data.error || 'ไม่สามารถบันทึกข้อเสนอโครงการได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งข้อเสนอโครงการ';
  }
}

// ─── PROPOSALS TRACKING & HISTORY ────────────────────────────
async function loadHistory() {
  const container = document.getElementById('historyContainer');
  const isPublic = !currentUser;

  try {
    const res = await fetch(`/api/proposals?public=${isPublic ? 'true' : 'false'}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      allProposals = data.data;
      filterHistory();
    } else {
      container.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--slate-400);">ไม่พบรายการข้อเสนอ</div>`;
    }
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--danger);">ไม่สามารถโหลดข้อมูลข้อเสนอได้</div>`;
  }
}

function filterHistory() {
  const search = (document.getElementById('searchHistory').value || '').toLowerCase().trim();
  const comm = document.getElementById('filterHistoryCommunity').value;
  const container = document.getElementById('historyContainer');

  let list = allProposals.filter(p => {
    const matchComm = (comm === 'all' || p.community === comm);
    const matchSearch = !search ||
      (p.code && p.code.toLowerCase().includes(search)) ||
      (p.problem && p.problem.toLowerCase().includes(search)) ||
      (p.solution && p.solution.toLowerCase().includes(search)) ||
      (p.location && p.location.toLowerCase().includes(search)) ||
      (p.community && p.community.toLowerCase().includes(search));
    return matchComm && matchSearch;
  });

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--slate-400);">ไม่พบข้อเสนอโครงการที่ตรงกับเงื่อนไข</div>`;
    return;
  }

  container.innerHTML = list.map(p => `
    <div class="v3-card" style="padding: 16px; margin-bottom: 12px; cursor: pointer;" onclick="openDetailModal(${p.id})">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <span style="font-family: var(--font-heading); font-weight: 700; color: var(--primary); font-size: 0.95rem;">${p.code || 'PRJ'}</span>
        ${getStatusBadge(p.status)}
      </div>
      <div style="font-size: 0.8rem; color: var(--slate-400); margin-bottom: 6px;">
        <i class="fas fa-map-marker-alt" style="color: var(--secondary);"></i> ${escapeHtml(p.community || '')} • ${p.timestamp ? p.timestamp.slice(0, 10) : ''}
      </div>
      <div style="font-weight: 600; color: var(--slate-800); font-size: 0.95rem; margin-bottom: 6px; line-height: 1.4;">
        ${escapeHtml(p.problem || '')}
      </div>
      <div style="font-size: 0.85rem; color: var(--slate-600); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
        <b>แนวทางแก้ไข:</b> ${escapeHtml(p.solution || '')}
      </div>
    </div>
  `).join('');
}

function getStatusBadge(status) {
  status = status || 'รอดำเนินการ';
  let cls = 'badge-pending';
  if (status.includes('พิจารณา')) cls = 'badge-review';
  else if (status.includes('บรรจุ') || status.includes('แผน')) cls = 'badge-inplan';
  else if (status.includes('สำเร็จ') || status.includes('แล้วเสร็จ')) cls = 'badge-completed';
  else if (status.includes('ไม่')) cls = 'badge-rejected';
  return `<span class="badge-status ${cls}">${escapeHtml(status)}</span>`;
}

function openDetailModal(id) {
  const p = allProposals.find(item => item.id === id);
  if (!p) return;

  document.getElementById('detailCodeTitle').textContent = `ข้อเสนอ ${p.code || ''}`;
  document.getElementById('detailBody').innerHTML = `
    <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <span><b>วันที่เสนอ:</b> ${p.timestamp || ''}</span>
      ${getStatusBadge(p.status)}
    </div>
    <div style="margin-bottom: 10px;"><b>ชุมชน/หมู่บ้าน:</b> ${escapeHtml(p.community || '')}</div>
    <div style="margin-bottom: 10px;"><b>สถานที่ดำเนินการ:</b> ${escapeHtml(p.location || '')}</div>
    <div style="margin-bottom: 12px; background: var(--slate-50); padding: 12px; border-radius: var(--radius-md);">
      <div style="font-weight: 700; color: var(--primary); margin-bottom: 4px;">สภาพปัญหาและสาเหตุ:</div>
      <div>${escapeHtml(p.problem || '')}</div>
    </div>
    <div style="margin-bottom: 12px; background: var(--slate-50); padding: 12px; border-radius: var(--radius-md);">
      <div style="font-weight: 700; color: var(--success); margin-bottom: 4px;">แนวทางแก้ไขหรือโครงการที่ต้องการ:</div>
      <div>${escapeHtml(p.solution || '')}</div>
    </div>
    ${currentUser ? `
      <div style="border-top: 1px solid var(--slate-200); padding-top: 10px; margin-top: 10px; font-size: 0.85rem; color: var(--slate-600);">
        <div><b>ผู้เสนอ:</b> ${escapeHtml(p.prefix || '')} ${escapeHtml(p.name || '')} (อายุ ${p.age || '-'} ปี)</div>
        <div><b>เบอร์โทรศัพท์:</b> ${escapeHtml(p.phone || '-')}</div>
      </div>
    ` : ''}
  `;
  document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
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
