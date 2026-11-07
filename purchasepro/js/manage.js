// ============================================================
// PurchasePro — จัดการ Vendor + Catalog (ย้ายมาจาก SalePro)
// ใช้ SharePoint เดียวกัน: Vendors (Settings), Catalog (list), CatalogExtra (Settings)
// อาศัย global จาก app.js: esc, fmt, toast, openModal, closeModal, putSetting,
//   _settingsCache, vendorsData, getVendorById, vendorOptions, uploadFile, fileToBase64, currentUser
// ============================================================
let catalogData = [];
let catalogExtra = {};
let editingProductId = null;
let _npPDoc = null;
let editingVendorId = null;
let _vdContracts = [];

// ── โหลดข้อมูล ──
async function loadCatalogData(){
  try{ catalogData = await getListItems(CONFIG.lists.catalog); }catch(e){ catalogData=[]; }
  const it=(_settingsCache||[]).find(i=>i.Title==='CatalogExtra');
  catalogExtra=(it&&it.Value)?(JSON.parse(it.Value)||{}):{};
}
async function saveCatalogExtra(){ await putSetting('CatalogExtra', JSON.stringify(catalogExtra)); }
function catExtra(id){ return CatalogPolicy.extra(catalogData.find(p=>p.id===id),catalogExtra[id]); }
async function saveVendorsStore(){ await putSetting('Vendors', JSON.stringify(vendorsData)); }

// ════════ CATALOG ════════
// ── พิจารณานำเข้า Catalog — รายการที่ Sale ส่งมาจาก SalePro (+C) ──
function _getCatalogPending(){
  try{ const it=(_settingsCache||[]).find(i=>i.Title==='CatalogPending'); return (it&&it.Value)?(JSON.parse(it.Value)||[]):[]; }catch(e){ return []; }
}
async function _saveCatalogPending(arr){ await putSetting('CatalogPending', JSON.stringify(arr||[])); }
function _catPendingBadge(){
  const n=_getCatalogPending().length; const el=document.getElementById('cat-pending-navcount');
  if(el) el.innerHTML = n ? (' <span style="background:var(--amber);color:#1a1a2e;font-size:10px;font-weight:700;border-radius:9px;padding:1px 7px">'+n+'</span>') : '';
}
function renderCatalogPending(){
  _catPendingBadge();
  const card=document.getElementById('cat-pending-card'); if(!card) return;
  const pend=_getCatalogPending();
  if(!pend.length){ card.style.display='none'; card.innerHTML=''; return; }
  card.style.display='block';
  const rows=pend.map(p=>{
    const margin=(+p.price||0)-(+p.cost||0);
    return `<tr>
      <td style="font-family:var(--mono);font-size:11px">${esc(p.pn||'')}</td>
      <td style="font-weight:500">${esc(p.name||'')}${p.desc?`<div style="font-size:11px;color:var(--muted)">${esc(p.desc)}</div>`:''}</td>
      <td style="text-align:center">${esc(p.unit||'')}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmt(p.cost||0)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmt(p.price||0)}</td>
      <td style="text-align:right;font-family:var(--mono);color:${margin>=0?'var(--green)':'var(--red)'}">${fmt(margin)}</td>
      <td style="font-size:11px;color:var(--muted)">${esc(p.byName||p.byEmail||'')}${p.quoteTitle?`<div>${esc(p.quoteTitle)}${p.client?(' · '+esc(p.client)):''}</div>`:''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-primary" onclick="approveCatalogPending('${p.id}')">✓ นำเข้า</button>
        <button class="btn btn-sm" onclick="rejectCatalogPending('${p.id}')" style="color:var(--red)">✕</button>
      </td></tr>`;
  }).join('');
  card.innerHTML='<div class="card" style="border:1px solid var(--amber);margin-bottom:16px">'
    +'<div class="card-head" style="background:rgba(245,158,11,.08)">📥 พิจารณานำเข้า Catalog — จาก Sale ('+pend.length+')</div>'
    +'<div style="padding:4px 0"><table><thead><tr><th>Part No.</th><th>ชื่อสินค้า</th><th>หน่วย</th><th style="text-align:right">ทุน</th><th style="text-align:right">ขาย</th><th style="text-align:right">กำไร</th><th>ส่งโดย</th><th></th></tr></thead>'
    +'<tbody>'+rows+'</tbody></table></div></div>';
}
async function approveCatalogPending(id){
  const pend=_getCatalogPending(); const p=pend.find(x=>x.id===id); if(!p){ renderCatalogPending(); return; }
  const nm=(p.name||'').trim().toLowerCase();
  if((catalogData||[]).some(c=>(c.Title||'').trim().toLowerCase()===nm)){
    if(!confirm('มีสินค้าชื่อนี้ใน Catalog อยู่แล้ว — ยังต้องการเพิ่มซ้ำไหม?')){ return; }
  }
  try{
    toast('กำลังนำเข้า...','info');
    const c=await createListItem(CONFIG.lists.catalog,{Title:p.name||'',Unit:p.unit||'',Price:+p.price||0,CatalogStatus:'Active',Category:p.category||'Hardware',Description:p.desc||''});
    catalogExtra[c.id]={cost:+p.cost||0,vendorId:p.vendorId||'',pn:p.pn||'',pdoc:null};
    await saveCatalogExtra();
    const rest=_getCatalogPending().filter(x=>x.id!==id);
    await _saveCatalogPending(rest);
    await loadCatalogData(); renderCatalog(); renderCatalogPending();
    if(typeof logActivity==='function') logActivity('นำเข้า Catalog', p.name||'', 'จาก Sale: '+(p.byName||p.byEmail||''));
    toast('นำเข้า "'+(p.name||'')+'" เข้า Catalog แล้ว','success');
  }catch(e){ toast('นำเข้าไม่สำเร็จ: '+e.message,'error'); }
}
async function rejectCatalogPending(id){
  const p=_getCatalogPending().find(x=>x.id===id);
  if(!confirm('ไม่นำเข้า "'+(p?p.name:'')+'" และลบออกจากรายการพิจารณา?')) return;
  try{ const rest=_getCatalogPending().filter(x=>x.id!==id); await _saveCatalogPending(rest); renderCatalogPending(); toast('ลบออกจากรายการพิจารณาแล้ว','success'); }
  catch(e){ toast('ไม่สำเร็จ: '+e.message,'error'); }
}

