/**
 * ============================================================
 * MAESAI SALA CONNECT — Public Citizen SPA Logic (v4.0.0)
 * ============================================================
 */

let allNews = [];
let allProposals = [];
let currentCitizenPhoto = null;
let currentGpsData = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
  loadNews();

  // Set anti-bot form timestamp
  const ft = document.getElementById('formTokenTime');
  if (ft) ft.value = Date.now();
});

// ─── AUTHENTICATION STATUS (PUBLIC HEADER) ───────────────────
async function checkAuthSession() {
  const token = localStorage.getItem('sala_token');
  const nav = document.getElementById('publicHeaderNav');
  if (!nav) return;

  if (!token) {
    nav.innerHTML = `
      <a href="/sala/manage" class="btn-header" title="เข้าสู่ระบบสำหรับเจ้าหน้าที่เทศบาล">
        <i class="fas fa-user-lock"></i> เข้าสู่ระบบเจ้าหน้าที่
      </a>
    `;
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.user) {
      nav.innerHTML = `
        <a href="/sala/manage" class="btn-header btn-header-gold" title="เข้าสู่ระบบบริหารจัดการ">
          <i class="fas fa-tasks"></i> ระบบจัดการ (${escapeHtml(data.user.name || data.user.username)})
        </a>
        <button type="button" class="btn-header btn-header-staff" onclick="handlePublicLogout()" title="ออกจากระบบ">
          <i class="fas fa-sign-out-alt"></i> ออกจากระบบ
        </button>
      `;
    } else {
      localStorage.removeItem('sala_token');
      nav.innerHTML = `
        <a href="/sala/manage" class="btn-header" title="เข้าสู่ระบบสำหรับเจ้าหน้าที่เทศบาล">
          <i class="fas fa-user-lock"></i> เข้าสู่ระบบเจ้าหน้าที่
        </a>
      `;
    }
  } catch (e) {
    nav.innerHTML = `
      <a href="/sala/manage" class="btn-header" title="เข้าสู่ระบบสำหรับเจ้าหน้าที่เทศบาล">
        <i class="fas fa-user-lock"></i> เข้าสู่ระบบเจ้าหน้าที่
      </a>
    `;
  }
}

async function handlePublicLogout() {
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
  checkAuthSession();
  showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
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
  }, 3500);
}

// ─── SMART ADAPTIVE IMAGE COMPRESSION (Max 1280px, WebP/JPEG, ~80-120KB) ───
function compressCitizenImage(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) return resolve(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 1280;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Try WebP first for optimal file size, fallback to JPEG
          let resultDataUrl = canvas.toDataURL('image/webp', 0.80);
          if (!resultDataUrl || !resultDataUrl.startsWith('data:image/webp')) {
            resultDataUrl = canvas.toDataURL('image/jpeg', 0.78);
          }

          // If still > 220KB, adaptively re-encode with quality 0.68
          const approxBytes = Math.round((resultDataUrl.length - resultDataUrl.indexOf(',') - 1) * 0.75);
          if (approxBytes > 220 * 1024) {
            resultDataUrl = canvas.toDataURL('image/jpeg', 0.68);
          }

          const finalBytes = Math.round((resultDataUrl.length - resultDataUrl.indexOf(',') - 1) * 0.75);
          resolve({
            dataUrl: resultDataUrl,
            originalSize: file.size || finalBytes,
            compressedSize: finalBytes,
            width,
            height
          });
        } catch (err) {
          console.error('Image compression error:', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ─── PHOTO ATTACHMENT MODAL & TRIGGERS ───────────────────────
function openPhotoChoiceModal() {
  const m = document.getElementById('photoChoiceModal');
  if (m) m.classList.add('active');
}

function closePhotoChoiceModal(e) {
  if (e && e.target && e.target.closest && e.target.closest('.modal-card')) return;
  const m = document.getElementById('photoChoiceModal');
  if (m) m.classList.remove('active');
}

function triggerCameraInput() {
  const m = document.getElementById('photoChoiceModal');
  if (m) m.classList.remove('active');
  const inp = document.getElementById('citizenCameraFile');
  if (inp) inp.click();
}

function triggerGalleryInput() {
  const m = document.getElementById('photoChoiceModal');
  if (m) m.classList.remove('active');
  const inp = document.getElementById('citizenGalleryFile');
  if (inp) inp.click();
}

async function handleCitizenPhotoSelect(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)', 'warning');
    return;
  }

  const result = await compressCitizenImage(file);
  if (!result || !result.dataUrl) {
    showToast('เกิดข้อผิดพลาดในการประมวลผลรูปภาพ', 'error');
    return;
  }

  currentCitizenPhoto = result.dataUrl;

  const btnPhoto = document.getElementById('btnPhotoTrigger');
  const previewWrap = document.getElementById('photoPreviewWrap');
  const previewImg = document.getElementById('photoPreviewImg');
  const sizeBadge = document.getElementById('photoSizeBadge');

  if (previewImg && previewWrap && sizeBadge) {
    previewImg.src = result.dataUrl;
    const kbOrig = Math.round(result.originalSize / 1024);
    const kbComp = Math.round(result.compressedSize / 1024);
    sizeBadge.textContent = `ขนาดรูป: ${kbComp} KB (บีบอัดลดจาก ${kbOrig} KB คมชัดสูง ประหยัดพื้นที่)`;
    previewWrap.style.display = 'block';
    if (btnPhoto) btnPhoto.style.display = 'none';
  }
}

