// ============================================================
// QUOTES LIST
// ============================================================
function renderTrackerBtn(q) {
  const id = q.id;
  const histBtn = '<button class="btn btn-xs" style="background:rgba(123,130,153,0.12);border-color:rgba(123,130,153,0.25);color:var(--muted)" onclick="openSaleTrackerModal(' + "'" + id + "'" + ')"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> ประวัติ</button>';
  if (q.Status === 'Cancelled') return histBtn;
  if (q.Status === 'Closed') return histBtn;
  if (q.Status !== 'Approved' && q.Status !== 'Pending' && q.Status !== 'Draft' && q.Status !== 'PO Received') return '—';
  const ds = parseDealStatus(q.DealStatus);
  if (ds.closed) {
    return '<button class="btn btn-xs" style="background:rgba(52,211,153,0.12);border-color:rgba(52,211,153,0.3);color:var(--green)" onclick="openSaleTrackerModal(' + "'" + id + "'" + ')"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ปิดแล้ว</button>';
  }
  return '<button class="btn btn-xs btn-warn" onclick="openSaleTrackerModal(' + "'" + id + "'" + ')"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ติดตาม</button>';
}
function canEditQuote(q) {
  if (!currentUser) return false;
  // Admin can edit all quotes
  if (userRoles.isAdmin) return true;
  // Owner can edit their own quotes
  const myEmail = (currentUser.email||'').toLowerCase();
  const saleEmail = (q.SaleEmail||'').toLowerCase();
  return saleEmail === myEmail;
}

function renderQuotes() {
  renderBasketBar();
  const sf = document.getElementById('f-status')?.value || '';
  const sq = (document.getElementById('f-search')?.value || '').toLowerCase();

  // แยก parent (ไม่มี -RV) และ revisions (-RV)
  const allFiltered = quotesData.filter(q => {
    const matchStatus = !sf || q.Status === sf;
    const matchSearch = !sq || (q.Title||'').toLowerCase().includes(sq) || (q.ClientName||'').toLowerCase().includes(sq) || (q.Tag||'').toLowerCase().includes(sq);
    return matchStatus && matchSearch && passBasketFilter(q);
  });

  // ถ้ามีการ filter → แสดงตรงๆ ไม่จัด group
  // ถ้าไม่มี filter → จัด parent/child
  const useGrouping = !sf && !sq && !_activeBasket;

  let rows = '';

  if (useGrouping) {
    // จัด group: parent คือใบที่ไม่มี -RV หรือเป็น root
    const parents = quotesData.filter(q => !/-RV\d+$/.test(q.Title||''));
    const revisions = quotesData.filter(q => /-RV\d+$/.test(q.Title||''));

    parents.forEach(q => {
      rows += buildQuoteRow(q, false);
      // หา revisions ของ parent นี้
      const base = (q.Title||'').replace(/-RV\d+$/, '');
      const children = revisions
        .filter(r => (r.Title||'').replace(/-RV\d+$/, '') === base)
        .sort((a,b) => (a.Title||'').localeCompare(b.Title||''));
      children.forEach(r => { rows += buildQuoteRow(r, true); });
    });
    // orphan revisions ที่ parent ถูกกรองออก
    revisions.filter(r => {
      const base = (r.Title||'').replace(/-RV\d+$/, '');
      return !parents.find(p => p.Title === base);
    }).forEach(r => { rows += buildQuoteRow(r, false); });
  } else {
    allFiltered.forEach(q => { rows += buildQuoteRow(q, false); });
  }

  document.getElementById('quotes-body').innerHTML = rows ||
    '<tr><td colspan=10 style="text-align:center;padding:32px;color:var(--muted)">ยังไม่มีข้อมูล</td></tr>';
}

