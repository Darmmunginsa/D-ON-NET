// ============================================================
// CATALOG
// ============================================================
// ── ข้อมูลเสริมรายสินค้า (ต้นทุน/Vendor/Part No./เอกสารซื้อ) เก็บใน Settings: CatalogExtra = { [id]: {cost, vendorId, pn, pdoc:{name,url,ts}} } ──
let catalogExtra = {};
let catalogExtraLoaded = false;
let _npPDoc = null;   // เอกสารซื้อที่กำลังแก้ใน modal

async function loadCatalogExtra() {
  if (catalogExtraLoaded) return;
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const it = items.find(i => i.Title === 'CatalogExtra');
    catalogExtra = (it && it.Value) ? (JSON.parse(it.Value) || {}) : {};
  } catch(e) { catalogExtra = {}; }
  catalogExtraLoaded = true;
}
async function saveCatalogExtra() {
  await saveSettingItem('CatalogExtra', JSON.stringify(catalogExtra));   // → ProcurementData list
}
function catExtra(id) { return CatalogPolicy.extra(catalogData.find(p=>String(p.id)===String(id)),catalogExtra[id]); }

// ── ส่งสินค้าเข้าพิจารณานำเข้า Catalog (รอจัดซื้ออนุมัติที่ PurchasePro) ──
// เก็บใน Settings: CatalogPending = [ {name,pn,unit,price,cost,vendorId,desc,by...} ]
function _getCatalogPending() {
  try { const it = (_settingsCache || []).find(i => i.Title === 'CatalogPending'); return (it && it.Value) ? (JSON.parse(it.Value) || []) : []; }
  catch(e) { return []; }
}
async function _saveCatalogPending(arr) { await saveSettingItem('CatalogPending', JSON.stringify(arr || [])); }
// รายการนี้มีใน Catalog แล้ว / รอพิจารณาอยู่แล้ว หรือไม่
function _itemCatalogState(it) {
  const nm = (it && it.name || '').trim().toLowerCase();
  if (!nm) return '';
  if ((catalogData || []).some(c => (c.Title || '').trim().toLowerCase() === nm)) return 'in';
  if (_getCatalogPending().some(p => (p.name || '').trim().toLowerCase() === nm)) return 'pending';
  return '';
}
async function sendItemToCatalogReview(itemId) {
  const it = (typeof quoteItems !== 'undefined' ? quoteItems : []).find(x => x.id == itemId);
  if (!it || it.type !== 'item' || !(it.name || '').trim()) { toast('ใส่ชื่อรายการก่อน', 'error'); return; }
  const nm = (it.name || '').trim().toLowerCase();
  if ((catalogData || []).some(c => (c.Title || '').trim().toLowerCase() === nm)) { toast('มีสินค้านี้ใน Catalog อยู่แล้ว', 'info'); return; }
  const pend = _getCatalogPending();
  if (pend.some(p => (p.name || '').trim().toLowerCase() === nm)) { toast('รายการนี้รอพิจารณาอยู่แล้ว', 'info'); return; }
  const priceNum = (isNumeric(it.price) ? +it.price : 0);
  pend.push({
    id: 'CP' + Date.now() + Math.floor(Math.random() * 1000),
    name: it.name || '', pn: it.pn || '', unit: it.unit || '', price: priceNum, cost: +it.cost || 0,
    vendorId: it.vendorId || '', desc: it.desc || '', category: '',
    byName: (currentUser && currentUser.displayName) || '', byEmail: (currentUser && currentUser.email) || '',
    quoteId: String(editingQuoteId || ''), quoteTitle: (document.getElementById('q-no')?.value || ''),
    client: (document.getElementById('q-client')?.value || ''), ts: new Date().toISOString()
  });
  try { await _saveCatalogPending(pend); toast('ส่งเข้าพิจารณานำเข้า Catalog แล้ว — รอจัดซื้ออนุมัติที่ PurchasePro', 'success'); if (typeof renderItems === 'function') renderItems(); }
  catch(e) { toast('ส่งไม่สำเร็จ: ' + e.message, 'error'); }
}