function removeCitizenPhoto() {
  currentCitizenPhoto = null;
  const fCam = document.getElementById('citizenCameraFile');
  const fGal = document.getElementById('citizenGalleryFile');
  const btnPhoto = document.getElementById('btnPhotoTrigger');
  const pw = document.getElementById('photoPreviewWrap');
  const pi = document.getElementById('photoPreviewImg');
  if (fCam) fCam.value = '';
  if (fGal) fGal.value = '';
  if (pw) pw.style.display = 'none';
  if (pi) pi.src = '';
  if (btnPhoto) btnPhoto.style.display = 'flex';
}

function changeCitizenPhoto() {
  removeCitizenPhoto();
  openPhotoChoiceModal();
}

// ─── GPS LOCATION PINNING ────────────────────────────────────
function getCurrentGpsLocation() {
  const btn = document.getElementById('btnGetGps');
  if (!navigator.geolocation) {
    showToast('อุปกรณ์หรือเบราว์เซอร์ของท่านไม่รองรับการดึงตำแหน่ง GPS', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `
    <div class="touch-action-icon gps"><i class="fas fa-spinner fa-spin"></i></div>
    <div class="touch-action-text">
      <span class="touch-action-title">กำลังค้นหาตำแหน่งพิกัดดาวเทียม...</span>
      <span class="touch-action-sub">กรุณารอสักครู่</span>
    </div>
  `;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      currentGpsData = { lat, lng };

      const latInput = document.getElementById('citizenGpsLat');
      const lngInput = document.getElementById('citizenGpsLng');
      const txt = document.getElementById('gpsCoordsText');
      const link = document.getElementById('gpsMapLink');
      const res = document.getElementById('gpsLocationResult');

      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;
      if (txt) txt.textContent = `พิกัด: ${lat}, ${lng}`;
      if (link) link.href = `https://www.google.com/maps?q=${lat},${lng}`;
      if (res) res.style.display = 'block';
      if (btn) btn.style.display = 'none';
      btn.disabled = false;
      showToast('ดึงพิกัดตำแหน่ง GPS สำเร็จ', 'success');
    },
    (err) => {
      btn.disabled = false;
      btn.innerHTML = `
        <div class="touch-action-icon gps"><i class="fas fa-map-marker-alt"></i></div>
        <div class="touch-action-text">
          <span class="touch-action-title">ปักหมุดตำแหน่งปัจจุบัน (GPS)</span>
          <span class="touch-action-sub">ดึงพิกัดจากมือถือเพื่อให้ลงพื้นที่ได้แม่นยำ</span>
        </div>
      `;
      let msg = 'ไม่สามารถดึงตำแหน่ง GPS ได้';
      if (err.code === 1) msg = 'กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง (Location Permission) ในเบราว์เซอร์';
      else if (err.code === 2) msg = 'สัญญาณ GPS ขัดข้องหรือไม่พร้อมใช้งาน';
      else if (err.code === 3) msg = 'หมดเวลาการค้นหาพิกัด GPS';
      showToast(msg, 'warning');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function removeGpsLocation() {
  currentGpsData = null;
  const latInput = document.getElementById('citizenGpsLat');
  const lngInput = document.getElementById('citizenGpsLng');
  const res = document.getElementById('gpsLocationResult');
  const btn = document.getElementById('btnGetGps');

  if (latInput) latInput.value = '';
  if (lngInput) lngInput.value = '';
  if (res) res.style.display = 'none';
  if (btn) {
    btn.style.display = 'flex';
    btn.disabled = false;
    btn.innerHTML = `
      <div class="touch-action-icon gps"><i class="fas fa-map-marker-alt"></i></div>
      <div class="touch-action-text">
        <span class="touch-action-title">ปักหมุดตำแหน่งปัจจุบัน (GPS)</span>
        <span class="touch-action-sub">ดึงพิกัดจากมือถือเพื่อให้ลงพื้นที่ได้แม่นยำ</span>
      </div>
    `;
  }
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

// ─── NEWS & COMMUNITY SCHEDULE MODULE (Citizen Read-Only) ───
function renderNewsCard(n) {
  const detail = n.detail || '';
  const title = n.title || '';

  // Extract structured info from detail
  const dateMatch = detail.match(/(วัน[ก-๙]+)?ที่\s*(\d+)\s*([ก-๙]+)\s*(\d{4})?/);
  const timeMatch = detail.match(/เวลา\s*([\d\.\s–\-]+น\.)/);
  const locMatch = detail.match(/ณ\s*([^\n\r]+)/) || detail.match(/(วัด[^\n\r]+|ศาลา[^\n\r]+|สำนักสงฆ์[^\n\r]+)/);

  const dayName = dateMatch ? (dateMatch[1] || '').trim() : '';
  const dayNum = dateMatch ? dateMatch[2] : '';
  const monthName = dateMatch ? dateMatch[3] : '';
  const yearNum = dateMatch ? (dateMatch[4] || '2569') : '2569';
  const timeStr = timeMatch ? timeMatch[1].trim() : '';
  let location = locMatch ? locMatch[0].replace(/^ณ\s*/, '').trim() : '';

  // Extract community from title or detail
  let commName = title.replace(/^กำหนดการประชาคม\s*/, '').trim();
  if (!commName && detail.includes('ชุมชน')) {
    const cm = detail.match(/ชุมชน\s*([^\s\n]+)/);
    if (cm) commName = cm[1];
  }

  // If it's a community meeting / schedule event with date
  if (dayNum && monthName) {
    return `
      <div class="event-card">
        <div class="event-date-tile">
          <div class="event-month-header">${escapeHtml(monthName)}</div>
          <div class="event-day-number">${escapeHtml(dayNum)}</div>
          <div class="event-day-name">${escapeHtml(dayName || 'วันประชาคม')}</div>
        </div>
        <div class="event-body">
          <div class="event-meta-row">
            ${commName ? `<span class="event-community-pill"><i class="fas fa-users"></i> ${escapeHtml(commName)}</span>` : ''}
            <span class="event-year-pill">ประจำปี พ.ศ. ${escapeHtml(yearNum)}</span>
          </div>
          <div class="event-title">${escapeHtml(title)}</div>
          <div class="event-info-grid">
            ${timeStr ? `
              <div class="event-info-item">
                <span class="event-info-icon"><i class="far fa-clock"></i></span>
                <span class="event-info-text">เวลา <strong>${escapeHtml(timeStr)}</strong></span>
              </div>
            ` : ''}
            ${location ? `
              <div class="event-info-item">
                <span class="event-info-icon"><i class="fas fa-map-marker-alt"></i></span>
                <span class="event-info-text">สถานที่: <strong>${escapeHtml(location)}</strong></span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // Fallback: General News announcement
  return `
    <div class="event-card">
      <div class="event-date-tile" style="background: #f1f5f9;">
        <div class="event-month-header" style="background: #e2e8f0; color: #475569;">ประกาศ</div>
        <div class="event-info-icon" style="font-size: 1.6rem; color: #64748b; margin: 6px 0;"><i class="fas fa-bullhorn"></i></div>
        <div class="event-day-name">${escapeHtml(n.date || '')}</div>
      </div>
      <div class="event-body">
        <div class="event-title">${escapeHtml(title)}</div>
        <div style="font-size: 0.85rem; color: var(--slate-600); line-height: 1.45; white-space: pre-line;">${escapeHtml(detail)}</div>
      </div>
    </div>
  `;
}

async function loadNews() {
  const container = document.getElementById('newsContainer');
  try {
    const res = await fetch('/api/news');
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      allNews = data.data;
      container.innerHTML = allNews.map(n => renderNewsCard(n)).join('');
    } else {
      container.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--slate-400);">ยังไม่มีประกาศข่าวสารในขณะนี้</div>`;
    }
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--danger);">ไม่สามารถโหลดข่าวสารได้</div>`;
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
      showToast('ลบข่าวสารเรียบร้อยแล้ว', 'success');
      loadNews();
    } else {
      showToast(data.error || 'ลบข่าวสารไม่สำเร็จ', 'error');
    }
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการลบข่าวสาร', 'error');
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
    photo: currentCitizenPhoto || null,
    gps_lat: document.getElementById('citizenGpsLat')?.value || null,
    gps_lng: document.getElementById('citizenGpsLng')?.value || null,
    website_trap_hp: document.getElementById('websiteTrapHp')?.value || '',
    form_token_time: document.getElementById('formTokenTime')?.value || '',
    pdpa_consent: form.pdpa_consent.checked
  };

  if (!payload.community || !payload.problem || !payload.solution || !payload.location) {
    return showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
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
      showToast(`บันทึกข้อเสนอโครงการเรียบร้อยแล้ว! รหัสข้อเสนอ: ${data.data.code}`, 'success');
      form.reset();
      removeCitizenPhoto();
      removeGpsLocation();
      const ft = document.getElementById('formTokenTime');
      if (ft) ft.value = Date.now();
      switchPage('history');
    } else {
      showToast(data.error || 'ไม่สามารถบันทึกข้อเสนอโครงการได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
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
      <div style="display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap;">
        ${p.photo ? `
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--primary); background: #faf5ff; border: 1px solid var(--primary-light); padding: 2px 8px; border-radius: 4px; font-weight: 600;">
            <i class="fas fa-camera"></i> มีรูปภาพแนบ
          </span>
        ` : ''}
        ${p.gps_lat && p.gps_lng ? `
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #065f46; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">
            <i class="fas fa-map-marker-alt"></i> มีพิกัด GPS
          </span>
        ` : ''}
      </div>
      ${(p.status === 'ไม่สามารถดำเนินการได้' && (p.reject_reason || p.notes)) ? `
        <div style="font-size: 0.8rem; color: #9f1239; background: #fff1f2; border: 1px solid #fecdd3; padding: 6px 10px; border-radius: var(--radius-sm); margin-top: 8px; line-height: 1.4;">
          <b>เหตุผลที่ไม่สามารถดำเนินการได้:</b> ${escapeHtml(p.reject_reason || p.notes)}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function getStatusBadge(status) {
  let norm = status || 'เข้าระบบแล้ว';
  if (norm === 'รอดำเนินการ') norm = 'เข้าระบบแล้ว';
  if (norm === 'บรรจุในแผนชุมชน') norm = 'บรรจุในแผน';

  let cls = 'badge-pending';
  if (norm.includes('พิจารณา')) cls = 'badge-review';
  else if (norm.includes('บรรจุ') || norm.includes('แผน')) cls = 'badge-inplan';
  else if (norm.includes('สำเร็จ') || norm.includes('แล้วเสร็จ')) cls = 'badge-completed';
  else if (norm.includes('ไม่')) cls = 'badge-rejected';
  return `<span class="badge-status ${cls}">${escapeHtml(norm)}</span>`;
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
    ${p.photo ? `
      <div style="margin-bottom: 12px; background: var(--slate-50); padding: 12px; border-radius: var(--radius-md);">
        <div style="font-weight: 700; color: var(--primary-dark); margin-bottom: 6px;">
          <i class="fas fa-image"></i> รูปถ่ายสภาพปัญหาที่แนบมา:
        </div>
        <a href="${p.photo}" target="_blank" title="คลิกเพื่อดูรูปภาพขนาดเต็ม">
          <img src="${p.photo}" alt="รูปถ่ายสภาพปัญหา" style="max-width: 100%; max-height: 240px; object-fit: contain; border-radius: 6px; border: 1px solid var(--slate-300); display: block;">
        </a>
      </div>
    ` : ''}
    ${p.gps_lat && p.gps_lng ? `
      <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 10px 14px; border-radius: var(--radius-md);">
        <div>
          <div style="font-weight: 700; color: #065f46; font-size: 0.85rem;"><i class="fas fa-map-marker-alt"></i> พิกัดตำแหน่ง GPS:</div>
          <div style="font-family: monospace; font-size: 0.85rem; color: #047857; margin-top: 2px;">${p.gps_lat}, ${p.gps_lng}</div>
        </div>
        <a href="https://www.google.com/maps?q=${p.gps_lat},${p.gps_lng}" target="_blank" class="btn-attach" style="background: #059669; color: #fff; border-color: #047857; text-decoration: none;">
          <i class="fas fa-external-link-alt"></i> เปิดแผนที่ Google Maps
        </a>
      </div>
    ` : ''}
    ${(p.status === 'ไม่สามารถดำเนินการได้' || p.reject_reason) ? `
      <div style="margin-bottom: 12px; background: #fff1f2; border: 1.5px solid #fecdd3; padding: 12px; border-radius: var(--radius-md);">
        <div style="font-weight: 700; color: #9f1239; margin-bottom: 4px;">
          <i class="fas fa-info-circle"></i> คำชี้แจงจากเจ้าหน้าที่ / เหตุผลที่ไม่สามารถดำเนินการได้:
        </div>
        <div style="color: #881337; line-height: 1.5;">${escapeHtml(p.reject_reason || p.notes || 'ส่งต่อประสานงานหน่วยงานภายนอก หรืออยู่นอกเหนืออำนาจหน้าที่ของเทศบาล')}</div>
      </div>
    ` : ''}
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