function buildQuoteRow(q, isChild) {
  const indent = isChild ? 'padding-left:24px' : '';
  const prefix = isChild ? '<span style="color:var(--muted);margin-right:6px;font-size:11px">↳</span>' : '';
  const childBg = isChild ? 'background:rgba(255,255,255,0.015);' : '';

  return `
    <tr style="${childBg}">
      <td style="font-family:var(--mono);font-size:12px;font-weight:500;${indent}">${prefix}${q.Title||''}${basketDots(q.id)}</td>
      <td style="font-size:13px${isChild?';color:var(--muted)':''}">${isChild ? '' : (q.ClientName||'')}</td>
      <td style="font-size:12px">${q.Tag ? `<span style="display:inline-block;color:var(--accent2);background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.2);border-radius:5px;padding:2px 8px;white-space:nowrap"># ${escHtml(q.Tag)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${fmtDate(q.QuoteDate)}</td>
      <td style="font-family:var(--mono);font-size:12px">${fmt(q.TotalAmount||0)}</td>
      <td style="${isChild?'color:var(--muted)':''}">${isChild ? '' : (q.PaymentMethod||'')}</td>
      <td>${statusBadge(q.Status)}</td>
      <td>${payBadge(q)}</td>
      <td style="white-space:nowrap;vertical-align:middle">
        <button class="action-btn" onclick="openApproveModal('${q.id}')" title="ดูรายละเอียด">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        ${q.Status !== 'Approved' && q.Status !== 'Cancelled' && q.Status !== 'Closed' && q.Status !== 'PO Received' && canEditQuote(q) ? `<button class="action-btn" style="color:var(--accent2)" onclick="editQuote('${q.id}')" title="แก้ไข">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ''}
        <button class="action-btn" onclick="showPDFForQuote('${q.id}')" title="PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <button class="action-btn" onclick="openBasketAssign('${q.id}')" title="จัดเข้าตะกร้า">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18l-1.5 12.5a2 2 0 01-2 1.5h-11a2 2 0 01-2-1.5z"/><path d="M3 7l3-4h12l3 4"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/></svg>
        </button>
        ${(q.Status === 'Closed' || q.Status === 'PO Received' || parseDealStatus(q.DealStatus).closed) ? `<button class="action-btn" style="color:var(--green)" onclick="duplicateQuote('${q.id}')" title="สร้างใหม่จากใบนี้ (ลูกค้าซื้อซ้ำ) — เลข QT ใหม่">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>` : ''}
        ${q.Status === 'Cancelled' && canEditQuote(q) && !familyHasClosed(q) ? `<button class="action-btn" style="color:var(--purple)" onclick="reviseQuote('${q.id}')" title="Revise — สร้างใบแก้ไขใหม่">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ''}
        ${q.Status !== 'Cancelled' && q.Status !== 'Closed' && !parseDealStatus(q.DealStatus).closed && canEditQuote(q) ? `<button class="action-btn" style="color:var(--red)" onclick="cancelQuote('${q.id}')" title="${q.Status === 'Draft' ? 'ลบ' : 'ยกเลิก'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </button>` : ''}
      </td>
      <td>${renderTrackerBtn(q)}</td>
    </tr>`;
}


// ============================================================
// NEW QUOTE
// ============================================================
// ค่าเริ่มต้น หมายเหตุ/เงื่อนไข ต่อ user — เก็บใน Settings list (ถาวร ข้ามเครื่อง)
function getQuoteDefaults() {
  try {
    const em = currentUser?.email || '';
    const it = (typeof _settingsCache !== 'undefined' ? _settingsCache : []).find(i => i.Title === 'QuoteDefaults_' + em);
    if (it && it.Value) { const o = JSON.parse(it.Value) || {}; return { note: o.note || '', terms: o.terms || '' }; }
  } catch(e) {}
  return { note: '', terms: '' };
}
async function saveQuoteDefaults(note, terms) {
  const em = currentUser?.email || ''; if (!em) return;
  try { await saveSettingItem('QuoteDefaults_' + em, JSON.stringify({ note: note || '', terms: terms || '' })); }
  catch(e) { console.warn('save quote defaults', e.message); }
}
function initNewQuote() {
  document.getElementById('q-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('q-client').value = '';
  document.getElementById('q-contact').value = '';
  document.getElementById('q-phone').value = '';
  document.getElementById('q-email').value = '';
  document.getElementById('q-cust-address').value = '';
  document.getElementById('q-cust-taxid').value = '';
  document.getElementById('q-cust-tel').value = '';
  { const _a=document.getElementById('q-client-en'); if(_a)_a.value=''; const _b=document.getElementById('q-cust-address-en'); if(_b)_b.value=''; }
  const _faxEl = document.getElementById('q-cust-fax'); if (_faxEl) _faxEl.value = '';
  const _tagEl = document.getElementById('q-tag'); if (_tagEl) _tagEl.value = '';
  fillQuoteSourceOptions('');
  document.getElementById('q-validity').value = '30 วัน';
  updateAutoDates();   // Date = วันที่ใบ, Expire = วันที่ใบ + อายุใบเสนอราคา (อัตโนมัติ)
  // โหลดข้อมูล Sale จาก localStorage (จำไว้จากครั้งที่แล้ว)
  const _savedSale = (() => { try { return JSON.parse(localStorage.getItem('sale_info_' + (currentUser?.email||'')) || 'null'); } catch(e) { return null; } })();
  // ลำดับความสำคัญ: SharePoint profile → localStorage → currentUser
  document.getElementById('q-sale-name').value  = _saleProfile.name || _savedSale?.name  || currentUser?.displayName || '';
  document.getElementById('q-sale-email').value = _savedSale?.email || currentUser?.email || '';
  document.getElementById('q-sale-tel').value   = _saleProfile.tel  || _savedSale?.tel   || '';
  // เลขที่ใบ: <ตัวย่อชื่อ-สกุล Sale><NN>-<MM>-<YYYY> เช่น CC01-07-2026 (สร้างหลังได้ชื่อ Sale)
  document.getElementById('q-no').value = _nextQuoteNo(document.getElementById('q-sale-name').value);
  // ค่าเริ่มต้น หมายเหตุ/เงื่อนไข — เก็บถาวรใน SharePoint (Settings) ข้ามเครื่องได้ + fallback localStorage
  const _defs = getQuoteDefaults();
  const _noteDef  = _defs.note  || localStorage.getItem('note_default_'  + (currentUser?.email||'')) || '';
  const _termsDef = _defs.terms || localStorage.getItem('terms_default_' + (currentUser?.email||'')) || '';
  document.getElementById('q-note').value = _noteDef;
  document.getElementById('q-terms').value = _termsDef || companySettings?.FooterText || 'ชำระภายใน 30 วันนับจากวันรับสินค้า';
  quoteItems = [];
  addItem(); addItem();
  // ใบใหม่ — รีเซ็ตส่วนลดรวม + ขนาดฟอนต์ + คอลัมน์ + ระยะห่าง เป็นค่าเริ่มต้น
  const _gd = document.getElementById('g-disc'); if (_gd) _gd.value = 0;
  const _gdm = document.getElementById('g-disc-mode'); if (_gdm) _gdm.value = 'pct';
  applyZoneFonts(null);
  setColVisible(null);
  setRowSpacingState(null);
  // Load user's signature
  setTimeout(async () => await initQuoteSignature(), 100);
}

// ราคาทุนของรายการ — ถ้าไม่มีในใบ ดึงล่าสุดจาก Catalog (จับคู่ Part No. → ชื่อ) แล้วเซ็ตกลับให้ใช้คำนวณ/เตือนต่ำกว่าทุน
function catalogCostFor(it) {
  if (!it || typeof catalogData === 'undefined' || !catalogData) return 0;
  const ce = (typeof catExtra === 'function') ? catExtra : (() => ({}));
  let c = null;
  const pn = (it.pn || '').trim();
  if (pn) c = catalogData.find(p => ((ce(p.id).pn || p.SKU || '').trim()) === pn);
  if (!c && it.name) c = catalogData.find(p => (p.Title || '').trim() === (it.name || '').trim());
  return c ? (+ce(c.id).cost || 0) : 0;
}
// ราคาต้นทุนที่ฝ่ายจัดซื้อได้มา (PurchasePro เขียน PurchaseItemCost_<quoteId>) — จับคู่ด้วยชื่อรายการ
function getProcurementCosts(quoteId) {
  try { const it = (_settingsCache || []).find(i => i.Title === 'PurchaseItemCost_' + quoteId); return (it && it.Value) ? (JSON.parse(it.Value) || {}) : {}; }
  catch(e) { return {}; }
}
function procurementCostFor(it, quoteId) {
  if (!quoteId || !it) return 0;
  const m = getProcurementCosts(quoteId);
  const rec = m[(it.name || it.Title || '').trim().toLowerCase()];
  return rec ? (+rec.cost || 0) : 0;
}
function itemCost(it) {
  // ต้นทุนจากงานจัดซื้อมาก่อน (ถ้ามี) — ราคาจริงที่ขอได้
  const pc = (typeof editingQuoteId !== 'undefined' && editingQuoteId) ? procurementCostFor(it, editingQuoteId) : 0;
  if (pc > 0) { it.cost = pc; return pc; }
  let c = +it.cost || 0;
  if (c <= 0) { const cc = catalogCostFor(it); if (cc > 0) { it.cost = cc; c = cc; } }
  return c;
}
// ราคาขายมาตรฐานจาก Catalog (สำหรับแสดงเป็นตัวเลขแนะนำในหน้าสร้างใบเสนอราคา)
function catalogPriceFor(it) {
  if (!it || typeof catalogData === 'undefined' || !catalogData) return 0;
  const ce = (typeof catExtra === 'function') ? catExtra : (() => ({}));
  let c = null;
  const pn = (it.pn || '').trim();
  if (pn) c = catalogData.find(p => ((ce(p.id).pn || p.SKU || '').trim()) === pn);
  if (!c && it.name) c = catalogData.find(p => (p.Title || '').trim() === (it.name || '').trim());
  return c ? (+c.Price || 0) : 0;
}

// Date = วันที่ใบเสนอราคา, Expire = วันที่ใบ + อายุใบเสนอราคา (อัตโนมัติ)
function updateAutoDates() {
  const dateEl = document.getElementById('q-date');
  const valEl  = document.getElementById('q-validity');
  const startEl = document.getElementById('q-start');
  const endEl   = document.getElementById('q-end');
  if (!dateEl || !startEl || !endEl) return;
  const base = dateEl.value;
  startEl.value = base || '';
  if (base) {
    const days = parseInt((valEl && valEl.value) || '30', 10) || 30;
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const pad = n => String(n).padStart(2, '0');
    endEl.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());   // local time (เลี่ยง toISOString เลื่อนวันจาก timezone)
  } else {
    endEl.value = '';
  }
}

function addItem(p = null) {
  quoteItems.push({ id: Date.now(), type:'item', no:'', pn: p ? (p.PartNumber||p.SKU||'') : '', name: p ? p.Title : '', desc: p ? (p.Description||'') : '', qty: 1, unit: p ? (p.Unit||'ชิ้น') : 'ชิ้น', price: p ? (p.Price||0) : 0, disc: 0, cost: p ? (+p.Cost||0) : 0, vendorId: p ? (p.VendorId||'') : '' });
  renderItems();
}

// ── ราคา/ยอด: รองรับทั้งตัวเลข และข้อความ เช่น "Included" (ราคาเหมา) ──
function isNumeric(v) { return v !== '' && v !== null && v !== undefined && !isNaN(parseFloat(v)) && isFinite(v); }
// ตัวเลือกหน่วย (dropdown) — รวม Year/Month + หน่วยที่ใช้บ่อย และคงค่าเดิมที่พิมพ์เองไว้
function unitOptionsHTML(cur) {
  cur = (cur || '').trim();
  const base = ['', 'Year', 'Month', 'ปี', 'เดือน', 'ชิ้น', 'ชุด', 'งาน', 'ระบบ', 'ชั่วโมง'];
  if (cur && base.indexOf(cur) === -1) base.push(cur);
  return base.map(function(o){
    const lbl = o === '' ? '— หน่วย —' : o;
    return '<option value="'+escHtml(o)+'"'+(o===cur?' selected':'')+'>'+escHtml(lbl)+'</option>';
  }).join('');
}
function priceNum(it) { return isNumeric(it.price) ? parseFloat(it.price) : 0; }
// ข้อความที่แสดงในช่อง "ราคา/หน่วย"
function priceCell(it) { return isNumeric(it.price) ? fmt(priceNum(it)) : (it.price || ''); }
// ข้อความที่แสดงในช่อง "จำนวนเงิน" — ถ้าราคาเป็นข้อความ ให้แสดงข้อความเดียวกัน (เหมารวม)
function totalCell(it) { return isNumeric(it.price) ? fmt(lineTotal(it)) : (it.price || ''); }

function addGroupRow() {
  quoteItems.push({ id: Date.now(), type:'group', title:'หัวข้อกลุ่ม' });
  renderItems();
  // focus the new group input
  setTimeout(() => {
    const inputs = document.querySelectorAll('#items-body tr.group-row input');
    if (inputs.length) inputs[inputs.length-1].select();
  }, 50);
}

function addBlankRow() {
  quoteItems.push({ id: Date.now(), type:'blank' });
  renderItems();
}

function addPageBreak() {
  quoteItems.push({ id: Date.now(), type:'pagebreak' });
  renderItems();
}

function addNoteRow() {
  quoteItems.push({ id: Date.now(), type:'note', text:'' });
  renderItems();
  setTimeout(() => {
    const tas = document.querySelectorAll('#items-body tr.note-row textarea');
    if (tas.length) tas[tas.length-1].focus();
  }, 50);
}
function updateNoteText(id, val) {
  const it = quoteItems.find(i => i.id == id);
  if (it) it.text = val;
}

function removeItem(id) { quoteItems = quoteItems.filter(i => i.id != id); renderItems(); }

function updateItem(id, field, val) {
  const it = quoteItems.find(i => i.id == id);
  if (!it) return;
  it[field] = (field === 'name' || field === 'unit') ? val : +val;
  if (field !== 'name' && field !== 'unit') {
    const row = document.querySelector(`#items-body tr[data-id="${id}"]`);
    if (row) row.querySelector('.line-total').textContent = fmt(lineTotal(it));
    calcTotals();
    updateApproverBox();
  }
}

function lineTotal(it) {
  if (it.type === 'group' || it.type === 'blank' || it.type === 'pagebreak' || it.type === 'note') return 0;
  if (it.asHeader) return 0;   // รายการที่ตั้งเป็นหัวข้อกลุ่ม → ไม่คิดเงิน
  if (!isNumeric(it.price)) return 0;   // ราคาเป็นข้อความ (Included) → ไม่นับเป็นเงิน
  return it.qty * priceNum(it) * (1 - it.disc / 100);
}