function renderCatalog() {
  CatalogBaskets.toolbar();
  const q = (document.getElementById('cat-search')?.value || '').toLowerCase();
  const cat = document.getElementById('cat-filter')?.value || '';
  const filtered = CatalogBaskets.filter(catalogData).filter(p =>
    (p.Title||'').toLowerCase().includes(q) || (p.SKU||'').toLowerCase().includes(q)
  ).filter(p => !cat || p.Category === cat);

  document.getElementById('cat-grid').innerHTML = filtered.length ? filtered.map(p => {
    const ex = catExtra(p.id);
    const cost = +ex.cost || 0;
    const vd = (typeof getVendorById === 'function' && ex.vendorId) ? getVendorById(ex.vendorId) : null;
    const margin = (p.Price||0) - cost;
    return `
    <div class="cat-card" draggable="true" data-catalog-product="${escHtml(p.id)}">
      <div class="name">${escHtml(p.Title||'')}</div>
      <div class="sku">${escHtml(ex.pn||p.SKU||'')}</div>
      <div class="price">${CatalogPolicy.sellable(p)?fmt(p.Price):'Draft · ยังไม่มีราคาขาย'} <span style="font-size:11px;color:var(--muted);font-weight:400">/${p.Unit||''}</span></div>
      ${cost>0&&CatalogPolicy.sellable(p)?`<div style="font-size:11px;color:var(--muted);margin-top:2px">ทุน ${fmt(cost)} · กำไร <span style="color:${margin>=0?'var(--green)':'var(--red)'}">${fmt(margin)}</span></div>`:''}
      ${vd?`<div style="font-size:11px;color:var(--accent2);margin-top:2px">🏢 ${escHtml(vd.name)}</div>`:''}
      ${ex.pdoc?`<div style="margin-top:4px">${docThumb(ex.pdoc.url, ex.pdoc.name||'เอกสารซื้อ', {small:true})}</div>`:''}
      <div style="display:flex;align-items:center;margin-top:8px;gap:6px">
        <span class="cat-tag">${p.Category||''}</span>
      </div>
      <div style="margin-top:10px">${CatalogBaskets.control(String(p.id))}</div>
    </div>`; }).join('') : '<div class="empty" style="grid-column:1/-1">ไม่พบสินค้า</div>';
  if(document.getElementById('catalog-modal')?.hidden===false)renderModalCatalog();
}

function renderModalCatalog() {
  const q = (document.getElementById('cat-modal-search')?.value || '').toLowerCase();
  const category = document.getElementById('cat-drawer-category')?.value || '';
  const filtered = catalogData.filter(p => [p.Title,p.SKU,catExtra(p.id).pn,p.Description].some(v=>String(v||'').toLowerCase().includes(q))).filter(p=>!category||p.Category===category);
  document.getElementById('cat-modal-grid').innerHTML = filtered.map(p => {
    const ex=catExtra(p.id),sellable=CatalogPolicy.sellable(p),cost=Number(ex.cost);
    return `<article class="cat-card">
      <div class="name">${escHtml(p.Title||'')}</div>
      <div class="sku">${escHtml(ex.pn||p.SKU||'')}</div>
      <div class="price">${sellable?'ราคาขาย '+fmt(p.Price)+' บาท':'Draft · ยังไม่มีราคาขาย'}</div>
      <p class="catalog-reference-cost">ต้นทุน ${Number.isFinite(cost)&&cost>0?fmt(cost)+' บาท':'ยังไม่ระบุ'} / ${escHtml(p.Unit||'หน่วย')}</p>
      <span class="cat-tag">${escHtml(p.Category||'')}</span>
      ${p.Description?`<p class="catalog-reference-description">${escHtml(p.Description)}</p>`:''}
      <button type="button" class="btn btn-sm" data-catalog-add="${escHtml(String(p.id))}" ${sellable?'':'disabled'}>${sellable?'＋ เพิ่มเข้าใบเสนอราคา':'ยังเพิ่มไม่ได้ · รอกำหนดราคาขาย'}</button>
    </article>`;
  }).join('') || '<p class="catalog-reference-empty">ไม่พบสินค้า ลองเปลี่ยนคำค้นหรือหมวดหมู่</p>';
  document.getElementById('cat-drawer-count').textContent=filtered.length+' / '+catalogData.length+' รายการ';
}

