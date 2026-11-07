// ============================================================
// MERGE QUOTES — รวมใบเสนอราคาหลายใบของลูกค้าเจ้าเดียวกัน
//   เป็นฉบับสมบูรณ์ใบเดียว (เลข QT ใหม่) แล้วลบใบเดิมทิ้ง
//   → ไม่นำมาคำนวณซ้ำที่หน้า "ผลการขาย (Win / Lose)" อีก
// ใช้งานร่วมกับ saveQuote() เดิม: เปิดหน้าสร้างใบใหม่พร้อมรายการที่รวมแล้ว
//   ให้ผู้ใช้ปรับ/คำนวณระยะทางใหม่ได้ก่อนบันทึก → บันทึกเสร็จจึงลบใบต้นทาง
// ============================================================

var mergeMode = false;              // โหมดเลือกใบเพื่อรวม
var mergeSel = [];                  // id ใบที่เลือกไว้
var _mergeSourceIds = null;         // ใบต้นทางที่จะลบหลังบันทึกใบรวม

// ใบที่ "ปิดการขาย/ได้ PO แล้ว" ห้ามนำมารวม (เพราะต้องลบทิ้ง = เสียสถิติชนะ)
function _mergeLocked(q) {
  if (!q) return true;
  if (q.Status === 'Closed' || q.Status === 'PO Received') return true;
  try { if (typeof parseDealStatus === 'function' && parseDealStatus(q.DealStatus).closed) return true; } catch(e) {}
  return false;
}

function toggleMergeMode() {
  mergeMode = !mergeMode;
  if (!mergeMode) mergeSel = [];
  const btn = document.getElementById('merge-mode-btn');
  if (btn) {
    btn.classList.toggle('btn-primary', mergeMode);
    btn.innerHTML = mergeMode
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ยกเลิกเลือก'
      : _mergeBtnLabel();
  }
  renderQuotes();
  _renderMergeBar();
}

function _mergeBtnLabel() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 3v5a4 4 0 004 4h2a4 4 0 014 4v5"/><polyline points="3 7 7 3 11 7"/><polyline points="13 17 17 21 21 17"/></svg> รวมใบ';
}

// checkbox หน้าแถว (เรียกจาก buildQuoteRow)
function mergeCheckboxHtml(q) {
  if (!mergeMode) return '';
  const locked = _mergeLocked(q);
  const on = mergeSel.indexOf(String(q.id)) >= 0;
  if (locked) return '<span title="ใบที่ปิดการขาย/ได้ PO แล้ว รวมไม่ได้" style="color:var(--muted);margin-right:7px;font-size:12px">🔒</span>';
  return '<input type="checkbox" ' + (on ? 'checked' : '') +
    ' onclick="event.stopPropagation()" onchange="toggleMergeSel(\'' + q.id + '\')"' +
    ' style="width:16px;height:16px;margin-right:8px;vertical-align:middle;cursor:pointer;accent-color:var(--accent2)">';
}

function toggleMergeSel(id) {
  id = String(id);
  const i = mergeSel.indexOf(id);
  if (i >= 0) mergeSel.splice(i, 1); else mergeSel.push(id);
  _renderMergeBar();
}

// แถบสรุปด้านบน (จำนวนที่เลือก + ปุ่มรวม)
function _renderMergeBar() {
  const bar = document.getElementById('merge-bar');
  if (!bar) return;
  if (!mergeMode) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  const sel = mergeSel.map(id => quotesData.find(q => String(q.id) === id)).filter(Boolean);
  const clients = Array.from(new Set(sel.map(q => (q.ClientName || '').trim())));
  const sameClient = clients.length <= 1;
  const okCount = sel.length >= 2 && sameClient;
  let warn = '';
  if (sel.length >= 2 && !sameClient) warn = ' · <span style="color:var(--red)">⚠ ต้องเป็นลูกค้าเจ้าเดียวกัน (' + clients.map(escHtml).join(' / ') + ')</span>';
  bar.style.display = 'flex';
  bar.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%">' +
      '<span style="font-size:12px;color:var(--text)">เลือกแล้ว <b style="color:var(--accent2)">' + sel.length + '</b> ใบ' +
        (sel.length ? ' — ' + sel.map(q => escHtml(q.Title || '')).join(', ') : '') + warn + '</span>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-sm ' + (okCount ? 'btn-primary' : '') + '" ' + (okCount ? '' : 'disabled style="opacity:.5;cursor:not-allowed"') +
        ' onclick="startMerge()">รวมเป็นใบใหม่ →</button>' +
    '</div>';
}

