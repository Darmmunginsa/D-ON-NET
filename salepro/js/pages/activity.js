// ============================================================
// ACTIVITY LOG — ดูประวัติกิจกรรมสำคัญทั้งระบบ (SalePro + PurchasePro)
// อ่านจากแท็บ "ActivityLogs" (Value = JSON ต่อแถว) — Google edition
// ============================================================
let _activityData = [];

async function loadActivityPage() {
  const tableEl = document.getElementById('act-table');
  if (tableEl) tableEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">⏳ กำลังโหลด...</div>';
  try {
    const items = await getListItems('ActivityLogs');
    _activityData = (items || []).map(it => {
      let r = {};
      try { r = JSON.parse(it.Value || '{}') || {}; } catch (e) {}
      return { id: it.id, ts: r.ts || '', app: r.app || '', user: r.user || '', email: r.email || '', type: r.type || '', ref: r.ref || '', detail: r.detail || '' };
    }).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const typeSel = document.getElementById('act-type');
    if (typeSel) {
      const cur = typeSel.value;
      const types = [...new Set(_activityData.map(a => a.type).filter(Boolean))].sort();
      typeSel.innerHTML = '<option value="">ทุกประเภท</option>' + types.map(t => `<option${t===cur?' selected':''}>${_actEsc(t)}</option>`).join('');
    }
    renderActivityLog();
  } catch (e) {
    if (tableEl) tableEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">ยังไม่มีข้อมูล log หรือโหลดไม่สำเร็จ: ' + _actEsc(e.message) + '</div>';
  }
}

function _actEsc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _actFmtTs(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  } catch (e) { return iso; }
}

function _actFiltered() {
  const q = (document.getElementById('act-search')?.value || '').toLowerCase().trim();
  const app = document.getElementById('act-app')?.value || '';
  const type = document.getElementById('act-type')?.value || '';
  const from = document.getElementById('act-from')?.value || '';
  const to = document.getElementById('act-to')?.value || '';
  return _activityData.filter(a => {
    if (app && a.app !== app) return false;
    if (type && a.type !== type) return false;
    const day = String(a.ts).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (q) {
      const hay = (a.user + ' ' + a.email + ' ' + a.ref + ' ' + a.detail + ' ' + a.type).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const _ACT_COLOR = { SalePro: '#1f4e79', PurchasePro: '#c2660c' };
function _actTypeBadge(type) {
  let bg = '#64748b';
  if (/อนุมัติ/.test(type) && !/ไม่อนุมัติ|ปฏิเสธ/.test(type)) bg = '#27ae60';
  else if (/ไม่อนุมัติ|ปฏิเสธ|ยกเลิก|แพ้/.test(type)) bg = '#c0392b';
  else if (/สร้าง/.test(type)) bg = '#2980b9';
  else if (/แก้ไข|ขออนุมัติ/.test(type)) bg = '#d4820a';
  return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap">${_actEsc(type)}</span>`;
}

function renderActivityLog() {
  const el = document.getElementById('act-table');
  if (!el) return;
  const rows = _actFiltered();
  const sum = document.getElementById('act-summary');
  if (sum) sum.textContent = `แสดง ${rows.length.toLocaleString()} / ทั้งหมด ${_activityData.length.toLocaleString()} รายการ`;
  if (!rows.length) { el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">ไม่มีรายการตามเงื่อนไข</div>'; return; }
  el.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:var(--bg2,#f1f5f9);text-align:left">
      <th style="padding:8px 10px;white-space:nowrap">เวลา</th>
      <th style="padding:8px 10px">แอป</th>
      <th style="padding:8px 10px">ผู้ใช้</th>
      <th style="padding:8px 10px">ประเภท</th>
      <th style="padding:8px 10px">อ้างอิง</th>
      <th style="padding:8px 10px">รายละเอียด</th>
    </tr></thead><tbody>` +
    rows.map(a => `<tr style="border-bottom:1px solid var(--border,#e2e8f0)">
      <td style="padding:7px 10px;white-space:nowrap;font-family:var(--mono);font-size:12px">${_actFmtTs(a.ts)}</td>
      <td style="padding:7px 10px"><span style="color:${_ACT_COLOR[a.app]||'#555'};font-weight:600;font-size:12px">${_actEsc(a.app||'-')}</span></td>
      <td style="padding:7px 10px">${_actEsc(a.user||a.email||'-')}</td>
      <td style="padding:7px 10px">${_actTypeBadge(a.type)}</td>
      <td style="padding:7px 10px;font-family:var(--mono);font-size:12px">${_actEsc(a.ref||'-')}</td>
      <td style="padding:7px 10px;color:var(--muted)">${_actEsc(a.detail||'')}</td>
    </tr>`).join('') +
    '</tbody></table></div>';
}

function exportActivityCSV() {
  const rows = _actFiltered();
  if (!rows.length) { if (typeof toast === 'function') toast('ไม่มีข้อมูลให้ export', 'error'); return; }
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['เวลา', 'แอป', 'ผู้ใช้', 'อีเมล', 'ประเภท', 'อ้างอิง', 'รายละเอียด'];
  const lines = [head.map(esc).join(',')];
  rows.forEach(a => lines.push([_actFmtTs(a.ts), a.app, a.user, a.email, a.type, a.ref, a.detail].map(esc).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ActivityLog_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  URL.revokeObjectURL(url);
}
