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
function catExtra(id) { return catalogExtra[id] || {}; }

function renderCatalog() {
  const q = (document.getElementById('cat-search')?.value || '').toLowerCase();
  const cat = document.getElementById('cat-filter')?.value || '';
  const filtered = catalogData.filter(p =>
    (p.Title||'').toLowerCase().includes(q) || (p.SKU||'').toLowerCase().includes(q)
  ).filter(p => !cat || p.Category === cat);

  document.getElementById('cat-grid').innerHTML = filtered.length ? filtered.map(p => {
    const ex = catExtra(p.id);
    const cost = +ex.cost || 0;
    const vd = (typeof getVendorById === 'function' && ex.vendorId) ? getVendorById(ex.vendorId) : null;
    const margin = (p.Price||0) - cost;
    return `
    <div class="cat-card">
      <div class="name">${escHtml(p.Title||'')}</div>
      <div class="sku">${escHtml(ex.pn||p.SKU||'')}</div>
      <div class="price">${fmt(p.Price||0)} <span style="font-size:11px;color:var(--muted);font-weight:400">/${p.Unit||''}</span></div>
      ${cost>0?`<div style="font-size:11px;color:var(--muted);margin-top:2px">ทุน ${fmt(cost)} · กำไร <span style="color:${margin>=0?'var(--green)':'var(--red)'}">${fmt(margin)}</span></div>`:''}
      ${vd?`<div style="font-size:11px;color:var(--accent2);margin-top:2px">🏢 ${escHtml(vd.name)}</div>`:''}
      ${ex.pdoc?`<div style="font-size:11px;margin-top:2px"><a href="${ex.pdoc.url}" target="_blank" rel="noopener" style="color:var(--accent2);text-decoration:none">📄 เอกสารซื้อ</a></div>`:''}
      <div style="display:flex;align-items:center;margin-top:8px;gap:6px">
        <span class="cat-tag">${p.Category||''}</span>
      </div>
    </div>`; }).join('') : '<div class="empty" style="grid-column:1/-1">ไม่พบสินค้า</div>';
}

function renderModalCatalog() {
  const q = (document.getElementById('cat-modal-search')?.value || '').toLowerCase();
  const filtered = catalogData.filter(p => (p.Title||'').toLowerCase().includes(q) || (p.SKU||'').toLowerCase().includes(q));
  document.getElementById('cat-modal-grid').innerHTML = filtered.map(p => `
    <div class="cat-card" onclick="addFromCatalog('${p.id}')">
      <div class="name">${escHtml(p.Title||'')}</div>
      <div class="sku">${p.SKU||''}</div>
      <div class="price">${fmt(p.Price||0)} <span style="font-size:11px;color:var(--muted)">/${p.Unit||''}</span></div>
      <span class="cat-tag">${p.Category||''}</span>
    </div>`).join('') || '<div style="text-align:center;color:var(--muted);padding:20px;grid-column:1/-1">ไม่พบสินค้า</div>';
}

function openCatalogPicker() { renderModalCatalog(); openModal('catalog-modal'); }

function addFromCatalog(id) {
  const p = catalogData.find(c => c.id === id);
  if (!p) return;
  const ex = catExtra(id);
  // แนบข้อมูลเสริมไปกับ item ในใบเสนอราคา (ต้นทุน/Part No. — สำหรับเฟส 3 ยาม "ลดต่ำกว่าทุน")
  addItem({ ...p, PartNumber: ex.pn || p.SKU || '', Cost: +ex.cost || 0, VendorId: ex.vendorId || '' });
  closeModal('catalog-modal');
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
        <a href="${_npPDoc.url}" target="_blank" rel="noopener" style="color:var(--accent2);text-decoration:none;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📄 ${escHtml(_npPDoc.name)}</a>
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
  ['np-name','np-sku','np-pn','np-cost','np-price','np-unit','np-desc'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
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
  document.getElementById('np-pdoc-status').textContent = '';
  if (typeof loadVendors === 'function' && !vendorsLoaded) { try { await loadVendors(); } catch(e){} }
  _fillVendorSelect(ex.vendorId || '');
  updateProductMargin(); renderProductDoc();
  openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('np-name').value;
  const price = +document.getElementById('np-price').value;
  if (!name || !price) { toast('กรุณากรอกชื่อสินค้าและราคาขาย', 'error'); return; }
  const fields = {
    Title: name, SKU: document.getElementById('np-sku').value,
    Price: price, Unit: document.getElementById('np-unit').value,
    Category: document.getElementById('np-cat').value,
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

