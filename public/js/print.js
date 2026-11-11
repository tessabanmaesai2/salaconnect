/**
 * ============================================================
 * MAESAI SALA CONNECT — Official Print & PDF Export Viewport JS
 * Comprehensive Filters: Year (พ.ศ.), Date Range, Community, Status
 * Features:
 *  - Dynamic Buddhist Era Date/Time (วัน เวลา พ.ศ. ที่ส่งเรื่อง)
 *  - Removed proposal code (PRJ-xxx) from printout as required
 *  - Official Status: 'เสนอเรื่องเข้ามา' instead of 'เข้าระบบแล้ว'
 *  - Item-by-item selection checkboxes (ติ๊กเลือกเฉพาะข้อที่ต้องการพิมพ์)
 *  - Photo & Details Appendix on a SEPARATE page (break-before: page)
 *  - Dedicated PDF Export function (ส่งออกเป็น PDF) & Image download
 * ============================================================
 */

let allProposals = [];
let appSettings = null;
let currentReportTitle = 'แบบสรุปข้อเสนอโครงการและปัญหาความต้องการของประชาชน';
const selectedItemIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');
  const targetTemplate = urlParams.get('template');
  const targetIds = urlParams.get('ids');
  const photosParam = urlParams.get('photos');
  const autoAction = urlParams.get('auto');

  await loadSettings();
  await loadProposals();

  // Apply filters from query params if passed
  const yearParam = urlParams.get('year');
  if (yearParam && document.getElementById('printYearFilter')) {
    document.getElementById('printYearFilter').value = yearParam;
  }
  const commParam = urlParams.get('community');
  if (commParam && document.getElementById('printCommunityFilter')) {
    document.getElementById('printCommunityFilter').value = commParam;
  }
  const statusParam = urlParams.get('status');
  if (statusParam && document.getElementById('printStatusFilter')) {
    document.getElementById('printStatusFilter').value = statusParam;
  }
  const fromParam = urlParams.get('dateFrom');
  if (fromParam && document.getElementById('printDateFrom')) {
    document.getElementById('printDateFrom').value = fromParam;
  }
  const toParam = urlParams.get('dateTo');
  if (toParam && document.getElementById('printDateTo')) {
    document.getElementById('printDateTo').value = toParam;
  }

  // Handle specific item selection
  if (targetIds) {
    selectedItemIds.clear();
    targetIds.split(',').forEach(s => {
      const nid = parseInt(s.trim(), 10);
      if (!isNaN(nid)) selectedItemIds.add(nid);
    });
  }

  if (photosParam !== null && document.getElementById('chkIncludePhotos')) {
    document.getElementById('chkIncludePhotos').checked = (photosParam === '1' || photosParam === 'true');
  }

  if (targetTemplate === 'individual' && targetId) {
    document.getElementById('reportTemplateSelect').value = 'individual_form';
  } else if (targetTemplate === 'photos') {
    document.getElementById('reportTemplateSelect').value = 'photo_appendix';
  }

  renderSelectedTemplate();

  if (autoAction === 'pdf') {
    setTimeout(() => {
      exportPDF();
    }, 600);
  } else if (autoAction === 'print') {
    setTimeout(() => {
      window.print();
    }, 600);
  }
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

/**
 * Format timestamp into clean Thai Buddhist Era (พ.ศ.) format
 * e.g. "2026-02-15 09:30:00" -> "15 ก.พ. 2569<br>09:30 น."
 */
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

/**
 * Standardize status term:
 * "เข้าระบบแล้ว" -> "เสนอเรื่องเข้ามา" (เพื่อความชัดเจนตอนนำเสนอผู้บริหาร/เจ้านาย)
 */
function normalizeStatus(s) {
  if (!s || s === 'รอดำเนินการ' || s === 'เข้าระบบแล้ว') return 'เสนอเรื่องเข้ามา';
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
        const statuses = ['เสนอเรื่องเข้ามา', 'อยู่ระหว่างพิจารณา', 'บรรจุในแผน', 'ดำเนินการแล้วเสร็จ', 'ไม่สามารถดำเนินการได้'];
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

      // Select all by default
      allProposals.forEach(p => selectedItemIds.add(p.id));

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
  allProposals.forEach(p => selectedItemIds.add(p.id));
  renderSelectedTemplate();
}

