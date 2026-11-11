/**
 * ============================================================
 * MAESAI SALA CONNECT — Official Print Viewport JS
 * Comprehensive Filters: Year (พ.ศ.), Date Range, Community, Status
 * Strict Invariants: NO budget column, NO signature lines, NO hardcoded year
 * User-Editable Report Title & Dynamic Date Subtitle
 * ============================================================
 */

let allProposals = [];
let appSettings = null;
let currentReportTitle = 'แบบสรุปข้อเสนอโครงการและปัญหาความต้องการของประชาชน';

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');
  const targetTemplate = urlParams.get('template');

  await loadSettings();
  await loadProposals();

  if (targetTemplate === 'individual' && targetId) {
    document.getElementById('reportTemplateSelect').value = 'individual_form';
  }

  renderSelectedTemplate();
});

function onCustomTitleChange(val) {
  currentReportTitle = val.trim() || 'แบบสรุปข้อเสนอโครงการและปัญหาความต้องการของประชาชน';
  const el = document.getElementById('displayReportTitle');
  if (el) el.innerText = currentReportTitle;
}

function onInlineTitleBlur(el) {
  currentReportTitle = el.innerText.trim() || 'แบบสรุปข้อเสนอโครงการและปัญหาความต้องการของประชาชน';
  const inputEl = document.getElementById('customReportTitleInput');
  if (inputEl) inputEl.value = currentReportTitle;
}

function formatThaiDateString(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const thaiYear = year > 2400 ? year : year + 543;
  return `${day} ${thaiMonths[month - 1] || ''} ${thaiYear}`;
}