function renderItems() {
  const existingIds = [...document.querySelectorAll('#items-body tr[data-id]')].map(r => +r.dataset.id);
  const newIds = quoteItems.map(i => i.id);
  const needFullRender = existingIds.join(',') !== newIds.join(',');

  if (needFullRender) {
    let itemNum = 0;
    document.getElementById('items-body').innerHTML = quoteItems.map((it) => {
      const hStyle = it.rowH ? `height:${it.rowH}px;` : '';
      const actionCell = `<td style="width:54px"><div class="row-actions">
            <button class="action-btn" onclick="removeItem(${it.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
            <input type="number" class="row-h-input" min="0" value="${it.rowH||''}" placeholder="สูง" title="ความสูงแถว (px) — เว้นว่าง = อัตโนมัติ" onchange="setRowHeight(${it.id},this.value)">
          </div></td>`;
      if (it.type === 'group') {
        return `<tr data-id="${it.id}" class="group-row" draggable="true" style="${hStyle}"
          ondragstart="itemDragStart(event,${it.id})"
          ondragover="itemDragOver(event)"
          ondrop="itemDrop(event,${it.id})"
          ondragend="itemDragEnd(event)">
          <td class="drag-handle" style="text-align:center;cursor:grab;padding:5px 2px;width:24px;color:var(--muted)">
            <svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16" style="display:block;margin:auto;opacity:0.35"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
          </td>
          <td style="width:66px"></td>
          <td class="col-pn" style="width:84px"></td>
          <td style="padding:0">
            <input value="${escHtml(it.title||'')}" onchange="updateGroupTitle(${it.id},this.value)" placeholder="ชื่อหัวข้อกลุ่ม..." style="width:100%;font-weight:600;color:var(--accent2);letter-spacing:0.02em;text-align:center">
          </td>
          <td class="col-qty" style="width:70px"></td>
          <td class="col-unit" style="width:70px"></td>
          <td class="col-price" style="width:110px"></td>
          <td class="col-disc" style="width:70px"></td>
          <td class="col-total"></td>
          ${actionCell}
        </tr>`;
      }
      if (it.type === 'blank') {
        const delCell = `<td style="width:54px;vertical-align:top;padding-top:4px"><button class="action-btn" onclick="removeItem(${it.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></td>`;
        return `<tr data-id="${it.id}" class="blank-row" draggable="true"
          ondragstart="itemDragStart(event,${it.id})"
          ondragover="itemDragOver(event)"
          ondrop="itemDrop(event,${it.id})"
          ondragend="itemDragEnd(event)">
          <td class="drag-handle" style="text-align:center;cursor:grab;padding:5px 2px;width:24px;color:var(--muted)" title="ลากเพื่อเรียง">
            <svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16" style="display:block;margin:auto;opacity:0.35"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
          </td>
          <td colspan="8" style="padding:2px 4px">
            <div class="blank-resize" style="resize:vertical;overflow:hidden;min-height:22px;height:${(it.rowH||22)}px;border:1px dashed var(--border2);border-radius:5px;background:repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(255,255,255,0.025) 5px,rgba(255,255,255,0.025) 10px);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:10px;font-style:italic;opacity:0.6" onmouseup="syncBlankH(${it.id},this)" title="ลากมุมขวาล่างเพื่อปรับความสูง">บรรทัดว่าง · ลากมุมล่างขวาเพื่อปรับความสูง</div>
          </td>
          ${delCell}
        </tr>`;
      }
      if (it.type === 'pagebreak') {
        return `<tr data-id="${it.id}" class="pagebreak-row" draggable="true"
          ondragstart="itemDragStart(event,${it.id})"
          ondragover="itemDragOver(event)"
          ondrop="itemDrop(event,${it.id})"
          ondragend="itemDragEnd(event)">
          <td class="drag-handle" style="text-align:center;cursor:grab;padding:5px 2px;width:24px;color:var(--muted)" title="ลากเพื่อเรียง">
            <svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16" style="display:block;margin:auto;opacity:0.35"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
          </td>
          <td colspan="8" style="text-align:center;color:var(--accent2);font-size:11px;font-weight:600;letter-spacing:0.05em;background:repeating-linear-gradient(90deg,transparent,transparent 6px,rgba(79,142,247,0.12) 6px,rgba(79,142,247,0.12) 12px)">✂ — ตัวแบ่งหน้า / ขึ้นหน้าใหม่ใน PDF — ✂</td>
          ${actionCell}
        </tr>`;
      }
      if (it.type === 'note') {
        return `<tr data-id="${it.id}" class="note-row" draggable="true" style="${hStyle}"
          ondragstart="itemDragStart(event,${it.id})"
          ondragover="itemDragOver(event)"
          ondrop="itemDrop(event,${it.id})"
          ondragend="itemDragEnd(event)">
          <td class="drag-handle" style="text-align:center;cursor:grab;padding:5px 2px;width:24px;color:var(--muted)" title="ลากเพื่อเรียง">
            <svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16" style="display:block;margin:auto;opacity:0.35"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
          </td>
          <td colspan="8" style="padding:3px 6px">
            <div style="display:flex;align-items:flex-start;gap:6px">
              <span style="font-size:10px;color:var(--amber);font-weight:600;white-space:nowrap;padding-top:6px">✎ หมายเหตุ</span>
              <textarea class="autogrow" oninput="autoGrow(this)" onchange="updateNoteText(${it.id},this.value)" placeholder="พิมพ์หมายเหตุ/ข้อความเพิ่มเติม..." rows="1" style="width:100%;min-height:1.6em;resize:none;overflow:hidden;color:var(--text);line-height:1.4;font-style:italic">${escHtml(it.text||'')}</textarea>
            </div>
          </td>
          ${actionCell}
        </tr>`;
      }
      if (!it.asHeader) itemNum++;   // หัวข้อกลุ่มไม่กินเลขลำดับ
      // ปุ่มสลับ "ตั้งเป็นหัวข้อกลุ่ม" (H) — ใช้เครื่องมือเพิ่มรายการเดียวกัน
      const hdrBtn = `<button class="action-btn" onclick="toggleItemHeader(${it.id})" title="${it.asHeader?'เปลี่ยนกลับเป็นรายการปกติ':'ตั้งเป็นหัวข้อกลุ่ม (ไม่คิดเงิน)'}" style="font-size:10px;font-weight:800;${it.asHeader?'color:var(--accent2)':'color:var(--muted)'}">H</button>`;
      const itemAction = `<td style="width:54px"><div class="row-actions">${hdrBtn}
            <button class="action-btn" onclick="removeItem(${it.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
            <input type="number" class="row-h-input" min="0" value="${it.rowH||''}" placeholder="สูง" title="ความสูงแถว (px)" onchange="setRowHeight(${it.id},this.value)">
          </div></td>`;
      const dragTd = `<td class="drag-handle" style="text-align:center;cursor:grab;padding:5px 2px;width:24px;color:var(--muted)" title="ลากเพื่อเรียง"><svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16" style="display:block;margin:auto;opacity:0.35"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg></td>`;
      // ── รายการที่ตั้งเป็นหัวข้อกลุ่ม: โชว์เฉพาะ Description กึ่งกลาง+ตัวหนา ไม่มีตัวเลข ──
      if (it.asHeader) {
        return `<tr data-id="${it.id}" class="group-row" draggable="true" style="${hStyle}"
          ondragstart="itemDragStart(event,${it.id})" ondragover="itemDragOver(event)" ondrop="itemDrop(event,${it.id})" ondragend="itemDragEnd(event)">
          ${dragTd}
          <td style="width:66px"></td>
          <td class="col-pn" style="width:84px"></td>
          <td style="padding:0"><input value="${escHtml(it.name)}" onchange="updateItemText(${it.id},'name',this.value)" placeholder="ชื่อหัวข้อกลุ่ม..." style="width:100%;font-weight:700;color:var(--accent2);text-align:center"></td>
          <td class="col-qty" style="width:70px"></td>
          <td class="col-unit" style="width:70px"></td>
          <td class="col-price" style="width:110px"></td>
          <td class="col-disc" style="width:70px"></td>
          <td class="col-total"></td>
          ${itemAction}
        </tr>`;
      }
      return `<tr data-id="${it.id}" draggable="true" style="${hStyle}"
        ondragstart="itemDragStart(event,${it.id})"
        ondragover="itemDragOver(event)"
        ondrop="itemDrop(event,${it.id})"
        ondragend="itemDragEnd(event)">
        ${dragTd}
        <td style="width:66px;vertical-align:top"><input value="${escHtml(it.no||'')}" maxlength="9" onchange="updateItemText(${it.id},'no',this.value)" placeholder="${itemNum}" title="หมายเลขนำหน้า — เว้นว่าง = เลขอัตโนมัติ" style="text-align:center;font-size:11px;padding:0.2em 2px"></td>
        <td class="col-pn" style="width:112px;vertical-align:top"><input value="${escHtml(it.pn||'')}" maxlength="15" onchange="updateItemText(${it.id},'pn',this.value)" placeholder="Part No." style="font-size:11px"></td>
        <td>
          <input value="${escHtml(it.name)}" onchange="updateItemText(${it.id},'name',this.value)" placeholder="ชื่อรายการ..." style="min-width:160px;margin-bottom:0.25em">
          <textarea class="autogrow" oninput="autoGrow(this)" onchange="updateItemText(${it.id},'desc',this.value)" placeholder="รายละเอียดเพิ่มเติม..." rows="1" style="width:100%;min-height:1.6em;resize:none;overflow:hidden;color:var(--muted);line-height:1.35">${escHtml(it.desc||'')}</textarea>
        </td>
        <td class="col-qty" style="width:70px"><input type="number" value="${it.qty}" min="1" oninput="updateItemNum(${it.id},'qty',+this.value)"></td>
        <td class="col-unit" style="width:70px"><input value="${escHtml(it.unit)}" onchange="updateItemText(${it.id},'unit',this.value)"></td>
        <td class="col-price" style="width:110px"><input value="${escHtml(String(it.price))}" oninput="updateItemPrice(${it.id},this.value)" placeholder="0 หรือ Included" style="text-align:right" title="ใส่ตัวเลข หรือข้อความ เช่น Included (ราคาเหมา)">${(()=>{const _c=itemCost(it);const _p=catalogPriceFor(it);return `<div style="font-size:9px;text-align:right;margin-top:1px;line-height:1.3">${_p>0?`<span style="color:var(--accent2)" title="ราคาขายมาตรฐานจาก Catalog">ขาย ${fmt(_p)}</span>`:''}<span style="color:${_c>0?'var(--muted)':'var(--amber)'};margin-left:6px" title="ราคาต้นทุน (จากจัดซื้อ/Catalog)">ทุน ${fmt(_c)}</span></div>`;})()}</td>
        <td class="col-disc" style="width:70px"><input type="number" value="${it.disc}" min="0" max="100" oninput="updateItemNum(${it.id},'disc',+this.value)" style="text-align:right${isBelowCost(it)?';border-color:var(--red);background:rgba(248,113,113,0.08)':''}" ${isBelowCost(it)?'title="ราคาขายหลังลด ต่ำกว่าทุน — ลดเพิ่มไม่ได้ ต้องขออนุมัติ"':''}></td>
        <td class="col-total" style="text-align:right;font-family:var(--mono);font-size:12px;white-space:nowrap;color:var(--accent2);padding-right:8px">${isBelowCost(it)?'<span title="ต่ำกว่าทุน" style="color:var(--red)">⚠ </span>':''}${totalCell(it)}</td>
        ${itemAction}
      </tr>`;
    }).join('');
    if (typeof autoGrowAll === 'function') setTimeout(function(){ autoGrowAll(document.getElementById('items-body')); }, 0);
  } else {
    quoteItems.forEach(it => {
      if (it.type === 'group' || it.type === 'blank' || it.type === 'pagebreak' || it.type === 'note') return;
      const row = document.querySelector(`#items-body tr[data-id="${it.id}"]`);
      if (row) {
        const lt = row.querySelector('.col-total');
        if (lt) lt.textContent = totalCell(it);
      }
    });
  }
  calcTotals();
  updateApproverBox();
}

function updateGroupTitle(id, val) {
  const it = quoteItems.find(i => i.id == id);
  if (it) it.title = val;
}

// ── ปรับความสูงรายแถว (ใส่ค่าตัวเลข px) ──────────────────────
function setRowHeight(id, val) {
  const it = quoteItems.find(i => i.id == id);
  if (!it) return;
  let h = parseInt(val, 10);
  if (!h || h < 0) h = 0;            // 0 / ว่าง = ความสูงอัตโนมัติ
  it.rowH = h;
  const tr = document.querySelector(`#items-body tr[data-id="${id}"]`);
  if (tr) tr.style.height = h ? h + 'px' : '';
}

// บรรทัดว่าง: จับความสูงจากการลาก (resize) เก็บลง rowH อัตโนมัติ
function syncBlankH(id, el) {
  const it = quoteItems.find(i => i.id == id);
  if (it) it.rowH = Math.max(22, Math.round(el.offsetHeight));
}

// per-quote row heights (เก็บใน Settings list ตามลำดับแถว)
function getQuoteRowH(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteRowH_' + quoteId);
    if (it && it.Value) { const a = JSON.parse(it.Value); if (Array.isArray(a)) return a; }
  } catch(e) {}
  return null;
}
async function saveQuoteRowH(quoteId) {
  const value = JSON.stringify(quoteItems.map(i => i.rowH || 0));
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteRowH_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteRowH_' + quoteId, Value: value });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteRowH_' + quoteId, Value: value });
    }
  } catch(e) { console.warn('Save row heights failed:', e.message); }
}

