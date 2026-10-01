// ============================================================
// DASHBOARD
// ============================================================
function renderDash() {
  const pending = quotesData.filter(q => q.Status === 'Pending');
  const approved = quotesData.filter(q => q.Status === 'Approved');
  document.getElementById('d-total').textContent = quotesData.length;
  document.getElementById('d-pending').textContent = pending.length;
  document.getElementById('d-approved').textContent = approved.length;
  const unpaidCount = quotesData.filter(q => q.Status === 'Approved').length;
  document.getElementById('d-unpaid').textContent = unpaidCount;

  document.getElementById('d-recent').innerHTML = quotesData.slice(-5).reverse().map(q =>
    `<tr><td style="font-family:var(--mono);font-size:12px">${q.Title||''}</td><td>${q.ClientName||''}</td><td style="font-family:var(--mono);font-size:12px">${fmt(q.TotalAmount||0)}</td><td>${statusBadge(q.Status)}</td></tr>`
  ).join('') || '<tr><td colspan=4 class="empty">ยังไม่มีข้อมูล</td></tr>';

  document.getElementById('d-approve-list').innerHTML = pending.map(q =>
    `<tr><td style="font-family:var(--mono);font-size:12px">${q.Title||''}</td><td>${q.ClientName||''}</td><td style="font-family:var(--mono);font-size:12px">${fmt(q.TotalAmount||0)}</td>
    <td><button class="btn btn-xs btn-warn" onclick="openApproveModal('${q.id}')">ตรวจสอบ</button></td></tr>`
  ).join('') || '<tr><td colspan=4 class="empty">ไม่มีรายการรออนุมัติ</td></tr>';

  renderSalesReport();
}

// ── Donut SVG helper (สำหรับ dashboard) ──
function donutSVG(slices, size) {
  size = size || 130;
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = size/2 - 12, cx = size/2, cy = size/2, C = 2*Math.PI*r;
  let off = 0, segs = '';
  slices.forEach(d => {
    const len = (d.value/total)*C;
    segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="14" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
  });
  const legend = slices.map(d => `<div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:50%;background:${d.color}"></span><span style="flex:1;color:var(--muted2)">${d.label}</span><b>${d.value}</b></div>`).join('');
  return `<div style="display:flex;align-items:center;gap:14px">
    <svg width="${size}" height="${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="14"/>${segs}
    <text x="${cx}" y="${cy+5}" text-anchor="middle" fill="var(--text)" style="font-size:20px;font-weight:700">${total}</text></svg>
    <div style="display:flex;flex-direction:column;gap:5px">${legend}</div></div>`;
}

let _salesPeriod = (function(){ try { return localStorage.getItem('sales_period') || '6m'; } catch(e) { return '6m'; } })();
function setSalesPeriod(val) {
  _salesPeriod = val || '6m';
  try { localStorage.setItem('sales_period', _salesPeriod); } catch(e) {}
  renderSalesReport();
}
// ช่วงเวลาตาม period → {start, end, label}
function _salesRange(period) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start, label;
  if (period === 'month')      { start = new Date(now.getFullYear(), now.getMonth(), 1); label = 'เดือนนี้'; }
  else if (period === 'quarter'){ const qm = Math.floor(now.getMonth()/3)*3; start = new Date(now.getFullYear(), qm, 1); label = 'ไตรมาสนี้'; }
  else if (period === 'year')   { start = new Date(now.getFullYear(), 0, 1); label = 'ปีนี้'; }
  else if (period === '12m')    { start = new Date(now.getFullYear(), now.getMonth()-11, 1); label = '12 เดือนล่าสุด'; }
  else if (period === 'all')    { start = null; label = 'ทั้งหมด'; }
  else                          { start = new Date(now.getFullYear(), now.getMonth()-5, 1); label = '6 เดือนล่าสุด'; }
  return { start, end, label };
}