// โหลด+แปลงรายการของใบหนึ่ง เป็น quoteItems (เหมือน duplicateQuote)
function _mergeMapItems(sourceId, allItems, baseIdx) {
  const items = allItems.filter(i => String(i.QuoteID) === String(sourceId));
  const rowHs = (typeof getQuoteRowH === 'function' && getQuoteRowH(sourceId)) || [];
  const extra = (typeof getQuoteItemExtra === 'function' && getQuoteItemExtra(sourceId)) || [];
  return items.map((it, idx) => {
    const uid = Date.now() + baseIdx + idx;
    const rh = +rowHs[idx] || 0;
    const ex = extra[idx] || {};
    if ((it.Title || '').startsWith('__GROUP__:')) return { id: uid, type: 'group', title: it.Title.slice(10), align: ex.align || 'left', rowH: rh };
    if (it.Title === '__BLANK__')     return { id: uid, type: 'blank', rowH: rh };
    if (it.Title === '__PAGEBREAK__') return { id: uid, type: 'pagebreak' };
    if (it.Title === '__NOTE__')      return { id: uid, type: 'note', text: it.Description || '' };
    return {
      id: uid, type: 'item',
      no: ex.no || '', pn: ex.pn || '', name: it.Title || '', desc: it.Description || '',
      qty: (ex.qtyRaw !== undefined && ex.qtyRaw !== '') ? ex.qtyRaw : (it.Quantity != null ? it.Quantity : ''), unit: it.Unit || 'ชิ้น',
      price: ex.travel ? ex.travel.basePrice : ((ex.price !== undefined && ex.price !== '') ? ex.price : (it.UnitPrice || 0)),
      disc: it.DiscountPct || 0, rowH: rh, cost: +ex.cost || 0, vendorId: ex.vendorId || '', asHeader: !!ex.asHeader, travel: ex.travel || null
    };
  });
}