// ── Font size — 4 zones ────────────────────────────────────
// zone keys: info | items | totals | notes
const ZONE_FONT_DEFAULT = { info:12, items:12, totals:13, notes:12 };
let zoneFont = { ...ZONE_FONT_DEFAULT };
// each zone: which element to set the CSS var on, and the var name
const ZONE_FONT_CFG = {
  info:   { sel:'#nq-zone-info',   varName:'--zfs-info'   },
  items:  { sel:'.items-wrap',     varName:'--items-fs'   },
  totals: { sel:'#nq-zone-totals', varName:'--zfs-totals' },
  notes:  { sel:'#nq-zone-notes',  varName:'--zfs-notes'  },
};
function setZoneFont(zone, size) {
  size = Math.min(24, Math.max(8, size));
  zoneFont[zone] = size;
  const cfg = ZONE_FONT_CFG[zone];
  if (cfg) {
    const el = document.querySelector(cfg.sel);
    if (el) el.style.setProperty(cfg.varName, size + 'px');
  }
  const slider = document.getElementById('fs-' + zone);
  if (slider && +slider.value !== size) slider.value = size;
  const label = document.getElementById('fs-' + zone + '-val');
  if (label) label.textContent = size + 'px';
}
// apply all zones to DOM (call on page open / after loading a quote)
function applyAllZoneFonts() {
  Object.keys(zoneFont).forEach(z => setZoneFont(z, zoneFont[z]));
}
// set zoneFont from a saved object (or defaults) then apply to DOM
function applyZoneFonts(fonts) {
  zoneFont = { ...ZONE_FONT_DEFAULT, ...(fonts || {}) };
  applyAllZoneFonts();
}
// read a quote's saved zone fonts from the Settings cache (null if none)
function getQuoteZoneFonts(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'ZoneFonts_' + quoteId);
    if (it && it.Value) {
      const o = JSON.parse(it.Value);
      if (o && typeof o === 'object') return { ...ZONE_FONT_DEFAULT, ...o };
    }
  } catch(e) {}
  return null;
}
// persist the current zoneFont for a specific quote (Settings list, key/value)
async function saveQuoteZoneFonts(quoteId) {
  const value = JSON.stringify(zoneFont);
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const existing = items.find(i => i.Title === 'ZoneFonts_' + quoteId);
    if (existing) { await updateListItem(CONFIG.lists.settings, existing.id, { Value: value }); existing.Value = value; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'ZoneFonts_' + quoteId, Value: value });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'ZoneFonts_' + quoteId, Value: value });
    }
  } catch(e) { console.warn('Save zone fonts failed:', e.message); }
}
// backward-compat alias (older callers)
function changeItemsFont(size) { setZoneFont('items', size); }

// ── Floating draggable toolbar (New Quote) ──────────────────
let _nqFabInit = false, _nqFabDrag = null;
function initNqFab() {
  const fab = document.getElementById('nq-fab');
  const body = document.getElementById('nq-fab-body');
  const tools = document.getElementById('nq-tools');
  if (!fab || !body) return;
  if (!_nqFabInit && tools) {
    body.appendChild(tools);                 // ย้ายปุ่มทั้งหมดเข้าวิดเจ็ต (ครั้งเดียว)
    try {
      const p = JSON.parse(localStorage.getItem('nqfab_pos') || 'null');
      if (p && p.left) { fab.style.left = p.left; fab.style.top = p.top; fab.style.right = 'auto'; }
      else { fab.style.left = Math.max(8, window.innerWidth - fab.offsetWidth - 24) + 'px'; fab.style.top = '130px'; fab.style.right = 'auto'; }
    } catch(e) {}
    if (localStorage.getItem('nqfab_collapsed') === '1') {
      fab.classList.add('collapsed');
      const b = fab.querySelector('#nq-fab-head button'); if (b) b.textContent = '▸';
    }
    _nqFabInit = true;
  }
}
function toggleNqFab(e) {
  if (e) e.stopPropagation();
  const fab = document.getElementById('nq-fab');
  fab.classList.toggle('collapsed');
  const b = fab.querySelector('#nq-fab-head button');
  if (b) b.textContent = fab.classList.contains('collapsed') ? '▸' : '▾';
  try { localStorage.setItem('nqfab_collapsed', fab.classList.contains('collapsed') ? '1' : '0'); } catch(e) {}
}
function nqFabDragStart(e) {
  if (e.target.closest('button')) return;     // กดปุ่มย่อ ไม่ใช่ลาก
  const fab = document.getElementById('nq-fab');
  _nqFabDrag = { sx:e.clientX, sy:e.clientY, ox:fab.offsetLeft, oy:fab.offsetTop };
  document.getElementById('nq-fab-head').style.cursor = 'grabbing';
  window.addEventListener('pointermove', nqFabDragMove);
  window.addEventListener('pointerup', nqFabDragEnd);
  e.preventDefault();
}
function nqFabDragMove(e) {
  if (!_nqFabDrag) return;
  const fab = document.getElementById('nq-fab');
  let left = _nqFabDrag.ox + (e.clientX - _nqFabDrag.sx);
  let top  = _nqFabDrag.oy + (e.clientY - _nqFabDrag.sy);
  left = Math.max(4, Math.min(window.innerWidth - fab.offsetWidth - 4, left));
  top  = Math.max(4, Math.min(window.innerHeight - 40, top));
  fab.style.left = left + 'px'; fab.style.top = top + 'px'; fab.style.right = 'auto';
}
function nqFabDragEnd() {
  if (!_nqFabDrag) return;
  const fab = document.getElementById('nq-fab');
  document.getElementById('nq-fab-head').style.cursor = 'grab';
  try { localStorage.setItem('nqfab_pos', JSON.stringify({ left:fab.style.left, top:fab.style.top })); } catch(e) {}
  window.removeEventListener('pointermove', nqFabDragMove);
  window.removeEventListener('pointerup', nqFabDragEnd);
  _nqFabDrag = null;
}

// ── ระยะห่างแถว (per-quote: ช่องไฟ + ระยะบรรทัด) ───────────────
const ROW_SPACING_DEFAULT = { pad:4, lineH:1.35 };
let rowSpacing = { ...ROW_SPACING_DEFAULT };
function toggleSpacingPanel(e) {
  e.stopPropagation();
  document.getElementById('spacing-panel').classList.toggle('open');
}
function setRowSpacing(key, val) {
  rowSpacing[key] = (key === 'lineH') ? (+val || 1.35) : (parseInt(val,10) || 0);
  applyRowSpacing();
}
function applyRowSpacing() {
  const tbl = document.querySelector('.items-table');
  if (tbl) {
    tbl.style.setProperty('--row-pad', rowSpacing.pad + 'px');
    tbl.style.setProperty('--row-lh', rowSpacing.lineH);
  }
  const ps = document.getElementById('sp-pad'), pv = document.getElementById('sp-pad-val');
  if (ps) ps.value = rowSpacing.pad; if (pv) pv.textContent = rowSpacing.pad + 'px';
  const ls = document.getElementById('sp-lh'), lv = document.getElementById('sp-lh-val');
  if (ls) ls.value = Math.round(rowSpacing.lineH * 100); if (lv) lv.textContent = rowSpacing.lineH.toFixed(2);
}
function setRowSpacingState(s) {
  rowSpacing = { ...ROW_SPACING_DEFAULT, ...(s || {}) };
  applyRowSpacing();
}
function getQuoteSpacing(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteSpacing_' + quoteId);
    if (it && it.Value) { const o = JSON.parse(it.Value); if (o && typeof o === 'object') return o; }
  } catch(e) {}
  return null;
}
async function saveQuoteSpacing(quoteId) {
  const value = JSON.stringify(rowSpacing);
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteSpacing_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteSpacing_' + quoteId, Value: value });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteSpacing_' + quoteId, Value: value });
    }
  } catch(e) { console.warn('Save spacing failed:', e.message); }
}

// ── อายุใบเสนอราคา (per-quote, เก็บใน Settings list เลี่ยงปัญหา column) ──
function getQuoteValidity(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteValidity_' + quoteId);
    return it && it.Value ? it.Value : '';
  } catch(e) { return ''; }
}
// ── ชื่อ/ที่อยู่ EN รายใบเสนอราคา (override ทะเบียนลูกค้า) — เก็บใน Settings ต่อ quote id ──
function getQuoteDocEN(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteDocEN_' + quoteId);
    return it && it.Value ? (JSON.parse(it.Value) || {}) : {};
  } catch(e) { return {}; }
}
async function saveQuoteDocEN(quoteId, nameEN, addrEN) {
  try {
    const val = JSON.stringify({ nameEN: (nameEN||'').trim(), addrEN: (addrEN||'').trim() });
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteDocEN_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: val }); ex.Value = val; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteDocEN_' + quoteId, Value: val });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteDocEN_' + quoteId, Value: val });
    }
  } catch(e) { console.warn('Save QuoteDocEN failed:', e.message); }
}
async function saveQuoteValidity(quoteId, val) {
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteValidity_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: val }); ex.Value = val; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteValidity_' + quoteId, Value: val });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteValidity_' + quoteId, Value: val });
    }
  } catch(e) { console.warn('Save validity failed:', e.message); }
}

// ── Tag / ชื่อ Project (per-quote, เก็บใน Settings list เลี่ยงปัญหา column) ──
function getQuoteTag(quoteId) {
  try {
    const it = (_settingsCache || []).find(i => i.Title === 'QuoteTag_' + quoteId);
    return it && it.Value ? it.Value : '';
  } catch(e) { return ''; }
}
async function saveQuoteTag(quoteId, val) {
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteTag_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: val }); ex.Value = val; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteTag_' + quoteId, Value: val });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteTag_' + quoteId, Value: val });
    }
  } catch(e) { console.warn('Save tag failed:', e.message); }
}

// ── Fax ลูกค้า (per-quote, เก็บใน Settings list เลี่ยง column) ──
function getQuoteFax(quoteId) {
  try { const it = (_settingsCache || []).find(i => i.Title === 'QuoteFax_' + quoteId); return it && it.Value ? it.Value : ''; } catch(e) { return ''; }
}
async function saveQuoteFax(quoteId, val) {
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteFax_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: val }); ex.Value = val; }
    else { const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteFax_' + quoteId, Value: val }); if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteFax_' + quoteId, Value: val }); }
  } catch(e) { console.warn('Save fax failed:', e.message); }
}