function renderSalesReport() {
  const el = document.getElementById('sales-report');
  if (!el) return;
  const sel = document.getElementById('sales-period'); if (sel && sel.value !== _salesPeriod) sel.value = _salesPeriod;
  const { start, end, label } = _salesRange(_salesPeriod);
  const inRange = (q) => {
    const dt = q.QuoteDate && new Date(q.QuoteDate);
    if (!dt || isNaN(dt)) return start === null;           // ไม่มีวันที่ → นับเฉพาะเมื่อเลือก "ทั้งหมด"
    if (start && dt < start) return false;
    return dt <= end;
  };
  const rows = quotesData.filter(inRange);

  const STATUSES = [
    { key:'Draft', color:'#94a3b8' }, { key:'Pending', color:'#fbbf24' },
    { key:'Approved', color:'#34d399' }, { key:'Closed', color:'#38bdf8' }, { key:'Rejected', color:'#f87171' },
  ];
  const byStatus = STATUSES.map(s => ({ label:s.key, color:s.color, value: rows.filter(q=>q.Status===s.key).length })).filter(s=>s.value>0);
  const totalValue = rows.reduce((s,q)=>s+(Number(q.TotalAmount)||0),0);
  const paidValue = rows.reduce((s,q)=>s+(Number(q.PaidAmount)||0),0);

  // กราฟแนวโน้ม: แบ่งเป็นรายเดือนในช่วง (ถ้ายาวเกิน 14 เดือน → รายปี)
  const now = new Date(); const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  let gStart = start;
  if (!gStart) { // ทั้งหมด → หาเดือนเริ่มจากใบที่เก่าสุด
    const dates = quotesData.map(q=>q.QuoteDate&&new Date(q.QuoteDate)).filter(d=>d&&!isNaN(d));
    gStart = dates.length ? new Date(Math.min(...dates)) : new Date(now.getFullYear(), now.getMonth()-5, 1);
  }
  const monthSpan = (now.getFullYear()-gStart.getFullYear())*12 + (now.getMonth()-gStart.getMonth()) + 1;
  let trend = [];
  if (monthSpan > 14) {
    // รายปี
    for (let y = gStart.getFullYear(); y <= now.getFullYear(); y++) {
      const v = rows.filter(q=>{const dt=new Date(q.QuoteDate);return dt.getFullYear()===y;}).reduce((s,q)=>s+(Number(q.TotalAmount)||0),0);
      trend.push({ label: String(y+543).slice(-2), value: v });   // ปี พ.ศ. 2 หลัก
    }
  } else {
    for (let i = monthSpan-1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const v = rows.filter(q=>{const dt=new Date(q.QuoteDate);return dt.getFullYear()===d.getFullYear()&&dt.getMonth()===d.getMonth();}).reduce((s,q)=>s+(Number(q.TotalAmount)||0),0);
      trend.push({ label: months[d.getMonth()], value: v });
    }
  }
  const maxT = Math.max(1,...trend.map(t=>t.value));
  const cols = trend.map(t=>`<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end" title="${t.label}: ${fmt(t.value)}">
    <div style="width:70%;background:var(--accent);border-radius:3px 3px 0 0;height:${(t.value/maxT)*100}px;min-height:${t.value?3:0}px"></div>
    <span style="font-size:9px;color:var(--muted)">${t.label}</span></div>`).join('');

  el.innerHTML = `
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">ตามสถานะ · ${label}</div>${byStatus.length?donutSVG(byStatus):'<div style="font-size:12px;color:var(--muted);padding:20px 0">ไม่มีข้อมูลในช่วงนี้</div>'}</div>
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">แนวโน้มยอดขาย · ${label}</div>
      <div style="display:flex;align-items:flex-end;gap:5px;height:120px">${cols}</div></div>
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">มูลค่า · ${label} <span style="color:var(--accent2)">(${rows.length} ใบ)</span></div>
      <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
        <div><div style="color:var(--muted);font-size:11px">มูลค่ารวม</div><div style="font-size:20px;font-weight:700;font-family:var(--mono)">${fmt(totalValue)}</div></div>
        <div><div style="color:var(--muted);font-size:11px">รับชำระแล้ว</div><div style="font-size:16px;font-weight:600;color:var(--green);font-family:var(--mono)">${fmt(paidValue)}</div></div>
        <div><div style="color:var(--muted);font-size:11px">คงค้าง</div><div style="font-size:16px;font-weight:600;color:var(--amber);font-family:var(--mono)">${fmt(totalValue-paidValue)}</div></div>
      </div></div>`;
}

function updateBadge() {
  const n = quotesData.filter(q => q.Status === 'Pending').length;
  document.getElementById('badge-approve').textContent = n;
}