// ─── ITEM-BY-ITEM SELECTION LOGIC ─────────────────────────────
function toggleRowSelection(id, isChecked) {
  if (isChecked) {
    selectedItemIds.add(id);
  } else {
    selectedItemIds.delete(id);
  }
  updateSelectionSummary();
  renderSelectedTemplate();
}

function selectAllItems(select) {
  const currentFiltered = getFilteredProposals();
  if (select) {
    currentFiltered.forEach(p => selectedItemIds.add(p.id));
  } else {
    currentFiltered.forEach(p => selectedItemIds.delete(p.id));
  }
  updateSelectionSummary();
  renderSelectedTemplate();
}

function toggleIncludePhotos(checked) {
  renderSelectedTemplate();
}

function updateSelectionSummary() {
  const currentFiltered = getFilteredProposals();
  let selectedCount = 0;
  currentFiltered.forEach(p => {
    if (selectedItemIds.has(p.id)) selectedCount++;
  });

  const badge = document.getElementById('selectionSummaryBadge');
  if (badge) {
    badge.innerText = `เลือกแล้ว ${selectedCount}/${currentFiltered.length} รายการ`;
  }
}

function getFilteredProposals() {
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

  return filtered;
}

function renderSelectedTemplate() {
  const templateType = document.getElementById('reportTemplateSelect').value;
  const container = document.getElementById('printContainer');
  const urlParams = new URLSearchParams(window.location.search);
  const specificId = urlParams.get('id');

  let filtered = getFilteredProposals();
  updateSelectionSummary();

  if (templateType === 'individual_form') {
    if (specificId) {
      const match = allProposals.find(p => p.id === parseInt(specificId, 10));
      filtered = match ? [match] : filtered;
    } else {
      // Filter by selection
      filtered = filtered.filter(p => selectedItemIds.has(p.id));
    }
    renderIndividualForms(container, filtered);
  } else if (templateType === 'community_summary') {
    renderCommunitySummary(container, filtered.filter(p => selectedItemIds.has(p.id)));
  } else if (templateType === 'photo_appendix') {
    renderPhotoAppendixOnly(container, filtered);
  } else {
    // Default: summary_table or summary_with_photos
    renderSummaryTable(container, filtered);
  }
}