// ── ช่องทางที่มา / Inquiry source (per-quote, เก็บใน Settings list) ──
const QUOTE_SOURCES = ['โทรศัพท์','อีเมล','Line','หน้าร้าน / Walk-in','ลูกค้าเดิม','แนะนำต่อ','เว็บไซต์','อื่นๆ'];
function fillQuoteSourceOptions(val) {
  const sel = document.getElementById('q-source'); if (!sel) return;
  sel.innerHTML = '<option value="">— ไม่ระบุ —</option>' + QUOTE_SOURCES.map(s => `<option${val===s?' selected':''}>${s}</option>`).join('');
  sel.value = val || '';
}
function getQuoteSource(quoteId) {
  try { const it = (_settingsCache || []).find(i => i.Title === 'QuoteSource_' + quoteId); return it && it.Value ? it.Value : ''; } catch(e) { return ''; }
}
async function saveQuoteSource(quoteId, val) {
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteSource_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: val }); ex.Value = val; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteSource_' + quoteId, Value: val });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteSource_' + quoteId, Value: val });
    }
  } catch(e) { console.warn('Save source failed:', e.message); }
}

// ── ส่วนลดรวม (per-quote: mode % หรือ ฿ + ค่า) ───────────────
function getQuoteDisc(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteDisc_' + quoteId);
    if (it && it.Value) { const o = JSON.parse(it.Value); if (o && typeof o === 'object') return o; }
  } catch(e) {}
  return null;
}
async function saveQuoteDisc(quoteId) {
  const value = JSON.stringify({
    mode: document.getElementById('g-disc-mode')?.value || 'pct',
    value: +(document.getElementById('g-disc').value) || 0
  });
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteDisc_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteDisc_' + quoteId, Value: value });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteDisc_' + quoteId, Value: value });
    }
  } catch(e) { console.warn('Save disc failed:', e.message); }
}

// ── Part No. + ราคาดิบรายชิ้น (per-quote, เก็บใน Settings — เลี่ยงเพิ่ม column) ──
function getQuoteItemExtra(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteItemExtra_' + quoteId);
    if (it && it.Value) { const a = JSON.parse(it.Value); if (Array.isArray(a)) return a; }
  } catch(e) {}
  return null;
}
async function saveQuoteItemExtra(quoteId, arr) {
  const value = JSON.stringify(arr || []);
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteItemExtra_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteItemExtra_' + quoteId, Value: value });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteItemExtra_' + quoteId, Value: value });
    }
  } catch(e) { console.warn('Save item extra failed:', e.message); }
}

// ── Column toggle ──────────────────────────────────────────
function toggleColPanel(e) {
  e.stopPropagation();
  const p = document.getElementById('col-toggle-panel');
  p.classList.toggle('open');
}
document.addEventListener('click', () => {
  const p = document.getElementById('col-toggle-panel');
  if (p) p.classList.remove('open');
  const sp = document.getElementById('spacing-panel');
  if (sp) sp.classList.remove('open');
});
// สถานะการแสดง/ซ่อน คอลัมน์ (รายใบ)
let colVisible = { pn:true, qty:true, unit:true, price:true, disc:true, total:true };
let colLines = false;   // #7 เส้นแบ่งคอลัมน์แนวตั้งใน PDF (รายใบ)
let pricePeriod = '';   // '' | 'month' | 'year' — งวดของราคาต่อหน่วย (หัวคอลัมน์ราคา)
function setPricePeriod(v) { pricePeriod = v || ''; }
function toggleColLines(on) { colLines = !!on; }
function toggleCol(col, visible) {
  colVisible[col] = visible;
  const tbl = document.querySelector('.items-table');
  if (tbl) tbl.classList.toggle('hide-col-' + col, !visible);
}
// apply state to editor table + sync checkboxes (call on page open / load)
function applyColVisibility() {
  const tbl = document.querySelector('.items-table');
  Object.keys(colVisible).forEach(col => {
    if (tbl) tbl.classList.toggle('hide-col-' + col, !colVisible[col]);
    const cb = document.getElementById('colcb-' + col);
    if (cb) cb.checked = colVisible[col];
  });
  const cbL = document.getElementById('colcb-lines'); if (cbL) cbL.checked = colLines;
  const ppSel = document.getElementById('price-period-sel'); if (ppSel) ppSel.value = pricePeriod;
}
function setColVisible(state) {
  const st = state || {};
  colLines = !!st.__lines;
  pricePeriod = st.__pricePeriod || '';
  const { __lines, __pricePeriod, ...cols } = st;
  colVisible = { pn:true, qty:true, unit:true, price:true, disc:true, total:true, ...cols };
  applyColVisibility();
}
// per-quote persistence (Settings list)
function getQuoteCols(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'QuoteCols_' + quoteId);
    if (it && it.Value) { const o = JSON.parse(it.Value); if (o && typeof o === 'object') return o; }
  } catch(e) {}
  return null;
}
async function saveQuoteCols(quoteId) {
  const value = JSON.stringify({ ...colVisible, __lines: colLines, __pricePeriod: pricePeriod });
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'QuoteCols_' + quoteId);
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
    else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'QuoteCols_' + quoteId, Value: value });
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'QuoteCols_' + quoteId, Value: value });
    }
  } catch(e) { console.warn('Save cols failed:', e.message); }
}

function updateItemText(id, field, val) {
  const it = quoteItems.find(i => i.id == id);
  if (it) it[field] = val;
}

function updateItemNum(id, field, val) {
  const it = quoteItems.find(i => i.id == id);
  if (!it) return;
  it[field] = val;
  const row = document.querySelector(`#items-body tr[data-id="${id}"]`);
  if (row) { const lt = row.querySelector('.col-total'); if (lt) lt.textContent = totalCell(it); }
  calcTotals();
  updateApproverBox();
}

// สลับรายการเป็น "หัวข้อกลุ่ม" (ไม่คิดเงิน โชว์เฉพาะ Description กึ่งกลาง+ตัวหนา) แล้ว render ใหม่ทั้งตาราง
function toggleItemHeader(id) {
  const it = quoteItems.find(i => i.id == id);
  if (!it) return;
  it.asHeader = !it.asHeader;
  document.getElementById('items-body').innerHTML = '';   // บังคับ render โครงใหม่
  renderItems();
  calcTotals();
  updateApproverBox();
}

// ราคา: เก็บค่าดิบ (ตัวเลข หรือข้อความ เช่น Included) แล้วอัปเดตยอด
function updateItemPrice(id, val) {
  const it = quoteItems.find(i => i.id == id);
  if (!it) return;
  it.price = val;
  const row = document.querySelector(`#items-body tr[data-id="${id}"]`);
  if (row) { const lt = row.querySelector('.col-total'); if (lt) lt.textContent = totalCell(it); }
  calcTotals();
  updateApproverBox();
}


// ส่วนลดรวม: คิดเป็น % หรือจำนวนเงินบาทตาม g-disc-mode
function globalDiscAmt(sub) {
  const v = +(document.getElementById('g-disc').value) || 0;
  const mode = document.getElementById('g-disc-mode')?.value || 'pct';
  return mode === 'amt' ? Math.min(v, sub) : sub * Math.min(v, 100) / 100;
}
function calcTotals() {
  const sub = quoteItems.reduce((a, i) => a + lineTotal(i), 0);
  const discAmt = globalDiscAmt(sub);
  const after = sub - discAmt;
  const vat = after * 0.07;
  const grand = after + vat;
  document.getElementById('t-sub').textContent = fmt(sub);
  document.getElementById('t-disc').textContent = fmt(discAmt);
  document.getElementById('t-after').textContent = fmt(after);
  document.getElementById('t-vat').textContent = fmt(vat);
  document.getElementById('t-grand').textContent = fmt(grand);
  if (typeof renderBelowCostBanner === 'function') renderBelowCostBanner();
  return { sub, discAmt, after, vat, grand };
}
// Update approver box whenever totals change
function calcTotalsAndApprover() {
  const t = calcTotals();
  updateApproverBox();
  return t;
}
document.getElementById('g-disc')?.addEventListener('input', calcTotals);

// ============================================================
// EDIT QUOTE
// ============================================================
async function editQuote(id) {
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  if (q.Status === 'Cancelled') { toast('ใบเสนอราคานี้ถูกยกเลิกแล้ว — เก็บเป็นประวัติเท่านั้น', 'error'); return; }
  if (!canEditQuote(q)) { toast('คุณไม่มีสิทธิ์แก้ไขใบเสนอราคานี้', 'error'); return; }
  editingQuoteId = id;

  // Load quote items from SharePoint
  toast('กำลังโหลดข้อมูล...', 'info');
  try {
    const allItems = await getListItems(CONFIG.lists.quoteItems);
    const items = allItems.filter(i => String(i.QuoteID) === String(id));
    const rowHs = getQuoteRowH(id) || [];
    const extra = getQuoteItemExtra(id) || [];
    quoteItems = items.map((it, idx) => {
      const rh = +rowHs[idx] || 0;
      const ex = extra[idx] || {};
      if ((it.Title||'').startsWith('__GROUP__:')) {
        return { id: Date.now() + idx, type:'group', title: it.Title.slice(10), spId: it.id, rowH: rh };
      }
      if (it.Title === '__BLANK__') {
        return { id: Date.now() + idx, type:'blank', spId: it.id, rowH: rh };
      }
      if (it.Title === '__PAGEBREAK__') {
        return { id: Date.now() + idx, type:'pagebreak', spId: it.id };
      }
      if (it.Title === '__NOTE__') {
        return { id: Date.now() + idx, type:'note', text: it.Description || '', spId: it.id };
      }
      return {
        id: Date.now() + idx, type:'item', spId: it.id,
        no: ex.no || '', pn: ex.pn || '',
        name: it.Title || '', desc: it.Description || '',
        qty: it.Quantity || 1, unit: it.Unit || 'ชิ้น',
        // ราคา: ใช้ค่าดิบจาก extra ถ้ามี (รองรับข้อความ Included) ไม่งั้น fallback เป็นตัวเลขจาก column
        price: (ex.price !== undefined && ex.price !== '') ? ex.price : (it.UnitPrice || 0),
        disc: it.DiscountPct || 0, rowH: rh, cost: +ex.cost||0, vendorId: ex.vendorId||'', asHeader: !!ex.asHeader
      };
    });
  } catch(e) {
    quoteItems = [];
  }

  if (quoteItems.length === 0) { addItem(); addItem(); }

  // Go to newquote page first (editingQuoteId already set, so initNewQuote will be skipped)
  showPage('newquote', null);

  // Fill form fields AFTER page is shown
  setTimeout(() => {
    const _set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

    // ข้อมูลใบเสนอราคา
    _set('q-no',      q.Title);
    _set('q-date',    (q.QuoteDate||'').split('T')[0] || new Date().toISOString().split('T')[0]);

    // ข้อมูลลูกค้า
    _set('q-client',        q.ClientName);
    _set('q-contact',       q.ContactPerson);
    _set('q-phone',         q.Phone);
    _set('q-email',         q.Email);
    _set('q-cust-address',  q.CustomerAddress||q.CustomerAddress);
    _set('q-cust-taxid',    q.CustomerTaxID||q.CustomerTaxID);
    _set('q-cust-tel',      q.CustomerTel||q.CustomerTel);
    _set('q-cust-fax',      getQuoteFax(id));
    { const _en = getQuoteDocEN(id); _set('q-client-en', _en.nameEN); _set('q-cust-address-en', _en.addrEN); }

    // การชำระและสัญญา
    _set('q-payment', q.PaymentMethod || 'เงินสด');

    // อายุใบเสนอราคา (โหลดจาก Settings รายใบ) — default 30 วัน
    const _val = getQuoteValidity(id);
    _set('q-validity', _val || '30 วัน');
    _set('q-tag', q.Tag || getQuoteTag(id) || '');
    fillQuoteSourceOptions(getQuoteSource(id));
    // Date / Expire คำนวณอัตโนมัติจากวันที่ใบ + อายุใบเสนอราคา
    updateAutoDates();

    // ข้อมูล Sale
    _set('q-sale-name',  q.SaleName);
    _set('q-sale-tel',   q.SaleTel);
    _set('q-sale-email', q.SaleEmail);

    // หมายเหตุ & เงื่อนไข
    _set('q-note',  q.Note);
    _set('q-terms', q.Terms);

    // ส่วนลดรวม — โหลด mode+ค่าที่บันทึกรายใบ (ถ้าไม่มี ใช้ DiscountPct แบบ % เดิม)
    const discEl = document.getElementById('g-disc');
    const discModeEl = document.getElementById('g-disc-mode');
    const savedDisc = getQuoteDisc(id);
    if (savedDisc) {
      if (discEl) discEl.value = savedDisc.value || 0;
      if (discModeEl) discModeEl.value = savedDisc.mode === 'amt' ? 'amt' : 'pct';
    } else {
      if (discEl) discEl.value = q.DiscountPct || 0;
      if (discModeEl) discModeEl.value = 'pct';
    }

    // Show edit banner
    const editBanner = document.getElementById('edit-banner');
    if (editBanner) {
      editBanner.style.display = 'flex';
      editBanner.querySelector('.edit-quote-no').textContent = q.Title || '';
    }

    // Force full re-render of items
    document.getElementById('items-body').innerHTML = '';
    renderItems();
    updateApproverBox();
    // โหลดขนาดฟอนต์ + คอลัมน์ + ระยะห่างของใบนี้ (รายใบ) — ถ้าไม่เคยตั้งใช้ค่าเริ่มต้น
    applyZoneFonts(getQuoteZoneFonts(id));
    setColVisible(getQuoteCols(id));
    setRowSpacingState(getQuoteSpacing(id));
    // โหลดลายเซ็นมาแสดงในฟอร์มด้วย (เดิมโผล่แค่ใน PDF)
    initQuoteSignature();
    toast('โหลดข้อมูลสำเร็จ — แก้ไขได้เลย', 'success');
  }, 50);
}