async function loadCatalogAndRender(){ await loadCatalogData(); renderCatalog(); if(typeof renderCatalogPending==='function') renderCatalogPending(); }
function renderCatalog(){
  CatalogBaskets.toolbar();
  const body=document.getElementById('catalog-body'); if(!body)return;
  const q=(document.getElementById('cat-search')?.value||'').toLowerCase();
  const list=CatalogBaskets.filter(catalogData).filter(p=>!q||(p.Title||'').toLowerCase().includes(q)||(p.SKU||'').toLowerCase().includes(q));
  body.innerHTML = list.length ? list.map(p=>{
    const ex=catExtra(p.id), cost=+ex.cost||0, margin=(+p.Price||0)-cost, vd=ex.vendorId?getVendorById(ex.vendorId):null;
    return `<tr draggable="true" data-catalog-product="${esc(p.id)}">
      <td style="font-family:var(--mono);font-size:11px">${esc(ex.pn||p.SKU||'')}</td>
      <td style="font-weight:500">${esc(p.Title||'')}${ex.pdoc?` <a href="${ex.pdoc.url}" target="_blank" title="เอกสารซื้อ">📄</a>`:''}</td>
      <td>${esc(p.Category||'')}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmt(cost)}</td>
      <td style="text-align:right;font-family:var(--mono)">${CatalogPolicy.sellable(p)?fmt(p.Price):'Draft · ยังไม่มีราคา'}</td>
      <td style="text-align:right;font-family:var(--mono);color:${margin>=0?'var(--green)':'var(--red)'}">${CatalogPolicy.sellable(p)?fmt(margin):'—'}</td>
      <td>${vd?esc(vd.name):'<span style="color:var(--muted)">—</span>'}</td>
      <td>${CatalogBaskets.control(String(p.id))}</td><td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="editProduct('${p.id}')">แก้</button>
        <button class="btn btn-sm" onclick="deleteProduct('${p.id}')" style="color:var(--red)">ลบ</button>
      </td></tr>`;
  }).join('') : '<tr><td colspan=9 style="text-align:center;padding:28px;color:var(--muted)">ยังไม่มีสินค้า — กด "เพิ่มสินค้า"</td></tr>';
}
function updateProductMargin(){
  const cost=+document.getElementById('np-cost')?.value||0, price=+document.getElementById('np-price')?.value||0;
  const el=document.getElementById('np-margin'); if(!el)return;
  const m=price-cost, pct=cost>0?(m/cost*100):0;
  el.innerHTML=price?`กำไรขั้นต้น: <span style="color:${m>=0?'var(--green)':'var(--red)'}">${fmt(m)}${cost>0?` (${pct.toFixed(1)}%)`:''}</span>`:'';
}
function renderProductDoc(){
  const w=document.getElementById('np-pdoc'); if(!w)return;
  w.innerHTML=_npPDoc?`<div style="display:flex;gap:6px;align-items:center;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px"><a href="${_npPDoc.url}" target="_blank" style="flex:1;color:var(--accent2)">📄 ${esc(_npPDoc.name)}</a><button class="btn btn-sm" onclick="_npPDoc=null;renderProductDoc()" style="color:var(--red)">✕</button></div>`:'<div style="font-size:11px;color:var(--muted)">ยังไม่มีเอกสารแนบ</div>';
}
async function uploadProductDoc(input){
  const st=document.getElementById('np-pdoc-status'); if(st)st.textContent='กำลังอัปโหลด...';
  try{ const r=await uploadFile(input,'CatalogDocs','CAT'); if(r){ _npPDoc={name:r.fileName,url:r.fileUrl,ts:new Date().toISOString()}; if(st)st.textContent='✓ แนบแล้ว'; renderProductDoc(); } }
  catch(e){ if(st)st.textContent=''; alert('แนบเอกสารไม่สำเร็จ: '+e.message); }
}
function fillVendorSelect(sel){ const el=document.getElementById('np-vendor'); if(el)el.innerHTML=vendorOptions(sel); }
function openAddProduct(){
  editingProductId=null; _npPDoc=null;
  document.getElementById('pm-title').textContent='เพิ่มสินค้าใหม่';
  ['np-name','np-sku','np-pn','np-cost','np-price','np-unit','np-desc','np-internal-notes'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('np-cat').value='Hardware';
  document.getElementById('np-pdoc-status').textContent='';
  fillVendorSelect(''); updateProductMargin(); renderProductDoc();
  openModal('product-modal');
}
function editProduct(id){
  const p=catalogData.find(c=>c.id===id); if(!p)return;
  editingProductId=id; const ex=catExtra(id); _npPDoc=ex.pdoc||null;
  document.getElementById('pm-title').textContent='แก้ไขสินค้า';
  document.getElementById('np-name').value=p.Title||'';
  document.getElementById('np-sku').value=p.SKU||'';
  document.getElementById('np-pn').value=ex.pn||'';
  document.getElementById('np-cost').value=ex.cost||'';
  document.getElementById('np-price').value=p.Price||'';
  document.getElementById('np-unit').value=p.Unit||'';
  document.getElementById('np-cat').value=p.Category||'Hardware';
  document.getElementById('np-desc').value=p.Description||'';
  document.getElementById('np-internal-notes').value=p.InternalNotes||'';
  document.getElementById('np-pdoc-status').textContent='';
  fillVendorSelect(ex.vendorId||''); updateProductMargin(); renderProductDoc();
  openModal('product-modal');
}
async function saveProduct(){
  const name=document.getElementById('np-name').value, price=+document.getElementById('np-price').value;
  const priceText=document.getElementById('np-price').value.trim();if(!name.trim()||(priceText!==''&&(!Number.isFinite(price)||price<=0))){toast('กรอกชื่อสินค้า และราคาขายต้องมากกว่า 0 หรือเว้นว่างเป็น Draft','error');return;}
  const fields={Title:name,SKU:document.getElementById('np-sku').value,Price:priceText===''?'':price,CatalogStatus:priceText===''?'Draft':'Active',Unit:document.getElementById('np-unit').value,Category:document.getElementById('np-cat').value,InternalNotes:document.getElementById('np-internal-notes').value.trim(),Description:document.getElementById('np-desc').value};
  const extra={cost:+document.getElementById('np-cost').value||0,vendorId:document.getElementById('np-vendor').value||'',pn:document.getElementById('np-pn').value||'',pdoc:_npPDoc||null};
  try{
    toast('กำลังบันทึก...','info'); let pid=editingProductId;
    if(editingProductId){ await updateListItem(CONFIG.lists.catalog,editingProductId,fields); }
    else{ const c=await createListItem(CONFIG.lists.catalog,fields); pid=c.id; }
    catalogExtra[pid]=extra; await saveCatalogExtra();
    closeModal('product-modal'); toast('บันทึกสินค้าสำเร็จ','success');
    catalogData=await getListItems(CONFIG.lists.catalog); renderCatalog();
  }catch(e){ toast('ไม่สำเร็จ: '+e.message,'error'); }
}
async function deleteProduct(id){
  if(!confirm('ลบสินค้านี้?'))return;
  try{ await deleteListItem(CONFIG.lists.catalog,id); catalogData=catalogData.filter(c=>c.id!==id); renderCatalog(); toast('ลบสินค้าแล้ว','success'); }
  catch(e){ toast('ลบไม่สำเร็จ: '+e.message,'error'); }
}

// ════════ VENDOR (CRUD) — override read-only renderVendors จาก app.js ════════
function renderVendors(){
  const body=document.getElementById('vendors-body'); if(!body)return;
  const q=(document.getElementById('ven-search')?.value||'').toLowerCase();
  const list=vendorsData.filter(v=>!q||(v.name||'').toLowerCase().includes(q)||(v.contact||'').toLowerCase().includes(q));
  body.innerHTML = list.length ? list.map(v=>{
    const st=(typeof vendorStats==='function')?vendorStats(v.id):{jobs:0,spend:0,onTimePct:null};
    const stTxt=st.jobs?`${st.jobs} งาน · ${fmt(st.spend)}${st.onTimePct!=null?` · ตรงเวลา ${st.onTimePct}%`:''}`:'<span style="color:var(--muted)">—</span>';
    return `
    <tr><td style="font-weight:500">${esc(v.name)}${BankDetails.html(v,esc)}</td><td>${esc(v.contact||'')}</td><td>${esc(v.phone||'')}</td><td>${esc(v.email||'')}</td>
    <td style="font-size:11px;color:${st.jobs?'var(--accent2)':'var(--muted)'}">${stTxt}</td>
    <td>${(v.contracts||[]).length?(v.contracts||[]).map(d=>`<a href="${d.url}" target="_blank">📄 ${esc(d.name)}</a>`).join(' '):'<span style="color:var(--muted)">—</span>'}</td>
    <td style="white-space:nowrap"><button class="btn btn-sm" onclick="editVendor('${v.id}')">แก้</button> <button class="btn btn-sm" onclick="deleteVendor('${v.id}')" style="color:var(--red)">ลบ</button></td></tr>`;
  }).join('')
    : '<tr><td colspan=7 style="text-align:center;padding:28px;color:var(--muted)">ยังไม่มี Vendor — กด "เพิ่ม Vendor"</td></tr>';
}
function renderVendorContracts(){
  const w=document.getElementById('vd-contracts'); if(!w)return;
  w.innerHTML=_vdContracts.length?_vdContracts.map(d=>`<div style="display:flex;gap:6px;align-items:center;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;margin-bottom:4px"><a href="${d.url}" target="_blank" style="flex:1;color:var(--accent2)">📄 ${esc(d.name)}</a><button class="btn btn-sm" onclick="removeVendorContract(${d.id})" style="color:var(--red)">✕</button></div>`).join(''):'<div style="font-size:11px;color:var(--muted)">ยังไม่มีเอกสารแนบ</div>';
}
async function uploadVendorContract(input){
  const st=document.getElementById('vd-file-status'); if(st)st.textContent='กำลังอัปโหลด...';
  try{ const r=await uploadFile(input,'VendorContracts','VENDOR'); if(r){ _vdContracts.push({id:Date.now(),name:r.fileName,url:r.fileUrl,ts:new Date().toISOString()}); if(st)st.textContent='✓ แนบแล้ว'; renderVendorContracts(); } }
  catch(e){ if(st)st.textContent=''; alert('แนบเอกสารไม่สำเร็จ: '+e.message); }
}
function removeVendorContract(cid){ _vdContracts=_vdContracts.filter(d=>d.id!==cid); renderVendorContracts(); }
function openAddVendor(){
  editingVendorId=null; _vdContracts=[];
  document.getElementById('vm-title').textContent='เพิ่ม Vendor';
  ['vd-name','vd-contact','vd-phone','vd-email','vd-note','vd-address','vd-bank-name','vd-bank-account-name','vd-bank-account-number'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('vd-file-status').textContent=''; renderVendorContracts(); openModal('vendor-modal');
}
function editVendor(id){
  const v=vendorsData.find(x=>String(x.id)===String(id)); if(!v)return;
  editingVendorId=v.id; _vdContracts=[...(v.contracts||[])];
  document.getElementById('vm-title').textContent='แก้ไข Vendor';
  document.getElementById('vd-name').value=v.name||''; document.getElementById('vd-contact').value=v.contact||'';
  document.getElementById('vd-phone').value=v.phone||''; document.getElementById('vd-email').value=v.email||''; document.getElementById('vd-note').value=v.note||'';
  {const a=document.getElementById('vd-address');if(a)a.value=v.address||'';}
  const bank=BankDetails.read(v);document.getElementById('vd-bank-name').value=bank.bankName;document.getElementById('vd-bank-account-name').value=bank.bankAccountName;document.getElementById('vd-bank-account-number').value=bank.bankAccountNumber;
  document.getElementById('vd-file-status').textContent=''; renderVendorContracts(); openModal('vendor-modal');
}
async function saveVendor(){
  const name=document.getElementById('vd-name').value.trim();
  if(!name){ toast('กรุณาระบุชื่อ Vendor','error'); return; }
  let bank;try{bank=BankDetails.validate({bankName:document.getElementById('vd-bank-name').value,bankAccountName:document.getElementById('vd-bank-account-name').value,bankAccountNumber:document.getElementById('vd-bank-account-number').value});}catch(e){toast(e.message,'error');return;}
  const obj={...bank,name,contact:document.getElementById('vd-contact').value.trim(),phone:document.getElementById('vd-phone').value.trim(),email:document.getElementById('vd-email').value.trim(),address:(document.getElementById('vd-address')?.value||'').trim(),note:document.getElementById('vd-note').value.trim(),contracts:[..._vdContracts]};
  const next=editingVendorId?vendorsData.map(v=>String(v.id)===String(editingVendorId)?{...v,...obj}:v):[...vendorsData,{id:Date.now(),...obj}];
  try{ await putSetting('Vendors',JSON.stringify(next)); vendorsData=next; renderVendors(); closeModal('vendor-modal'); toast('บันทึก Vendor สำเร็จ','success'); }
  catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}
async function deleteVendor(id){
  const v=vendorsData.find(x=>String(x.id)===String(id)); if(!v)return;
  if(!confirm('ลบ Vendor "'+(v.name||'')+'" ?'))return;
  vendorsData=vendorsData.filter(x=>String(x.id)!==String(id));
  try{ await saveVendorsStore(); renderVendors(); toast('ลบ Vendor แล้ว','success'); }catch(e){ toast('ลบไม่สำเร็จ: '+e.message,'error'); }
}

// ── hook showPage ให้โหลด catalog เมื่อเปิดหน้า ──
if (typeof showPage === 'function') {
  const _origShowPage = showPage;
  showPage = function(id, el){ _origShowPage(id, el); if(id==='catalog'){ if(!catalogData.length) loadCatalogAndRender(); else { renderCatalog(); if(typeof renderCatalogPending==='function') renderCatalogPending(); } } };
}