async function startMerge() {
  const sel = mergeSel.map(id => quotesData.find(q => String(q.id) === String(id))).filter(Boolean);
  if (sel.length < 2) { toast('เลือกอย่างน้อย 2 ใบ', 'error'); return; }
  const clients = Array.from(new Set(sel.map(q => (q.ClientName || '').trim())));
  if (clients.length > 1) { toast('ต้องเป็นลูกค้าเจ้าเดียวกัน', 'error'); return; }
  if (sel.some(q => _mergeLocked(q))) { toast('มีใบที่ปิดการขาย/ได้ PO แล้ว รวมไม่ได้', 'error'); return; }
  if (sel.some(q => !canEditQuote(q))) { toast('คุณไม่มีสิทธิ์รวมบางใบที่เลือก', 'error'); return; }

  // เรียงตามเลขที่ เพื่อให้ลำดับรายการคงที่ — ใบแรกเป็นต้นแบบข้อมูลลูกค้า/ผู้ขาย
  sel.sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
  const primary = sel[0];
  const newNo = _nextQuoteNo(primary.SaleName || currentUser?.displayName || '');

  if (!confirm(
    'รวม ' + sel.length + ' ใบ ของลูกค้า "' + (primary.ClientName || '-') + '" เป็นใบใหม่:\n' +
    sel.map(q => '  • ' + (q.Title || '')).join('\n') +
    '\n\n→ สร้างเป็นใบใหม่ ' + newNo + ' (ปรับ/คำนวณระยะทางใหม่ได้ก่อนบันทึก)\n' +
    '⚠ หลังบันทึกใบใหม่ "ใบเดิมทั้งหมดจะถูกลบถาวร" และไม่นำไปคิดที่หน้าผลการขายอีก'
  )) return;

  toast('กำลังรวมรายการ...', 'info');
  if (typeof TravelQuote !== 'undefined') TravelQuote.reset();

  let merged = [];
  try {
    const allItems = await getListItems(CONFIG.lists.quoteItems);
    sel.forEach((q, qi) => {
      const rows = _mergeMapItems(q.id, allItems, qi * 100000);
      if (qi > 0) merged.push({ id: Date.now() + 900000 + qi, type: 'blank', rowH: 0 }); // คั่นระหว่างใบ
      merged.push({ id: Date.now() + 800000 + qi, type: 'group', title: 'จาก ' + (q.Title || ''), align: 'left', rowH: 0 });
      merged = merged.concat(rows);
    });
  } catch (e) { toast('โหลดรายการไม่สำเร็จ: ' + e.message, 'error'); return; }

  quoteItems = merged.length ? merged : [];
  if (!quoteItems.length) { addItem(); addItem(); }

  _mergeSourceIds = sel.map(q => q.id);     // ★ จำไว้ลบหลังบันทึก
  mergeMode = false; mergeSel = [];

  editingQuoteId = primary.id;              // กัน showPage ไม่ให้ล้าง quoteItems
  showPage('newquote', null);

  setTimeout(() => {
    editingQuoteId = null;                  // ★ บันทึก = สร้างใบใหม่
    const _set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
    _set('q-no', newNo);
    _set('q-date', new Date().toISOString().split('T')[0]);
    _set('q-client', primary.ClientName);
    _set('q-contact', primary.ContactPerson);
    _set('q-phone', primary.Phone);
    _set('q-email', primary.Email);
    _set('q-cust-address', primary.CustomerAddress);
    _set('q-cust-taxid', primary.CustomerTaxID);
    _set('q-cust-tel', primary.CustomerTel);
    _set('q-cust-fax', (typeof getQuoteFax === 'function' ? getQuoteFax(primary.id) : ''));
    if (typeof getQuoteDocEN === 'function') { const _en = getQuoteDocEN(primary.id); _set('q-client-en', _en.nameEN); _set('q-cust-address-en', _en.addrEN); }
    _set('q-payment', primary.PaymentMethod || 'เงินสด');
    _set('q-validity', (typeof getQuoteValidity === 'function' ? getQuoteValidity(primary.id) : '') || '30 วัน');
    _set('q-tag', primary.Tag || (typeof getQuoteTag === 'function' ? getQuoteTag(primary.id) : '') || '');
    if (typeof fillQuoteSourceOptions === 'function') fillQuoteSourceOptions(typeof getQuoteSource === 'function' ? getQuoteSource(primary.id) : '');
    if (typeof updateAutoDates === 'function') updateAutoDates();
    _set('q-sale-name', primary.SaleName || currentUser?.displayName || '');
    _set('q-sale-tel', primary.SaleTel);
    _set('q-sale-email', primary.SaleEmail || currentUser?.email || '');
    _set('q-note', primary.Note);
    _set('q-terms', primary.Terms);

    const eb = document.getElementById('edit-banner'); if (eb) eb.style.display = 'none';
    document.getElementById('items-body').innerHTML = '';
    renderItems();
    if (typeof updateApproverBox === 'function') updateApproverBox();
    if (typeof initQuoteSignature === 'function') initQuoteSignature();
    toast('รวมเป็น ' + newNo + ' แล้ว — ปรับจำนวน/ระยะทางให้ครบ แล้วกดบันทึก', 'success');
  }, 60);
}

// เรียกจาก saveQuote() หลังบันทึกใบรวมสำเร็จ → ลบใบต้นทางทั้งหมดถาวร
async function finalizeMerge(newId) {
  const ids = (_mergeSourceIds || []).filter(id => String(id) !== String(newId));
  _mergeSourceIds = null;
  if (!ids.length) return;
  let ok = 0;
  for (const id of ids) {
    try {
      await deleteWhere(CONFIG.lists.quoteItems, 'QuoteID', id);
      await deleteListItem(CONFIG.lists.quotations, id);
      const q = quotesData.find(x => String(x.id) === String(id));
      quotesData = quotesData.filter(x => String(x.id) !== String(id));
      if (typeof logActivity === 'function') logActivity('รวมใบเสนอราคา', (q && q.Title) || id, 'ลบใบต้นทางหลังรวมเข้าใบใหม่');
      ok++;
    } catch (e) { console.warn('merge delete', id, e.message); }
  }
  if (typeof renderDash === 'function') renderDash();
  renderQuotes();
  if (typeof renderPayment === 'function') renderPayment();
  if (typeof updateBadge === 'function') updateBadge();
  toast('รวมสำเร็จ — ลบใบเดิม ' + ok + ' ใบแล้ว', 'success');
}