// ─── TEMPLATE 1: SUMMARY TABLE (A4 LANDSCAPE) ───────────────
function renderSummaryTable(container, allFiltered) {
  const dateFrom = document.getElementById('printDateFrom')?.value;
  const dateTo = document.getElementById('printDateTo')?.value;
  const dateSubtitle = getDateRangeSubtitle(dateFrom, dateTo);

  const templateType = document.getElementById('reportTemplateSelect')?.value;
  const chkIncludePhotos = document.getElementById('chkIncludePhotos');
  const shouldIncludePhotos = (templateType === 'summary_with_photos') || (chkIncludePhotos && chkIncludePhotos.checked);

  // Selected proposals to print
  const selectedFiltered = allFiltered.filter(p => selectedItemIds.has(p.id));
  const isAllChecked = allFiltered.length > 0 && selectedFiltered.length === allFiltered.length;

  let rowCounter = 0;
  const rowsHtml = allFiltered.map(p => {
    const isChecked = selectedItemIds.has(p.id);
    const st = normalizeStatus(p.status);
    const reason = p.reject_reason || p.notes || '';
    if (isChecked) rowCounter++;

    return `
      <tr class="${isChecked ? '' : 'screen-only'}" style="${isChecked ? '' : 'opacity: 0.4; background: #f8fafc;'}">
        <td class="screen-checkbox-col" style="text-align: center; vertical-align: middle;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleRowSelection(${p.id}, this.checked)" title="เลือกเพื่อพิมพ์ข้อนี้" style="width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer;">
        </td>
        <td style="text-align: center; vertical-align: middle; font-weight: 700;">
          ${isChecked ? rowCounter : '-'}
        </td>
        <td style="text-align: center; white-space: nowrap; line-height: 1.3;">
          ${formatThaiDateTimeBE(p.timestamp || p.created_at || p.pdpa_timestamp)}
        </td>
        <td style="white-space: nowrap; font-weight: 600;">
          ${escapeHtml(p.community || '-')}
        </td>
        <td>
          <div style="font-weight: 600; line-height: 1.4;">${escapeHtml(p.problem || '-')}</div>
          <div style="font-size: 8.5pt; color: #475569; margin-top: 3px; line-height: 1.3;">แนวทางแก้ไข: ${escapeHtml(p.solution || '-')}</div>
        </td>
        <td>
          <div style="line-height: 1.3;">${escapeHtml(p.location || '-')}</div>
          ${p.gps_lat && p.gps_lng ? `<div style="font-size: 8pt; color: #0284c7; margin-top: 2px;">พิกัด GPS: ${p.gps_lat}, ${p.gps_lng}</div>` : ''}
          ${p.photo ? `<div style="font-size: 8pt; color: #7c3aed; margin-top: 2px; font-weight: 600;">[มีรูปถ่ายสภาพปัญหา]</div>` : ''}
        </td>
        <td style="white-space: nowrap;">
          <div style="font-weight: 600;">${escapeHtml(p.prefix || '')}${escapeHtml(p.name || '-')}</div>
          ${p.phone ? `<div style="font-size: 8pt; color: #64748b; margin-top: 2px;">โทร: ${escapeHtml(p.phone)}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <div style="font-weight: 700; color: ${st === 'เสนอเรื่องเข้ามา' ? '#92400e' : (st === 'ไม่สามารถดำเนินการได้' ? '#991b1b' : '#1e293b')};">${st}</div>
          ${st === 'ไม่สามารถดำเนินการได้' && reason ? `
            <div style="font-size: 8pt; color: #9f1239; margin-top: 3px; line-height: 1.25;">(${escapeHtml(reason)})</div>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  let html = `
    <!-- 📄 Page 1: ตารางสรุปข้อเสนอโครงการ (A4 แนวนอน) -->
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
            <th class="screen-checkbox-col" style="width: 36px; text-align: center;">
              <input type="checkbox" ${isAllChecked ? 'checked' : ''} onchange="selectAllItems(this.checked)" title="เลือก/ปลดเลือกทั้งหมด" style="width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer;">
            </th>
            <th style="width: 35px; text-align: center;">ที่</th>
            <th style="width: 110px; text-align: center; white-space: nowrap;">วัน เวลา (พ.ศ.) ที่ส่งเรื่อง</th>
            <th style="width: 175px; text-align: left; white-space: nowrap;">ชุมชน / หมู่บ้าน</th>
            <th>สภาพปัญหาและแนวทางแก้ไขที่ต้องการ</th>
            <th style="width: 145px; text-align: left;">สถานที่ดำเนินการ</th>
            <th style="width: 155px; text-align: left; white-space: nowrap;">ผู้เสนอข้อเสนอ</th>
            <th style="width: 115px; text-align: center; white-space: nowrap;">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 2rem;">ไม่พบข้อมูลข้อเสนอตามเงื่อนไขที่เลือก</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  // 📷 Page 2+: ภาคผนวกภาพถ่ายและรายละเอียด (พิมพ์คนละหน้ากับตาราง)
  if (shouldIncludePhotos) {
    const photoItems = selectedFiltered.filter(p => Boolean(p.photo));
    if (photoItems.length > 0) {
      html += renderPhotoAppendixHtml(photoItems, dateSubtitle);
    }
  }

  container.innerHTML = html;
}

// ─── PHOTO APPENDIX GENERATOR (SEPARATE PAGE) ─────────────────
function renderPhotoAppendixHtml(items, dateSubtitle) {
  let cardsHtml = items.map((p, idx) => {
    const st = normalizeStatus(p.status);
    const reason = p.reject_reason || p.notes || '';

    return `
      <div class="photo-card">
        <div style="font-size: 1.05rem; font-weight: 700; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
          <span>
            <i class="fas fa-camera text-primary"></i> รายการที่ ${idx + 1}: ${escapeHtml(p.community || '')}
          </span>
          <span style="font-size: 0.85rem; font-weight: 600; color: #475569;">
            ${formatThaiDateTimeBE(p.timestamp || p.created_at, false)}
          </span>
        </div>

        <div class="photo-card-grid">
          <!-- Left: High-Res Photo & Action -->
          <div class="photo-card-img-wrap">
            <a href="${p.photo}" target="_blank" title="คลิกดูภาพต้นฉบับขนาดเต็ม">
              <img src="${p.photo}" alt="ภาพถ่ายสภาพปัญหา" class="photo-card-img">
            </a>
            <div class="screen-only" style="margin-top: 8px;">
              <button type="button" class="btn-sub-action" style="width: 100%; font-size: 0.8rem; padding: 6px;" onclick="downloadImage('${p.photo}', 'photo_${p.code || idx+1}.jpg')">
                <i class="fas fa-download"></i> ดาวน์โหลดรูปถ่ายนี้
              </button>
            </div>
          </div>

          <!-- Right: Complete Details Table -->
          <div>
            <table class="photo-card-info-table">
              <tr>
                <td class="label">วัน เวลา (พ.ศ.) ที่ส่งเรื่อง:</td>
                <td><strong>${formatThaiDateTimeBE(p.timestamp || p.created_at, false)}</strong></td>
              </tr>
              <tr>
                <td class="label">ชุมชน / หมู่บ้าน:</td>
                <td><strong>${escapeHtml(p.community || '-')}</strong></td>
              </tr>
              <tr>
                <td class="label">ผู้เสนอข้อเสนอ:</td>
                <td>${escapeHtml(p.prefix || '')}${escapeHtml(p.name || 'ประชาชนในพื้นที่')} ${p.phone ? `(โทร: ${escapeHtml(p.phone)})` : ''}</td>
              </tr>
              <tr>
                <td class="label">สภาพปัญหาและความต้องการ:</td>
                <td style="color: #0f172a; font-weight: 600;">${escapeHtml(p.problem || '-')}</td>
              </tr>
              <tr>
                <td class="label">แนวทางแก้ไขที่ต้องการ:</td>
                <td style="color: #334155;">${escapeHtml(p.solution || '-')}</td>
              </tr>
              <tr>
                <td class="label">สถานที่ดำเนินการ:</td>
                <td>
                  ${escapeHtml(p.location || '-')}
                  ${p.gps_lat && p.gps_lng ? `
                    <div style="margin-top: 4px; color: #0284c7; font-size: 8.5pt;">
                      พิกัด GPS: <code>${p.gps_lat}, ${p.gps_lng}</code>
                      <a href="https://www.google.com/maps?q=${p.gps_lat},${p.gps_lng}" target="_blank" class="screen-only" style="margin-left: 8px; font-weight: 600; text-decoration: underline;">[เปิดแผนที่]</a>
                    </div>
                  ` : ''}
                </td>
              </tr>
              <tr>
                <td class="label">สถานะปัจจุบัน:</td>
                <td>
                  <strong style="color: ${st === 'เสนอเรื่องเข้ามา' ? '#b45309' : (st === 'ไม่สามารถดำเนินการได้' ? '#991b1b' : '#1e293b')};">${st}</strong>
                  ${st === 'ไม่สามารถดำเนินการได้' && reason ? `<div style="font-size: 8.5pt; color: #9f1239; margin-top: 2px;">(เหตุผล: ${escapeHtml(reason)})</div>` : ''}
                </td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="print-page photo-appendix-page">
      <div class="official-header">
        <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
        <div class="official-title">ภาคผนวก: ภาพถ่ายสภาพปัญหาและรายละเอียดประกอบข้อเสนอโครงการ</div>
        <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
        <div class="official-subtitle" style="font-size: 10pt; color: #334155; margin-top: 4px;">${dateSubtitle}</div>
      </div>

      <div style="margin-top: 18px;">
        ${cardsHtml}
      </div>
    </div>
  `;
}

function renderPhotoAppendixOnly(container, filtered) {
  const dateFrom = document.getElementById('printDateFrom')?.value;
  const dateTo = document.getElementById('printDateTo')?.value;
  const dateSubtitle = getDateRangeSubtitle(dateFrom, dateTo);

  const selectedItems = filtered.filter(p => selectedItemIds.has(p.id) && Boolean(p.photo));
  if (selectedItems.length === 0) {
    container.innerHTML = `
      <div class="print-page">
        <div class="official-header">
          <div class="official-title">ภาคผนวก: ภาพถ่ายสภาพปัญหาและรายละเอียดประกอบข้อเสนอโครงการ</div>
        </div>
        <p style="text-align: center; color: var(--slate-500); padding: 40px;">ไม่พบรายการที่มีรูปถ่ายสภาพปัญหาตามเงื่อนไขที่เลือก</p>
      </div>
    `;
    return;
  }

  container.innerHTML = renderPhotoAppendixHtml(selectedItems, dateSubtitle);
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

  container.innerHTML = items.map((p, idx) => {
    const st = normalizeStatus(p.status);
    const reason = p.reject_reason || p.notes || '';

    return `
      <div class="print-page portrait">
        <div class="official-header">
          <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
          <div class="official-title" contenteditable="true" title="คลิกเพื่อแก้ไขหัวข้อเอกสารได้โดยตรง">แบบเสนอโครงการและปัญหาความต้องการของประชาชน</div>
          <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
          <div class="official-subtitle" style="font-size: 9.5pt; color: #334155; margin-top: 4px;">${dateSubtitle}</div>
          <div class="official-meta">วัน เวลา ที่ส่งเรื่อง: <strong>${formatThaiDateTimeBE(p.timestamp || p.created_at, false)}</strong></div>
        </div>

        <div class="form-box">
          <div class="form-box-title">1. ข้อมูลชุมชนและผู้เสนอโครงการ</div>
          <div class="field-row">
            <div class="field-label">ชุมชน / หมู่บ้าน:</div>
            <div class="field-val"><strong>${escapeHtml(p.community || '-')}</strong></div>
          </div>
          <div class="field-row">
            <div class="field-label">ชื่อผู้เสนอ:</div>
            <div class="field-val">${escapeHtml(p.prefix || '')}${escapeHtml(p.name || 'ประชาชนในพื้นที่')} ${p.age ? `(อายุ ${p.age} ปี)` : ''}</div>
          </div>
          <div class="field-row">
            <div class="field-label">หมายเลขโทรศัพท์:</div>
            <div class="field-val">${escapeHtml(p.phone || '-')}</div>
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
            <div class="field-val" style="line-height: 1.6;">${escapeHtml(p.problem || '-')}</div>
          </div>
          <div class="field-row" style="margin-top: 0.5rem;">
            <div class="field-label">แนวทางแก้ไขหรือโครงการที่ต้องการ:</div>
            <div class="field-val" style="line-height: 1.6; font-weight: 600;">${escapeHtml(p.solution || '-')}</div>
          </div>
          <div class="field-row" style="margin-top: 0.5rem;">
            <div class="field-label">สถานที่ดำเนินการ:</div>
            <div class="field-val">
              ${escapeHtml(p.location || '-')}
              ${p.gps_lat && p.gps_lng ? `<br><small style="color: #0284c7;">พิกัด GPS: ${p.gps_lat}, ${p.gps_lng}</small>` : ''}
            </div>
          </div>
          ${p.photo ? `
            <div class="field-row" style="margin-top: 0.5rem;">
              <div class="field-label">รูปถ่ายสภาพปัญหา:</div>
              <div class="field-val">
                <img src="${p.photo}" alt="รูปถ่ายสภาพปัญหา" style="max-height: 180px; max-width: 100%; object-fit: contain; border: 1px solid #ccc; border-radius: 4px;">
              </div>
            </div>
          ` : ''}
        </div>

        <div class="form-box">
          <div class="form-box-title">3. สถานะการพิจารณา</div>
          <div class="field-row">
            <div class="field-label">สถานะปัจจุบัน:</div>
            <div class="field-val"><strong style="color: ${st === 'เสนอเรื่องเข้ามา' ? '#b45309' : '#0f172a'};">${st}</strong></div>
          </div>
          ${st === 'ไม่สามารถดำเนินการได้' && reason ? `
            <div class="field-row" style="margin-top: 6px;">
              <div class="field-label" style="color: #9f1239;">เหตุผล / คำชี้แจง:</div>
              <div class="field-val" style="color: #881337; font-weight: 600; line-height: 1.5;">${escapeHtml(reason)}</div>
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
      <td><strong>${escapeHtml(c)}</strong></td>
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

// ─── PDF EXPORT & IMAGE DOWNLOAD HELPERS ──────────────────────
function exportPDF() {
  const origTitle = document.title;
  const today = new Date();
  const yearBE = today.getFullYear() + 543;
  const dStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${yearBE}`;
  
  // Set clean document title so browser uses it as default PDF filename
  document.title = `แบบสรุปข้อเสนอโครงการ_เทศบาลตำบลแม่สาย_${dStr}`;
  window.print();
  setTimeout(() => {
    document.title = origTitle;
  }, 2500);
}

function downloadImage(url, filename) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'proposal_photo.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