let _catalogDrawerReturnFocus=null;
async function openCatalogPicker() {
  _catalogDrawerReturnFocus=document.activeElement;
  document.body.classList.add('quote-catalog-open');
  const drawer=document.getElementById('catalog-modal');drawer.hidden=false;
  document.getElementById('catalog-drawer-tab').setAttribute('aria-expanded','true');
  document.getElementById('cat-drawer-feedback').textContent='';
  renderModalCatalog();document.getElementById('cat-modal-search').focus();
  await loadCatalogExtra();
  if(!drawer.hidden)renderModalCatalog();
}
function closeCatalogDrawer(restoreFocus=true) {
  document.body.classList.remove('quote-catalog-open');
  const drawer=document.getElementById('catalog-modal');if(drawer)drawer.hidden=true;
  document.getElementById('catalog-drawer-tab')?.setAttribute('aria-expanded','false');
  if(restoreFocus&&_catalogDrawerReturnFocus?.isConnected)_catalogDrawerReturnFocus.focus();
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('catalog-modal')?.hidden){closeCatalogDrawer();}});
document.addEventListener('click',event=>{const button=event.target.closest('[data-catalog-add]');if(button)addFromCatalog(button.dataset.catalogAdd);});

function addFromCatalog(id) {
  const p = catalogData.find(c => String(c.id) === String(id));
  if (!p || !CatalogPolicy.sellable(p)) return;
  const ex = catExtra(id);
  // แนบข้อมูลเสริมไปกับ item ในใบเสนอราคา (ต้นทุน/Part No. — สำหรับเฟส 3 ยาม "ลดต่ำกว่าทุน")
  addItem({ ...p, PartNumber: ex.pn || p.SKU || '', Cost: +ex.cost || 0, VendorId: ex.vendorId || '' });
  document.getElementById('cat-drawer-feedback').textContent='เพิ่ม '+p.Title+' เข้าใบเสนอราคาแล้ว';
}

function updateProductMargin() {
  const cost = +document.getElementById('np-cost').value || 0;
  const sell = +document.getElementById('np-price').value || 0;
  const el = document.getElementById('np-margin');
  if (!el) return;
  if (!cost && !sell) { el.textContent = ''; return; }
  const m = sell - cost;
  const pct = cost > 0 ? (m / cost * 100) : 0;
  el.innerHTML = `กำไรขั้นต้น: <strong style="color:${m>=0?'var(--green)':'var(--red)'}">${fmt(m)}</strong>` + (cost>0?` (${pct.toFixed(1)}%)`:'') + (m<0?' ⚠ ขายต่ำกว่าทุน':'');
}

