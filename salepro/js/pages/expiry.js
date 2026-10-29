// ============================================================
// EXPIRY DASHBOARD — แจ้งเตือนวันหมดอายุ/ต่ออายุ รวมทุกดีล
// อ่าน stDealData.expiries ของทุกใบเสนอราคา (จาก DealStatus) มารวมแสดง + กรอง + กดเปิดดีล
// ใช้ helper expiryStatus() / EXPIRY_TYPES จาก saletracker.js
// ============================================================

// รวมทุก expiry จากทุกดีล → [{...e, quoteId, quoteTitle, client, saleName}]
function _allExpiries() {
  const out = [];
  (quotesData || []).forEach(function(q) {
    let ds; try { ds = parseDealStatus(q.DealStatus); } catch(e) { return; }
    const exps = (ds && Array.isArray(ds.expiries)) ? ds.expiries : [];
    exps.forEach(function(e) {
      if (!e) return;
      out.push(Object.assign({}, e, { quoteId: q.id, quoteTitle: q.Title || '', client: q.ClientName || '', saleName: q.SaleName || '' }));
    });
  });
  return out;
}

// เปิดหน้าติดตามของดีล แล้วกระโดดไปแท็บ "หมดอายุ/ต่ออายุ" (เปิดได้ทุกสถานะ ไม่เกี่ยวกับหมดอายุหรือไม่)
function openExpiryDeal(id) {
  const q = (quotesData || []).find(x => String(x.id) === String(id));
  if (!q) { toast('ไม่พบดีลนี้ (อาจถูกลบ)', 'error'); return; }
  openSaleTrackerModal(q.id);   // ส่ง id ชนิดเดิมเพื่อให้ตรงกับ quotesData
  setTimeout(function(){ try { switchSTTab('expiry', document.getElementById('st-tab-btn-expiry')); } catch(e) {} }, 350);
}

async function loadExpiryPage() {
  // เติมตัวกรองประเภท
  const sel = document.getElementById('expiry-filter-type');
  if (sel && sel.options.length <= 1 && typeof EXPIRY_TYPES !== 'undefined') {
    sel.innerHTML = '<option value="">ทุกประเภท</option>' + EXPIRY_TYPES.map(t => '<option>' + t + '</option>').join('');
  }
  renderExpiryDashboard();
}

function renderExpiryDashboard() {
  const host = document.getElementById('expiry-dashboard'); if (!host) return;
  const q = (document.getElementById('expiry-search')?.value || '').trim().toLowerCase();
  const fType = document.getElementById('expiry-filter-type')?.value || '';
  const fStatus = document.getElementById('expiry-filter-status')?.value || '';
  let list = _allExpiries();

  // กรอง
  list = list.filter(function(e) {
    if (fType && (e.type||'') !== fType) return false;
    if (q) {
      const hay = ((e.name||'') + ' ' + (e.client||'') + ' ' + (e.serial||'') + ' ' + (e.quoteTitle||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const st = expiryStatus(e.expiryDate, e.renewed);
    if (fStatus === 'renewed' && !e.renewed) return false;
    if (fStatus && fStatus !== 'renewed') {
      if (e.renewed) return false;
      if (fStatus === 'overdue' && !(st.days != null && st.days < 0)) return false;
      if (fStatus === '30' && !(st.days != null && st.days >= 0 && st.days <= 30)) return false;
      if (fStatus === '90' && !(st.days != null && st.days >= 0 && st.days <= 90)) return false;
      if (fStatus === 'active' && !(st.days != null && st.days >= 0)) return false;
    }
    return true;
  });

  // สรุป (นับจากทั้งหมด ไม่อิงตัวกรอง)
  const all = _allExpiries();
  const cnt = { overdue:0, d30:0, d90:0, renewed:0, total: all.length };
  all.forEach(function(e) {
    if (e.renewed) { cnt.renewed++; return; }
    const st = expiryStatus(e.expiryDate, false);
    if (st.days == null) return;
    if (st.days < 0) cnt.overdue++;
    else if (st.days <= 30) cnt.d30++;
    else if (st.days <= 90) cnt.d90++;
  });
  const chip = (label, n, color) => '<div style="flex:1;min-width:110px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);padding:10px 12px"><div style="font-size:11px;color:var(--muted)">' + label + '</div><div style="font-size:20px;font-weight:700;color:' + color + '">' + n + '</div></div>';
  const sum = document.getElementById('expiry-summary');
  if (sum) sum.innerHTML = '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    + chip('หมดอายุแล้ว', cnt.overdue, 'var(--red)')
    + chip('ใกล้หมด ≤30 วัน', cnt.d30, 'var(--amber)')
    + chip('ใกล้หมด ≤90 วัน', cnt.d90, '#fbbf24')
    + chip('ต่ออายุแล้ว', cnt.renewed, 'var(--green)')
    + chip('ทั้งหมด', cnt.total, 'var(--accent2)')
    + '</div>';

  if (!list.length) { host.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:28px">ไม่พบรายการ</div>'; return; }

  // เรียง: ต่ออายุแล้วไว้ท้าย, ที่เหลือเรียงวันใกล้หมดก่อน
  list.sort(function(a, b) {
    if (!!a.renewed !== !!b.renewed) return a.renewed ? 1 : -1;
    const da = a.expiryDate || '9999-12-31', db = b.expiryDate || '9999-12-31';
    return da.localeCompare(db);
  });

  host.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border)">'
    + '<th style="padding:7px 8px">ประเภท</th><th style="padding:7px 8px">สินค้า/รุ่น</th><th style="padding:7px 8px">Serial</th><th style="padding:7px 8px">ลูกค้า</th><th style="padding:7px 8px">วันหมดอายุ</th><th style="padding:7px 8px">สถานะ</th><th style="padding:7px 8px"></th></tr></thead><tbody>'
    + list.map(function(e) {
        const st = expiryStatus(e.expiryDate, e.renewed);
        return '<tr style="border-bottom:1px solid var(--border)">'
          + '<td style="padding:7px 8px"><span class="badge" style="font-size:10px;background:rgba(79,142,247,0.12);color:var(--accent2)">' + escHtml(e.type||'-') + '</span></td>'
          + '<td style="padding:7px 8px;color:var(--text)">' + escHtml(e.name||'-') + (e.qty?(' <span style="color:var(--muted)">x'+escHtml(String(e.qty))+'</span>'):'') + '</td>'
          + '<td style="padding:7px 8px;color:var(--muted);font-family:var(--mono)">' + escHtml(e.serial||'-') + '</td>'
          + '<td style="padding:7px 8px;color:var(--muted)">' + escHtml(e.client||'-') + '</td>'
          + '<td style="padding:7px 8px;font-family:var(--mono)">' + (e.expiryDate ? fmtDate(e.expiryDate) : '-') + '</td>'
          + '<td style="padding:7px 8px"><span style="color:' + st.color + ';font-weight:600">● ' + st.label + '</span></td>'
          + '<td style="padding:7px 8px;text-align:right;white-space:nowrap"><button class="btn btn-sm" onclick="openExpiryDeal(\'' + e.quoteId + '\')" style="font-size:11px">เปิดดีล</button></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>';
}
