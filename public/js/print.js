/**
 * ============================================================
 * MAESAI SALA CONNECT — Official Print Viewport JS
 * Comprehensive Filters: Year (พ.ศ.), Date Range, Community, Status
 * Strict Invariants: NO budget column, NO signature lines, NO hardcoded year
 * ============================================================
 */

let allProposals = [];
let appSettings = null;

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

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      appSettings = data.settings;

      const commSelect = document.getElementById('printCommunityFilter');
      if (commSelect && appSettings.communities) {
        commSelect.innerHTML = '<option value="all">ทุกชุมชน (9 ชุมชน)</option>' +
          appSettings.communities.map(c => `<option value="${c}">${c}</option>`).join('');
      }

      const statusSelect = document.getElementById('printStatusFilter');
      if (statusSelect && appSettings.statuses) {
        statusSelect.innerHTML = '<option value="all">ทุกสถานะ</option>' +
          appSettings.statuses.map(s => `<option value="${s}">${s}</option>`).join('');
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

  // Status filter
  if (statusFilter !== 'all') {
    filtered = filtered.filter(p => p.status === statusFilter);
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
  const rowsHtml = items.map((p, idx) => `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td style="text-align: center;"><strong>${p.code || '-'}</strong></td>
      <td>${p.community || '-'}</td>
      <td>
        <div style="font-weight: 600;">${p.problem || '-'}</div>
        <div style="font-size: 8.5pt; color: #475569; margin-top: 3px;">แนวทางแก้ไข: ${p.solution || '-'}</div>
      </td>
      <td>${p.location || '-'}</td>
      <td>${p.prefix || ''}${p.name || '-'}${p.phone ? `<br><small style="color: #64748b;">โทร: ${p.phone}</small>` : ''}</td>
      <td style="text-align: center;">${p.status || '-'}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="print-page">
      <div class="official-header">
        <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
        <div class="official-title">แบบสรุปข้อเสนอโครงการและปัญหาความต้องการของประชาชน</div>
        <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
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
            <th style="width: 110px;">สถานะ</th>
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

  container.innerHTML = items.map(p => `
    <div class="print-page portrait">
      <div class="official-header">
        <img src="logo/ตราเทศบาลแม่สาย_พระเจ้าพรหมมหาราช_หนามากๆ.png" alt="ตราเทศบาล" class="official-seal" onerror="this.src='logo/logoicon.png'">
        <div class="official-title">แบบเสนอโครงการและปัญหาความต้องการของประชาชน</div>
        <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
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
          <div class="field-val">${p.location || '-'}</div>
        </div>
      </div>

      <div class="form-box">
        <div class="form-box-title">3. สถานะการพิจารณา</div>
        <div class="field-row">
          <div class="field-label">สถานะปัจจุบัน:</div>
          <div class="field-val"><strong>${p.status || 'รอดำเนินการ'}</strong></div>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── TEMPLATE 3: COMMUNITY BREAKDOWN SUMMARY ─────────────────
function renderCommunitySummary(container, items) {
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
        <div class="official-title">รายงานสรุปจำนวนข้อเสนอโครงการแยกรายชุมชน</div>
        <div class="official-subtitle">เทศบาลตำบลแม่สาย อำเภอแม่สาย จังหวัดเชียงราย</div>
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