// ============================================================
// ตะกร้า (Baskets) — จัดกลุ่มใบเสนอราคาหน้า Home (เก็บใน Settings JSON)
//   QuoteBaskets    = [{id,name,color}]
//   QuoteBasketMap  = { quoteId: [basketId,...] }  (1 ใบอยู่หลายตะกร้าได้)
// ============================================================
let _baskets = null, _basketMap = null, _activeBasket = '__none__', _basketView = '', _assignQuoteId = null;  // _basketView = โฟลเดอร์ที่กำลังเปิดดู (''=ราก)
const BASKET_COLORS = ['#4f8ef7','#34d399','#fbbf24','#f87171','#a78bfa','#f472b6','#22d3ee','#fb923c'];
// ตะกร้าเป็นของแต่ละคน (per-profile) — ผูก key กับอีเมลผู้ใช้
function _bkUser() { return ((currentUser && currentUser.email) || 'anon').toLowerCase(); }
function _bkKey(base) { return base + '_' + _bkUser(); }
function loadBaskets() {
  // อ่านของผู้ใช้ปัจจุบัน ถ้ายังไม่มี ลอง fallback ค่ารวมเดิม (ของเก่าก่อนแยก profile)
  try { _baskets = JSON.parse(getSettingValue(_bkKey('QuoteBaskets')) || getSettingValue('QuoteBaskets') || '[]') || []; } catch(e) { _baskets = []; }
  try { _basketMap = JSON.parse(getSettingValue(_bkKey('QuoteBasketMap')) || getSettingValue('QuoteBasketMap') || '{}') || {}; } catch(e) { _basketMap = {}; }
}
function getBaskets()   { if (_baskets === null)   loadBaskets(); return _baskets; }
function getBasketMap() { if (_basketMap === null) loadBaskets(); return _basketMap; }
function quoteBaskets(qid) { return getBasketMap()[String(qid)] || []; }
function basketById(bid) { return getBaskets().find(b => b.id === bid); }
async function saveBaskets()   { await putSettingValue(_bkKey('QuoteBaskets'), JSON.stringify(getBaskets())); }
async function saveBasketMap() { await putSettingValue(_bkKey('QuoteBasketMap'), JSON.stringify(getBasketMap())); }
// ── tree helpers (sub-ตะกร้าไม่จำกัดชั้น) ──
function basketChildren(pid) { return getBaskets().filter(b => (b.parentId||'') === (pid||'')); }
function basketDescendants(bid) { const out = [bid]; basketChildren(bid).forEach(c => out.push(...basketDescendants(c.id))); return out; }
function basketAncestors(bid) { const out = []; let b = basketById(bid); while (b && b.parentId) { b = basketById(b.parentId); if (b) out.unshift(b); } return out; }
function basketHasChildren(bid) { return basketChildren(bid).length > 0; }
function basketRollupCount(bid) {
  const set = new Set(basketDescendants(bid)), map = getBasketMap();
  const live = new Set(quotesData.map(q => String(q.id)));
  return Object.keys(map).filter(qid => live.has(qid) && (map[qid]||[]).some(x => set.has(x))).length;
}

function renderBasketBar() {
  const bar = document.getElementById('basket-bar'); if (!bar) return;
  const map = getBasketMap();
  const uncat = quotesData.filter(q => !(map[String(q.id)]||[]).length).length;
  const chipBtn = (onclick, label, color, on) =>
    `<button onclick="${onclick}" style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:16px;border:1px solid ${on?(color||'var(--accent)'):'var(--border2)'};background:${on?(color?color+'22':'rgba(79,142,247,0.12)'):'var(--surface2)'};color:${on?(color||'var(--accent2)'):'var(--muted)'};font-size:12px;font-family:var(--font);cursor:pointer;font-weight:${on?600:400}">${label}</button>`;
  const folderChip = b => chipBtn(`openBasket('${b.id}')`,
    `<span style="width:9px;height:9px;border-radius:50%;background:${b.color};display:inline-block"></span> ${escHtml(b.name)} <span style="opacity:.6">${basketRollupCount(b.id)}</span>${basketHasChildren(b.id)?' <span style="opacity:.5">▸</span>':''}`,
    b.color, _activeBasket === b.id);
  // breadcrumb (โฟลเดอร์ที่กำลังอยู่)
  let crumbs = `<span onclick="gotoBasketView('')" style="cursor:pointer;color:${_basketView?'var(--accent2)':'var(--text)'}">🏠 หน้าหลัก</span>`;
  basketAncestors(_basketView).concat(_basketView?[basketById(_basketView)]:[]).filter(Boolean).forEach((b,i,arr) => {
    const last = i === arr.length-1;
    crumbs += ` <span style="color:var(--muted)">›</span> <span onclick="gotoBasketView('${b.id}')" style="cursor:pointer;color:${last?'var(--text)':'var(--accent2)'};font-weight:${last?600:400}">${escHtml(b.name)}</span>`;
  });
  // chips ของระดับปัจจุบัน
  let chips = '';
  if (_basketView === '') {
    chips += chipBtn(`setBasketFilter('__none__')`, `📥 ยังไม่จัด <span style="opacity:.6">${uncat}</span>`, null, _activeBasket==='__none__');
    basketChildren('').forEach(b => chips += folderChip(b));
    chips += chipBtn(`setBasketFilter('')`, `ทั้งหมด <span style="opacity:.6">${quotesData.length}</span>`, null, _activeBasket==='');
  } else {
    const kids = basketChildren(_basketView);
    kids.forEach(b => chips += folderChip(b));
    if (!kids.length) chips += `<span style="font-size:11px;color:var(--muted);padding:5px 4px">— ไม่มีตะกร้าย่อย —</span>`;
    chips += chipBtn(`addSubBasket('${_basketView}')`, '＋ ตะกร้าย่อย', null, false);
  }
  chips += `<button onclick="openBasketManage()" style="padding:5px 12px;border-radius:16px;border:1px dashed var(--border2);background:none;color:var(--muted);font-size:12px;font-family:var(--font);cursor:pointer">⚙ จัดการตะกร้า</button>`;
  bar.innerHTML = `<div style="font-size:12px;margin-bottom:8px">${crumbs}</div><div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center">${chips}</div>`;
}
function openBasket(bid) { _basketView = bid; _activeBasket = bid; renderBasketBar(); renderQuotes(); }        // เข้าโฟลเดอร์ + กรองซับทรี
function gotoBasketView(id) { _basketView = id; _activeBasket = id === '' ? '__none__' : id; renderBasketBar(); renderQuotes(); }
function setBasketFilter(v) { _activeBasket = v; if (v === '' || v === '__none__') _basketView = ''; renderBasketBar(); renderQuotes(); }
async function addSubBasket(pid) {
  const name = (prompt('ชื่อตะกร้าย่อย:') || '').trim(); if (!name) return;
  const baskets = getBaskets();
  baskets.push({ id: 'bk' + Date.now(), name, color: BASKET_COLORS[baskets.length % BASKET_COLORS.length], parentId: pid || '' });
  try { await saveBaskets(); } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message, 'error'); return; }
  renderBasketBar(); if (document.getElementById('basket-manage-modal')?.classList.contains('open')) renderBasketManage();
}
function passBasketFilter(q) {
  if (!_activeBasket) return true;
  const bs = quoteBaskets(q.id);
  if (_activeBasket === '__none__') return bs.length === 0;
  const set = new Set(basketDescendants(_activeBasket));   // รวมตะกร้าย่อยทั้งหมด
  return bs.some(x => set.has(x));
}
// จุดสีแสดงตะกร้าที่ใบนี้สังกัด (ใช้ในคอลัมน์เลขที่)
function basketDots(qid) {
  const bs = quoteBaskets(qid).map(basketById).filter(Boolean);
  if (!bs.length) return '';
  return ' ' + bs.map(b => `<span title="${escHtml(b.name)}" style="width:8px;height:8px;border-radius:50%;background:${b.color};display:inline-block;margin-left:2px;vertical-align:middle"></span>`).join('');
}