function renderProductDoc() {
  const wrap = document.getElementById('np-pdoc');
  if (!wrap) return;
  wrap.innerHTML = _npPDoc
    ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px">
        <span style="flex:1;min-width:0">${docThumb(_npPDoc.url, _npPDoc.name, {small:true})}</span>
        <button class="action-btn" onclick="_npPDoc=null;renderProductDoc()" style="color:var(--red)" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>` : '<div style="font-size:11px;color:var(--muted)">ยังไม่มีเอกสารแนบ</div>';
}
async function uploadProductDoc(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const st = document.getElementById('np-pdoc-status');
  try {
    if (st) st.textContent = 'กำลังอัปโหลด...';
    const b64 = await fileToBase64(f);
    const res = await _uploadFileGraph('CatalogDocs', 'CAT_' + Date.now() + '_' + f.name, f.type || 'application/octet-stream', String(b64).split(',')[1] || '');
    if (!res.fileUrl) throw new Error('เซิร์ฟเวอร์ไม่ส่ง URL กลับมา');
    _npPDoc = { name: f.name, url: res.fileUrl, ts: new Date().toISOString() };
    if (st) st.textContent = '✓ แนบแล้ว'; input.value = '';
    renderProductDoc();
  } catch(e) { if (st) st.textContent = ''; alert('⚠ แนบเอกสารไม่สำเร็จ\n\nเหตุผล: ' + (e.message||'ไม่ทราบสาเหตุ')); }
}

function _fillVendorSelect(selectedId) {
  const sel = document.getElementById('np-vendor');
  if (sel) sel.innerHTML = (typeof vendorOptionsHTML === 'function') ? vendorOptionsHTML(selectedId) : '<option value="">– (ยังไม่มี Vendor) –</option>';
}

async function openAddProduct() {
  editingProductId = null;
  _npPDoc = null;
  document.getElementById('pm-title').textContent = 'เพิ่มสินค้าใหม่';
  ['np-name','np-sku','np-pn','np-cost','np-price','np-unit','np-desc','np-internal-notes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('np-pdoc-status').textContent = '';
  if (typeof loadVendors === 'function' && !vendorsLoaded) { try { await loadVendors(); } catch(e){} }
  _fillVendorSelect('');
  updateProductMargin(); renderProductDoc();
  openModal('product-modal');
}

async function editProduct(id) {
  const p = catalogData.find(c => c.id === id);
  if (!p) return;
  editingProductId = id;
  const ex = catExtra(id);
  _npPDoc = ex.pdoc || null;
  document.getElementById('pm-title').textContent = 'แก้ไขสินค้า';
  document.getElementById('np-name').value = p.Title || '';
  document.getElementById('np-sku').value = p.SKU || '';
  document.getElementById('np-pn').value = ex.pn || '';
  document.getElementById('np-cost').value = ex.cost || '';
  document.getElementById('np-price').value = p.Price || '';
  document.getElementById('np-unit').value = p.Unit || '';
  document.getElementById('np-cat').value = p.Category || 'Hardware';
  document.getElementById('np-desc').value = p.Description || '';
  document.getElementById('np-internal-notes').value = p.InternalNotes || '';
  document.getElementById('np-pdoc-status').textContent = '';
  if (typeof loadVendors === 'function' && !vendorsLoaded) { try { await loadVendors(); } catch(e){} }
  _fillVendorSelect(ex.vendorId || '');
  updateProductMargin(); renderProductDoc();
  openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('np-name').value;
  const priceText=document.getElementById('np-price').value.trim(),price=Number(priceText);
  if(!name.trim()||(priceText!==''&&(!Number.isFinite(price)||price<=0))){toast('กรอกชื่อสินค้าและราคาขายมากกว่า 0 หรือเว้นราคาเพื่อเก็บเป็น Draft','error');return;}
  const fields = {
    Title: name, SKU: document.getElementById('np-sku').value,
    Price: priceText===''?'':price, CatalogStatus:priceText===''?'Draft':'Active', Unit: document.getElementById('np-unit').value,
    Category: document.getElementById('np-cat').value,
    InternalNotes:document.getElementById('np-internal-notes').value.trim(),
    Description: document.getElementById('np-desc').value
  };
  const extra = {
    cost: +document.getElementById('np-cost').value || 0,
    vendorId: document.getElementById('np-vendor').value || '',
    pn: document.getElementById('np-pn').value || '',
    pdoc: _npPDoc || null
  };
  try {
    toast('กำลังบันทึก...', 'info');
    let pid = editingProductId;
    if (editingProductId) {
      await updateListItem(CONFIG.lists.catalog, editingProductId, fields);
    } else {
      const c = await createListItem(CONFIG.lists.catalog, fields);
      pid = c.id;
    }
    // เก็บข้อมูลเสริมใน Settings (ต้นทุน/Vendor/Part No./เอกสารซื้อ)
    catalogExtra[pid] = extra;
    await saveCatalogExtra();
    closeModal('product-modal');
    toast('บันทึกสินค้าสำเร็จ', 'success');
    catalogData = await getListItems(CONFIG.lists.catalog);
    renderCatalog();
  } catch(e) { toast('ไม่สำเร็จ: ' + e.message, 'error'); }
}

async function deleteProduct(id) {
  if (!confirm('ลบสินค้านี้?')) return;
  try {
    await deleteListItem(CONFIG.lists.catalog, id);
    catalogData = catalogData.filter(c => c.id !== id);
    renderCatalog();
    toast('ลบสินค้าแล้ว', 'success');
  } catch(e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error'); }
}