function getThaiTodayString() {
  const d = new Date();
  const year = d.getFullYear() + 543;
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${year}`;
}

function getDateRangeSubtitle(dateFrom, dateTo) {
  if (dateFrom && dateTo) {
    return `ข้อมูลระหว่างวันที่ ${formatThaiDateString(dateFrom)} ถึงวันที่ ${formatThaiDateString(dateTo)}`;
  } else if (dateFrom) {
    return `ข้อมูลตั้งแต่วันที่ ${formatThaiDateString(dateFrom)}`;
  } else if (dateTo) {
    return `ข้อมูลถึงวันที่ ${formatThaiDateString(dateTo)}`;
  } else {
    return `ข้อมูล ณ วันที่ ${getThaiTodayString()}`;
  }
}

function normalizeStatus(s) {
  if (!s || s === 'รอดำเนินการ') return 'เข้าระบบแล้ว';
  if (s === 'บรรจุในแผนชุมชน') return 'บรรจุในแผน';
  return s;
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      appSettings = data.settings;

      const commSelect = document.getElementById('printCommunityFilter');
      if (commSelect && appSettings.communities) {
        commSelect.innerHTML = '<option value="all">ทุกชุมชน (10 ชุมชน)</option>' +
          appSettings.communities.map(c => `<option value="${c}">${c}</option>`).join('');
      }

      const statusSelect = document.getElementById('printStatusFilter');
      if (statusSelect) {
        const statuses = ['เข้าระบบแล้ว', 'อยู่ระหว่างพิจารณา', 'บรรจุในแผน', 'ดำเนินการแล้วเสร็จ', 'ไม่สามารถดำเนินการได้'];
        statusSelect.innerHTML = '<option value="all">ทุกสถานะ</option>' +
          statuses.map(s => `<option value="${s}">${s}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function loadProposals() {
  try {
    const res = await fetch('/api/proposals');
    const data = await res.json();
    if (data.success && data.data) {
      allProposals = data.data;

      // Extract unique Buddhist years dynamically
      const yearSet = new Set();
      allProposals.forEach(p => {
        let yearTh = null;
        if (p.code && p.code.includes('-')) {
          const match = p.code.match(/PRJ-(\d{4})-/);
          if (match) yearTh = match[1];
        }
        if (!yearTh && p.timestamp) {
          const y = parseInt(p.timestamp.slice(0, 4), 10);
          if (!isNaN(y)) yearTh = String(y > 2400 ? y : y + 543);
        }
        if (yearTh) yearSet.add(yearTh);
      });

      const yearSelect = document.getElementById('printYearFilter');
      if (yearSelect && yearSet.size > 0) {
        const sortedYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
        yearSelect.innerHTML = '<option value="all">ทุกปี (ทั้งหมด)</option>' +
          sortedYears.map(y => `<option value="${y}">พ.ศ. ${y}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load proposals:', err);
  }
}

function resetPrintFilters() {
  document.getElementById('printYearFilter').value = 'all';
  document.getElementById('printCommunityFilter').value = 'all';
  document.getElementById('printStatusFilter').value = 'all';
  document.getElementById('printDateFrom').value = '';
  document.getElementById('printDateTo').value = '';
  renderSelectedTemplate();
}

function renderSelectedTemplate() {
  const templateType = document.getElementById('reportTemplateSelect').value;
  const container = document.getElementById('printContainer');
  const urlParams = new URLSearchParams(window.location.search);
  const specificId = urlParams.get('id');

  const yearFilter = document.getElementById('printYearFilter').value;
  const commFilter = document.getElementById('printCommunityFilter').value;
  const statusFilter = document.getElementById('printStatusFilter').value;
  const dateFrom = document.getElementById('printDateFrom').value;
  const dateTo = document.getElementById('printDateTo').value;

  let filtered = [...allProposals];

  // Year filter (Buddhist year)
  if (yearFilter !== 'all') {
    filtered = filtered.filter(p => {
      let pYear = '';
      if (p.code) {
        const match = p.code.match(/PRJ-(\d{4})-/);
        if (match) pYear = match[1];
      }
      if (!pYear && p.timestamp) {
        const y = parseInt(p.timestamp.slice(0, 4), 10);
        if (!isNaN(y)) pYear = String(y > 2400 ? y : y + 543);
      }
      return pYear === yearFilter;
    });
  }

  // Community filter
  if (commFilter !== 'all') {
    filtered = filtered.filter(p => p.community === commFilter);
  }

  // Status filter (normalized)
  if (statusFilter !== 'all') {
    filtered = filtered.filter(p => normalizeStatus(p.status) === normalizeStatus(statusFilter));
  }

  // Date range filter
  if (dateFrom) {
    filtered = filtered.filter(p => p.timestamp && p.timestamp.slice(0, 10) >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter(p => p.timestamp && p.timestamp.slice(0, 10) <= dateTo);
  }

  if (templateType === 'individual_form') {
    if (specificId) {
      const match = allProposals.find(p => p.id === parseInt(specificId, 10));
      filtered = match ? [match] : filtered;
    }
    renderIndividualForms(container, filtered);
  } else if (templateType === 'community_summary') {
    renderCommunitySummary(container, filtered);
  } else {
    renderSummaryTable(container, filtered);
  }
}

// ─── TEMPLATE 1: SUMMARY TABLE (A4 LANDSCAPE) ───────────────
function renderSummaryTable(container, items) {
  const dateFrom = document.getElementById('printDateFrom')?.value;
  const dateTo = document.getElementById('printDateTo')?.value;
  const dateSubtitle = getDateRangeSubtitle(dateFrom, dateTo);

  const rowsHtml = items.map((p, idx) => {
    const st = normalizeStatus(p.status);
    const reason = p.reject_reason || p.notes || '';

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: center;"><strong>${p.code || '-'}</strong></td>
        <td>${p.community || '-'}</td>
        <td>
          <div style="font-weight: 600;">${p.problem || '-'}</div>
          <div style="font-size: 8.5pt; color: #475569; margin-top: 3px;">แนวทางแก้ไข: ${p.solution || '-'}</div>
        </td>
        <td>
          ${p.location || '-'}
          ${p.gps_lat && p.gps_lng ? `<br><small style="color: #0284c7;">GPS: ${p.gps_lat}, ${p.gps_lng}</small>` : ''}
          ${p.photo ? `<br><small style="color: #7c3aed;">[มีรูปภาพแนบ]</small>` : ''}
        </td>
        <td>${p.prefix || ''}${p.name || '-'}${p.phone ? `<br><small style="color: #64748b;">โทร: ${p.phone}</small>` : ''}</td>
        <td style="text-align: center;">
          <div style="font-weight: 600;">${st}</div>
          ${st === 'ไม่สามารถดำเนินการได้' && reason ? `
            <div style="font-size: 8pt; color: #9f1239; margin-top: 3px; line-height: 1.3;">(${reason})</div>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="print-page">
      <div class="official-header">
        <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
        <div class="official-title" id="displayReportTitle" contenteditable="true" title="คลิกเพื่อแก้ไขหัวข้อเอกสารได้โดยตรง" onblur="onInlineTitleBlur(this)">${currentReportTitle}</div>
        <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
        <div class="official-subtitle" style="font-size: 10pt; color: #334155; margin-top: 4px;">${dateSubtitle}</div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 40px;">ที่</th>
            <th style="width: 105px;">รหัสข้อเสนอ</th>
            <th style="width: 130px;">ชุมชน / หมู่บ้าน</th>
            <th>สภาพปัญหาและแนวทางแก้ไขที่ต้องการ</th>
            <th style="width: 160px;">สถานที่ดำเนินการ</th>
            <th style="width: 140px;">ผู้เสนอข้อเสนอ</th>
            <th style="width: 120px;">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 2rem;">ไม่พบข้อมูลข้อเสนอตามเงื่อนไขที่เลือก</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ─── TEMPLATE 2: INDIVIDUAL CITIZEN FORM (A4 PORTRAIT) ───────
function renderIndividualForms(container, items) {
  if (items.length === 0) {
    container.innerHTML = '<div class="print-page portrait"><p style="text-align:center;">ไม่พบข้อมูลสำหรับพิมพ์แบบฟอร์ม</p></div>';
    return;
  }

  const dateFrom = document.getElementById('printDateFrom')?.value;
  const dateTo = document.getElementById('printDateTo')?.value;
  const dateSubtitle = getDateRangeSubtitle(dateFrom, dateTo);

  container.innerHTML = items.map(p => {
    const st = normalizeStatus(p.status);
    const reason = p.reject_reason || p.notes || '';

    return `
      <div class="print-page portrait">
        <div class="official-header">
          <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
          <div class="official-title" contenteditable="true" title="คลิกเพื่อแก้ไขหัวข้อเอกสารได้โดยตรง">แบบเสนอโครงการและปัญหาความต้องการของประชาชน</div>
          <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
          <div class="official-subtitle" style="font-size: 9.5pt; color: #334155; margin-top: 4px;">${dateSubtitle}</div>
          <div class="official-meta">รหัสข้อเสนอ: <strong>${p.code || '-'}</strong></div>
        </div>

        <div class="form-box">
          <div class="form-box-title">1. ข้อมูลชุมชนและผู้เสนอโครงการ</div>
          <div class="field-row">
            <div class="field-label">ชุมชน / หมู่บ้าน:</div>
            <div class="field-val"><strong>${p.community || '-'}</strong></div>
          </div>
          <div class="field-row">
            <div class="field-label">ชื่อผู้เสนอ:</div>
            <div class="field-val">${p.prefix || ''}${p.name || 'ประชาชนในพื้นที่'} ${p.age ? `(อายุ ${p.age} ปี)` : ''}</div>
          </div>
          <div class="field-row">
            <div class="field-label">หมายเลขโทรศัพท์:</div>
            <div class="field-val">${p.phone || '-'}</div>
          </div>
          <div class="field-row">
            <div class="field-label">การยินยอม PDPA:</div>
            <div class="field-val">${p.pdpa_consent ? 'ยินยอมให้ใช้ข้อมูลเพื่อการจัดทำแผนพัฒนาชุมชน' : 'ยินยอม'}</div>
          </div>
        </div>

        <div class="form-box">
          <div class="form-box-title">2. รายละเอียดปัญหาและความต้องการ</div>
          <div class="field-row" style="margin-top: 0.5rem;">
            <div class="field-label">สภาพปัญหา / สาเหตุ:</div>
            <div class="field-val" style="line-height: 1.6;">${p.problem || '-'}</div>
          </div>
          <div class="field-row" style="margin-top: 0.5rem;">
            <div class="field-label">แนวทางแก้ไขหรือโครงการที่ต้องการ:</div>
            <div class="field-val" style="line-height: 1.6; font-weight: 600;">${p.solution || '-'}</div>
          </div>
          <div class="field-row" style="margin-top: 0.5rem;">
            <div class="field-label">สถานที่ดำเนินการ:</div>
            <div class="field-val">
              ${p.location || '-'}
              ${p.gps_lat && p.gps_lng ? `<br><small style="color: #0284c7;">พิกัด GPS: ${p.gps_lat}, ${p.gps_lng}</small>` : ''}
            </div>
          </div>
          ${p.photo ? `
            <div class="field-row" style="margin-top: 0.5rem;">
              <div class="field-label">รูปถ่ายสภาพปัญหา:</div>
              <div class="field-val">
                <img src="${p.photo}" alt="รูปถ่ายสภาพปัญหา" style="max-height: 120px; max-width: 220px; object-fit: contain; border: 1px solid #ccc; border-radius: 4px;">
              </div>
            </div>
          ` : ''}
        </div>

        <div class="form-box">
          <div class="form-box-title">3. สถานะการพิจารณา</div>
          <div class="field-row">
            <div class="field-label">สถานะปัจจุบัน:</div>
            <div class="field-val"><strong>${st}</strong></div>
          </div>
          ${st === 'ไม่สามารถดำเนินการได้' && reason ? `
            <div class="field-row" style="margin-top: 6px;">
              <div class="field-label" style="color: #9f1239;">เหตุผล / คำชี้แจง:</div>
              <div class="field-val" style="color: #881337; font-weight: 600; line-height: 1.5;">${reason}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ─── TEMPLATE 3: COMMUNITY BREAKDOWN SUMMARY ─────────────────
function renderCommunitySummary(container, items) {
  const dateFrom = document.getElementById('printDateFrom')?.value;
  const dateTo = document.getElementById('printDateTo')?.value;
  const dateSubtitle = getDateRangeSubtitle(dateFrom, dateTo);

  const commMap = {};
  items.forEach(p => {
    const c = p.community || 'ไม่ระบุชุมชน';
    if (!commMap[c]) commMap[c] = { count: 0, items: [] };
    commMap[c].count++;
    commMap[c].items.push(p);
  });

  const commRows = Object.keys(commMap).map((c, idx) => `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td><strong>${c}</strong></td>
      <td style="text-align: center; font-weight: 600;">${commMap[c].count} โครงการ</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="print-page portrait">
      <div class="official-header">
        <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
        <div class="official-title" id="displayReportTitle" contenteditable="true" title="คลิกเพื่อแก้ไขหัวข้อเอกสารได้โดยตรง" onblur="onInlineTitleBlur(this)">รายงานสรุปจำนวนข้อเสนอโครงการแยกรายชุมชน</div>
        <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
        <div class="official-subtitle" style="font-size: 10pt; color: #334155; margin-top: 4px;">${dateSubtitle}</div>
      </div>

      <table class="print-table" style="margin-top: 1.5rem;">
        <thead>
          <tr>
            <th style="width: 50px;">ลำดับ</th>
            <th>ชุมชน / หมู่บ้าน</th>
            <th style="width: 180px; text-align: center;">จำนวนข้อเสนอโครงการ</th>
          </tr>
        </thead>
        <tbody>
          ${commRows || '<tr><td colspan="3" style="text-align:center;">ไม่พบข้อมูล</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}