// ── ติดใบเข้าตะกร้า (assign modal) ──
function openBasketAssign(qid) {
  _assignQuoteId = String(qid);
  const q = quotesData.find(x => String(x.id) === _assignQuoteId);
  const ql = document.getElementById('ba-quote'); if (ql) ql.textContent = (q?.Title||'') + ' — ' + (q?.ClientName||'');
  renderBasketAssign();
  openModal('basket-assign-modal');
}
function _assignTreeRows(pid, depth, mine) {
  return basketChildren(pid).map(b => {
    const on = mine.includes(b.id);
    const row = `<label style="display:flex;align-items:center;gap:9px;padding:6px 10px;margin-left:${depth*18}px;border:1px solid ${on?b.color:'var(--border2)'};border-radius:8px;cursor:pointer;background:${on?b.color+'1a':'transparent'}">
      <input type="checkbox" ${on?'checked':''} onchange="toggleQuoteBasket('${b.id}')" style="width:auto">
      <span style="width:10px;height:10px;border-radius:50%;background:${b.color};display:inline-block"></span>
      <span style="font-size:13px">${escHtml(b.name)}</span></label>`;
    return row + _assignTreeRows(b.id, depth+1, mine);
  }).join('');
}
function renderBasketAssign() {
  const list = document.getElementById('ba-list'); if (!list) return;
  const mine = quoteBaskets(_assignQuoteId);
  const rows = _assignTreeRows('', 0, mine);
  list.innerHTML = rows || '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">ยังไม่มีตะกร้า — สร้างด้านล่างได้เลย</div>';
}
async function toggleQuoteBasket(bid) {
  const map = getBasketMap(), key = _assignQuoteId;
  const arr = map[key] || [];
  const i = arr.indexOf(bid);
  if (i >= 0) arr.splice(i, 1); else arr.push(bid);
  if (arr.length) map[key] = arr; else delete map[key];
  renderBasketAssign(); renderBasketBar(); renderQuotes();
  try { await saveBasketMap(); } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message, 'error'); }
}
async function basketCreateInline(fromManage) {
  const inp = document.getElementById(fromManage ? 'bm-new' : 'ba-new');
  const name = (inp?.value || '').trim();
  if (!name) { toast('ใส่ชื่อตะกร้าก่อน', 'error'); return; }
  const baskets = getBaskets();
  const color = BASKET_COLORS[baskets.length % BASKET_COLORS.length];
  const b = { id: 'bk' + Date.now(), name, color, parentId: '' };   // สร้างที่ราก
  baskets.push(b);
  if (inp) inp.value = '';
  try { await saveBaskets(); } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message, 'error'); return; }
  if (fromManage) renderBasketManage(); else renderBasketAssign();
  renderBasketBar();
}

// ── จัดการตะกร้า (manage modal) ──
function openBasketManage() { renderBasketManage(); openModal('basket-manage-modal'); }
function _manageTreeRows(pid, depth) {
  return basketChildren(pid).map(b => {
    const row = `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin-left:${depth*18}px;border:1px solid var(--border2);border-radius:8px">
      <input type="color" value="${b.color}" onchange="basketSetColor('${b.id}',this.value)" style="width:28px;height:28px;padding:1px;border:none;background:none;cursor:pointer">
      <input value="${escHtml(b.name)}" onchange="basketRename('${b.id}',this.value)" style="flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:6px 9px;font-size:13px;color:var(--text);font-family:var(--font)">
      <span style="font-size:11px;color:var(--muted);white-space:nowrap">${basketRollupCount(b.id)} ใบ</span>
      <button class="btn btn-sm" onclick="addSubBasket('${b.id}')" title="เพิ่มตะกร้าย่อย">＋ ย่อย</button>
      <button class="btn btn-sm btn-danger" onclick="basketDelete('${b.id}')" title="ลบตะกร้า">✕</button>
    </div>`;
    return row + _manageTreeRows(b.id, depth+1);
  }).join('');
}
function renderBasketManage() {
  const list = document.getElementById('bm-list'); if (!list) return;
  const rows = _manageTreeRows('', 0);
  list.innerHTML = rows || '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">ยังไม่มีตะกร้า</div>';
}
async function basketRename(bid, name) { const b = basketById(bid); if (!b) return; b.name = (name||'').trim() || b.name; try { await saveBaskets(); } catch(e){} renderBasketBar(); }
async function basketSetColor(bid, color) { const b = basketById(bid); if (!b) return; b.color = color; try { await saveBaskets(); } catch(e){} renderBasketBar(); renderBasketManage(); }
async function basketDelete(bid) {
  const b = basketById(bid); if (!b) return;
  const hasKids = basketHasChildren(bid);
  if (!confirm('ลบตะกร้า "' + b.name + '"?' + (hasKids ? '\nตะกร้าย่อยจะถูกเลื่อนขึ้นไปอยู่ระดับบน' : '') + '\nใบเสนอราคาไม่ถูกลบ แค่เอาออกจากตะกร้านี้')) return;
  const parent = b.parentId || '';
  getBaskets().forEach(x => { if ((x.parentId||'') === bid) x.parentId = parent; });   // เลื่อนลูกขึ้นบน
  _baskets = getBaskets().filter(x => x.id !== bid);
  const map = getBasketMap();
  Object.keys(map).forEach(qid => { const a = map[qid].filter(x => x !== bid); if (a.length) map[qid] = a; else delete map[qid]; });
  if (_activeBasket === bid) { _activeBasket = parent || '__none__'; }
  if (_basketView === bid) { _basketView = parent; }
  try { await saveBaskets(); await saveBasketMap(); } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message, 'error'); }
  renderBasketManage(); renderBasketBar(); renderQuotes();
}

// ============================================================
// DUPLICATE — สร้างใบเสนอราคาใหม่จากใบเก่า (ลูกค้าซื้อซ้ำ) เลข QT ใหม่
// ============================================================
// ตัวย่อจากชื่อ-สกุล Sale (อักษรแรกของ 2 คำแรก) เช่น "Chalida Chinnakornphan" → "CC"
function _saleInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'XX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
// เลขที่ใบ: <initials><NN>-<MM>-<YYYY> — NN รันต่อเดือน (2 หลัก), ไม่นับ -RV
function _nextQuoteNo(saleName) {
  const _now = new Date();
  const mm = String(_now.getMonth() + 1).padStart(2, '0');
  const yyyy = _now.getFullYear();
  let _maxN = 0;
  quotesData.forEach(q => {
    const m = (q.Title || '').match(/(\d+)-(\d{2})-(\d{4})$/);   // ...NN-MM-YYYY (ท้ายสุด, ตัด -RV ออกอัตโนมัติ)
    if (m && m[2] === mm && String(m[3]) === String(yyyy)) _maxN = Math.max(_maxN, parseInt(m[1], 10));
  });
  return _saleInitials(saleName) + String(_maxN + 1).padStart(2, '0') + '-' + mm + '-' + yyyy;
}

async function duplicateQuote(id) {
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  const newNo = _nextQuoteNo(q.SaleName || currentUser?.displayName || '');
  if (!confirm('สร้างใบเสนอราคาใหม่ ' + newNo + '\nจากเนื้อหาของ ' + (q.Title||'') + ' (ลูกค้า: ' + (q.ClientName||'-') + ')?\n\nเลขที่จะเป็นใบใหม่ทั้งหมด แก้ไขได้ก่อนบันทึก')) return;

  toast('กำลังคัดลอกข้อมูล...', 'info');
  // โหลดรายการจากใบเดิม (เหมือน editQuote แต่ไม่ผูก spId เพราะจะสร้างใหม่)
  try {
    const allItems = await getListItems(CONFIG.lists.quoteItems);
    const items = allItems.filter(i => String(i.QuoteID) === String(id));
    const rowHs = getQuoteRowH(id) || [];
    const extra = getQuoteItemExtra(id) || [];
    quoteItems = items.map((it, idx) => {
      const rh = +rowHs[idx] || 0;
      const ex = extra[idx] || {};
      if ((it.Title||'').startsWith('__GROUP__:')) return { id: Date.now()+idx, type:'group', title: it.Title.slice(10), rowH: rh };
      if (it.Title === '__BLANK__')     return { id: Date.now()+idx, type:'blank', rowH: rh };
      if (it.Title === '__PAGEBREAK__') return { id: Date.now()+idx, type:'pagebreak' };
      if (it.Title === '__NOTE__')      return { id: Date.now()+idx, type:'note', text: it.Description || '' };
      return {
        id: Date.now()+idx, type:'item',
        no: ex.no || '', pn: ex.pn || '', name: it.Title || '', desc: it.Description || '',
        qty: it.Quantity || 1, unit: it.Unit || 'ชิ้น',
        price: (ex.price !== undefined && ex.price !== '') ? ex.price : (it.UnitPrice || 0),
        disc: it.DiscountPct || 0, rowH: rh, cost: +ex.cost||0, vendorId: ex.vendorId||'', asHeader: !!ex.asHeader
      };
    });
  } catch(e) { quoteItems = []; }
  if (quoteItems.length === 0) { addItem(); addItem(); }

  // คง editingQuoteId = id ไว้ก่อน เพื่อให้ showPage ไม่เรียก initNewQuote (ซึ่งจะล้าง quoteItems)
  editingQuoteId = id;
  showPage('newquote', null);

  setTimeout(() => {
    editingQuoteId = null;   // ★ เคลียร์ → ตอนกดบันทึกจะสร้างใบใหม่ ไม่ทับใบเดิม
    const _set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
    _set('q-no',    newNo);                                        // ★ เลขใหม่
    _set('q-date',  new Date().toISOString().split('T')[0]);        // วันที่วันนี้
    _set('q-client',       q.ClientName);
    _set('q-contact',      q.ContactPerson);
    _set('q-phone',        q.Phone);
    _set('q-email',        q.Email);
    _set('q-cust-address', q.CustomerAddress);
    _set('q-cust-taxid',   q.CustomerTaxID);
    _set('q-cust-tel',     q.CustomerTel);
    _set('q-cust-fax',     getQuoteFax(id));
    { const _en = getQuoteDocEN(id); _set('q-client-en', _en.nameEN); _set('q-cust-address-en', _en.addrEN); }
    _set('q-payment',      q.PaymentMethod || 'เงินสด');
    _set('q-validity',     getQuoteValidity(id) || '30 วัน');
    _set('q-tag',          q.Tag || getQuoteTag(id) || '');
    fillQuoteSourceOptions(getQuoteSource(id));
    updateAutoDates();
    _set('q-sale-name',  q.SaleName || currentUser?.displayName || '');
    _set('q-sale-tel',   q.SaleTel);
    _set('q-sale-email', q.SaleEmail || currentUser?.email || '');
    _set('q-note',  q.Note);
    _set('q-terms', q.Terms);

    const discEl = document.getElementById('g-disc');
    const discModeEl = document.getElementById('g-disc-mode');
    const savedDisc = getQuoteDisc(id);
    if (savedDisc) {
      if (discEl) discEl.value = savedDisc.value || 0;
      if (discModeEl) discModeEl.value = savedDisc.mode === 'amt' ? 'amt' : 'pct';
    } else {
      if (discEl) discEl.value = q.DiscountPct || 0;
      if (discModeEl) discModeEl.value = 'pct';
    }

    // ใบใหม่ — ไม่โชว์ edit-banner
    const editBanner = document.getElementById('edit-banner');
    if (editBanner) editBanner.style.display = 'none';

    document.getElementById('items-body').innerHTML = '';
    renderItems();
    updateApproverBox();
    applyZoneFonts(getQuoteZoneFonts(id));
    setColVisible(getQuoteCols(id));
    setRowSpacingState(getQuoteSpacing(id));
    initQuoteSignature();
    toast('คัดลอกเป็น ' + newNo + ' แล้ว — ตรวจสอบแล้วกดบันทึกได้เลย', 'success');
  }, 60);
}

// ============================================================
// SAVE QUOTE → SharePoint
// ============================================================
function cancelEdit() {
  editingQuoteId = null;
  const editBanner = document.getElementById('edit-banner');
  if (editBanner) editBanner.style.display = 'none';
  initNewQuote();
}

async function saveQuote(status) {
  if (!currentUser) { toast('กรุณา Login ก่อน', 'error'); return; }
  const t = calcTotals();
  const fields = {
    Title: document.getElementById('q-no').value,
    ClientName: document.getElementById('q-client').value || '(ไม่ระบุ)',
    ContactPerson: document.getElementById('q-contact').value,
    Phone: document.getElementById('q-phone').value,
    Email: document.getElementById('q-email').value,
    QuoteDate: document.getElementById('q-date').value,
    PaymentMethod: document.getElementById('q-payment').value,
    SubTotal: t.sub,
    // เก็บเป็น %-เทียบเท่าเสมอ (โหมด ฿ จะถูกแปลงเป็น %) เพื่อให้ PDF/การคำนวณเดิมถูกต้อง
    DiscountPct: t.sub > 0 ? +(t.discAmt / t.sub * 100).toFixed(8) : 0,
    TotalAmount: t.grand,
    Status: status,
    ApproverEmail: (getApproverForAmount(t.grand)||{}).approverEmail||'',
    ApproverName: (getApproverForAmount(t.grand)||{}).approverName||'',
    Note: document.getElementById('q-note').value,
    Terms: document.getElementById('q-terms').value,
    SaleName: document.getElementById('q-sale-name').value||'',
    SaleTel: document.getElementById('q-sale-tel').value||'',
    SaleEmail: document.getElementById('q-sale-email').value||'',
    CustomerAddress: document.getElementById('q-cust-address').value||'',
    CustomerTaxID: document.getElementById('q-cust-taxid').value||'',
    CustomerTel: document.getElementById('q-cust-tel').value||'',
    ContractStartDate: document.getElementById('q-start').value||null,
    ContractEndDate: document.getElementById('q-end').value||null
  };
  // บันทึกข้อมูล Sale ลง localStorage เพื่อใช้ครั้งต่อไป
  try { localStorage.setItem('sale_info_' + (currentUser?.email||''), JSON.stringify({
    name:  document.getElementById('q-sale-name').value||'',
    tel:   document.getElementById('q-sale-tel').value||'',
    email: document.getElementById('q-sale-email').value||''
  })); } catch(e) {}
  // จำ หมายเหตุ/เงื่อนไข เป็นค่าเริ่มต้นของ user → ใบถัดไปดึงมาอัตโนมัติ (Settings = ถาวร/ข้ามเครื่อง + localStorage = cache)
  try {
    const _em = currentUser?.email || '';
    const _n = document.getElementById('q-note').value || '';
    const _t = document.getElementById('q-terms').value || '';
    localStorage.setItem('note_default_' + _em, _n);
    localStorage.setItem('terms_default_' + _em, _t);
    saveQuoteDefaults(_n, _t);   // เก็บถาวรใน SharePoint (async, ไม่บล็อก)
  } catch(e) {}

  try {
    toast('กำลังบันทึก...', 'info');
    let quoteId;
    if (editingQuoteId) {
      // UPDATE existing quote
      try {
        await updateListItem(CONFIG.lists.quotations, editingQuoteId, fields);
        quoteId = editingQuoteId;
      } catch(e) {
        // ใบเดิมไม่พบใน SharePoint (ถูกลบ/cache ค้าง) → สร้างใหม่แทน ไม่ให้ save พังทั้งใบ
        if (/itemNotFound|404|not found/i.test(e.message || '')) {
          const created = await createListItem(CONFIG.lists.quotations, fields);
          quoteId = created.id;
          // ลบอ้างอิงใบเดิมออกจาก cache
          const _i = quotesData.findIndex(x => String(x.id) === String(editingQuoteId));
          if (_i >= 0) quotesData.splice(_i, 1);
          editingQuoteId = null;
          toast('ไม่พบใบเดิม — สร้างใบใหม่ให้แทน', 'info');
        } else { throw e; }
      }
      // Delete old line items and re-create (bulk delete by QuoteID)
      await deleteWhere(CONFIG.lists.quoteItems, 'QuoteID', quoteId);
    } else {
      // CREATE new quote
      const created = await createListItem(CONFIG.lists.quotations, fields);
      quoteId = created.id;
    }
    // Save line items — build itemExtra (pn + ราคาดิบ) ขนานกับแถวที่ถูกบันทึกจริง เพื่อ index ตรงกันตอนโหลด
    const itemExtra = [];
    for (const it of quoteItems) {
      if (it.type === 'group') {
        await createListItem(CONFIG.lists.quoteItems, {
          Title: '__GROUP__:' + (it.title||''), QuoteID: quoteId,
          Quantity: 0, Unit: '', UnitPrice: 0, DiscountPct: 0, LineTotal: 0, Description: '__GROUP__'
        });
        itemExtra.push({});
      } else if (it.type === 'blank') {
        await createListItem(CONFIG.lists.quoteItems, {
          Title: '__BLANK__', QuoteID: quoteId,
          Quantity: 0, Unit: '', UnitPrice: 0, DiscountPct: 0, LineTotal: 0, Description: '__BLANK__'
        });
        itemExtra.push({});
      } else if (it.type === 'pagebreak') {
        await createListItem(CONFIG.lists.quoteItems, {
          Title: '__PAGEBREAK__', QuoteID: quoteId,
          Quantity: 0, Unit: '', UnitPrice: 0, DiscountPct: 0, LineTotal: 0, Description: '__PAGEBREAK__'
        });
        itemExtra.push({});
      } else if (it.type === 'note') {
        await createListItem(CONFIG.lists.quoteItems, {
          Title: '__NOTE__', QuoteID: quoteId,
          Quantity: 0, Unit: '', UnitPrice: 0, DiscountPct: 0, LineTotal: 0, Description: it.text||''
        });
        itemExtra.push({});
      } else {
        if (!it.name) continue;
        await createListItem(CONFIG.lists.quoteItems, {
          Title: it.name, QuoteID: quoteId, Quantity: it.qty,
          Unit: it.unit, UnitPrice: priceNum(it), DiscountPct: it.disc, LineTotal: lineTotal(it),
          Description: it.desc||''
        });
        // เก็บ No. + Part No. + ราคาดิบ + ต้นทุน/Vendor (สำหรับยาม "ลดต่ำกว่าทุน")
        itemExtra.push({ no: it.no||'', pn: it.pn||'', price: String(it.price ?? ''), cost: +it.cost||0, vendorId: it.vendorId||'', asHeader: !!it.asHeader });
      }
    }
    await saveQuoteItemExtra(quoteId, itemExtra);
    // บันทึกขนาดฟอนต์ 4 zone + อายุใบเสนอราคา ของใบนี้ (รายใบ)
    await saveQuoteZoneFonts(quoteId);
    await saveQuoteValidity(quoteId, document.getElementById('q-validity').value || '');
    const _tagVal = (document.getElementById('q-tag')?.value || '').trim();
    await saveQuoteTag(quoteId, _tagVal);
    await saveQuoteSource(quoteId, document.getElementById('q-source')?.value || '');
    await saveQuoteFax(quoteId, document.getElementById('q-cust-fax')?.value || '');
    await saveQuoteDocEN(quoteId, document.getElementById('q-client-en')?.value || '', document.getElementById('q-cust-address-en')?.value || '');
    await saveQuoteDisc(quoteId);
    await saveQuoteCols(quoteId);
    await saveQuoteRowH(quoteId);
    await saveQuoteSpacing(quoteId);
    // อัปเดต local cache แทน syncAll ทั้งก้อน
    const savedId = quoteId;
    _lastSavedQuoteId = savedId;
    const existIdx = quotesData.findIndex(x => x.id === savedId);
    const fullObj = { ...fields, Tag: _tagVal, id: savedId, ID: savedId, CreatedBy: currentUser?.email||'', CreatedAt: new Date().toISOString(), UpdatedAt: new Date().toISOString() };
    if (existIdx >= 0) { quotesData[existIdx] = { ...quotesData[existIdx], ...fields, Tag: _tagVal, UpdatedAt: new Date().toISOString() }; }
    else { quotesData.push(fullObj); }
    renderDash(); renderQuotes(); renderApprove(); updateBadge();
    // เพิ่มลูกค้าเข้า CRM อัตโนมัติ ถ้ายังไม่มี (ไม่ทับข้อมูลเดิม)
    if (typeof autoAddCustomerFromQuote === 'function') { autoAddCustomerFromQuote(fields, document.getElementById('q-cust-fax')?.value || '').catch(()=>{}); }
    editingQuoteId = null;
    const editBanner = document.getElementById('edit-banner');
    if (editBanner) editBanner.style.display = 'none';
    toast(`บันทึก ${fields.Title} สำเร็จ${status==='Pending'?' — ส่งอนุมัติแล้ว':''}`, 'success');
    // ส่ง Email แจ้ง Approver เมื่อส่งอนุมัติ
    if (status === 'Pending') {
      const newQ = quotesData.find(x => x.id === quoteId) || { ...fields, id: quoteId };
      let att = null;
      try {
        if (typeof currentQuotePDFAttachment === 'function') att = await currentQuotePDFAttachment();
      } catch(e) { console.warn('สร้าง PDF แนบเมลไม่สำเร็จ (ส่งเมลแบบไม่มีไฟล์แนบแทน):', e.message); }
      sendApprovalRequestEmail(newQ, att).catch(e => console.warn('Approval email failed:', e.message));
    }
    showPage('quotes', null);
  } catch(e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
  }
}

