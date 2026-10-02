// ============================================================
// QUOTE SIGNATURE (per-user) — stored in SharePoint Settings
// ============================================================
let currentQuoteSignature = '';

// Cache in memory to avoid repeated API calls
const sigCache = {};

function sigKey(email) {
  return 'Sig_' + (email || currentUser?.email || 'default').toLowerCase();
}

// ── Sale Profile (name + tel + signature) — เก็บใน SharePoint Settings ใช้ได้ทุกเครื่อง ──
let _saleProfile = { name: '', tel: '', signature: '' };
let _saleProfileItemId = null;

async function loadSaleProfile() {
  try {
    const email = (currentUser?.email || '').toLowerCase();
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const it = items.find(i => i.Title === 'SaleProfile_' + email);
    if (it) {
      _saleProfileItemId = it.id;
      _saleProfile = { name: '', tel: '', signature: '', ...(JSON.parse(it.Value || '{}')) };
      if (_saleProfile.signature) { sigCache[sigKey(email)] = _saleProfile.signature; }
    }
  } catch(e) { console.warn('load sale profile failed:', e.message); }
}

async function saveSaleProfile(partial) {
  _saleProfile = { ..._saleProfile, ...partial };
  // ย่อลายเซ็นให้ < 45,000 ตัวอักษร (กันลิมิตเซลล์ 50k)
  if (_saleProfile.signature && typeof shrinkImageBase64 === 'function') {
    try { _saleProfile.signature = await shrinkImageBase64(_saleProfile.signature, 600, 45000); } catch(e) {}
  }
  const email = (currentUser?.email || '').toLowerCase();
  const value = JSON.stringify(_saleProfile);
  try {
    if (_saleProfileItemId) {
      await updateListItem(CONFIG.lists.settings, _saleProfileItemId, { Value: value });
    } else {
      const c = await createListItem(CONFIG.lists.settings, { Title: 'SaleProfile_' + email, Value: value });
      _saleProfileItemId = c.id;
      if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'SaleProfile_' + email, Value: value });
    }
  } catch(e) { console.warn('save sale profile failed:', e.message); }
}

async function saveSigToSharePoint(base64) {
  const key = sigKey();
  try { localStorage.setItem(key, base64); sigCache[key] = base64; } catch(e) { /* ignore */ }
  await saveSaleProfile({ signature: base64 });  // durable across devices
}

async function loadSigFromSharePoint(email) {
  const key = sigKey(email);
  if (sigCache[key]) return sigCache[key];
  // current user → from SharePoint profile
  const isMe = !email || (email || '').toLowerCase() === (currentUser?.email || '').toLowerCase();
  if (isMe && _saleProfile.signature) { sigCache[key] = _saleProfile.signature; return _saleProfile.signature; }
  // ผู้ใช้คนอื่น (เช่น ผู้อนุมัติ) → อ่านโปรไฟล์จาก Settings list ที่แชร์กัน
  if (!isMe && email) {
    try {
      const wantTitle = ('SaleProfile_' + email).toLowerCase();
      const items = _settingsCache || await getListItems(CONFIG.lists.settings);
      const it = items.find(i => (i.Title || '').toLowerCase() === wantTitle);
      if (it) {
        const prof = JSON.parse(it.Value || '{}');
        if (prof.signature) { sigCache[key] = prof.signature; return prof.signature; }
      }
    } catch(e) { /* ignore */ }
  }
  try {
    const val = localStorage.getItem(key);
    if (val) { sigCache[key] = val; return val; }
  } catch(e) { /* ignore */ }
  return null;
}

// Keep loadSigStored as alias for backward compat (used in showPDFForQuote)
async function loadSigStored(key) {
  const email = key.replace('mySignature_', '');
  return await loadSigFromSharePoint(email);
}

function handleQuoteSigUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 3MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    currentQuoteSignature = e.target.result;
    updateSigPreview(currentQuoteSignature);
    toast('กำลังบันทึกลายเซ็น...', 'info');
    await saveSigToSharePoint(currentQuoteSignature);
    toast('✓ บันทึกลายเซ็นแล้ว', 'success');
  };
  reader.onerror = () => toast('อ่านไฟล์ไม่ได้', 'error');
  reader.readAsDataURL(file);
}

async function loadMySignature() {
  toast('กำลังโหลดลายเซ็น...', 'info');
  const saved = await loadSigFromSharePoint();
  if (saved) {
    currentQuoteSignature = saved;
    updateSigPreview(saved);
    toast('โหลดลายเซ็นแล้ว', 'success');
  } else {
    toast('ยังไม่มีลายเซ็นที่บันทึกไว้ — กรุณาอัปโหลดก่อน', 'error');
  }
}

function updateSigPreview(src) {
  const preview = document.getElementById('q-sig-preview');
  if (!preview) return;
  if (src) {
    preview.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;padding:4px">`;
    preview.style.border = '1.5px solid var(--green)';
  } else {
    preview.innerHTML = '<span style="font-size:11px;color:var(--muted);text-align:center;padding:4px">คลิกเพื่ออัปโหลด<br>ลายเซ็น</span>';
    preview.style.border = '1.5px dashed var(--border2)';
  }
}

async function initQuoteSignature() {
  const saved = await loadSigFromSharePoint();
  if (saved) { currentQuoteSignature = saved; updateSigPreview(saved); }
  else { currentQuoteSignature = ''; updateSigPreview(''); }
}

// ตั้งหมายเหตุ + เงื่อนไข เป็นค่าเริ่มต้น (ใช้ครั้งต่อไปไม่ต้องพิมพ์ใหม่)
window.saveNoteTermsDefault = function() {
  try {
    const email = currentUser?.email || ''
    localStorage.setItem('note_default_' + email, document.getElementById('q-note')?.value || '')
    localStorage.setItem('terms_default_' + email, document.getElementById('q-terms')?.value || '')
    toast('บันทึกเป็นค่าเริ่มต้นแล้ว — ใบเสนอราคาใหม่จะใช้ค่านี้', 'success')
  } catch(e) { /* ignore */ }
}

// จำข้อมูล Sale ทันทีที่แก้ — เก็บทั้ง localStorage (เร็ว) + SharePoint (ทุกเครื่อง)
window.saveSaleInfo = function() {
  const name = document.getElementById('q-sale-name')?.value || ''
  const tel  = document.getElementById('q-sale-tel')?.value || ''
  const email = document.getElementById('q-sale-email')?.value || ''
  try { localStorage.setItem('sale_info_' + (currentUser?.email || ''), JSON.stringify({ name, tel, email })) } catch(e) { /* ignore */ }
  saveSaleProfile({ name, tel })  // durable across devices
}

function selectCustomerForQuote(id) {
  const c = customersData.find(x => x.id === id);
  if (!c) return;
  showPage('newquote', null);
  setTimeout(() => {
    if(document.getElementById('q-client')) {
      document.getElementById('q-client').value = c.Title||'';
      document.getElementById('q-contact').value = c.ContactPerson||'';
      document.getElementById('q-phone').value = c.Phone||'';
      document.getElementById('q-email').value = c.Email||'';
      document.getElementById('q-cust-address').value = c.Address||'';
      document.getElementById('q-cust-taxid').value = c.TaxID||'';
      document.getElementById('q-cust-tel').value = c.Phone||'';
      const _f=document.getElementById('q-cust-fax'); if(_f && typeof getCustomerFax==='function') _f.value = getCustomerFax(c.id)||'';
      const _en=(typeof getCustomerDocEN==='function')?getCustomerDocEN(c.id):null;
      const _cne=document.getElementById('q-client-en'); if(_cne) _cne.value = _en?.nameEN || '';
      const _cae=document.getElementById('q-cust-address-en'); if(_cae) _cae.value = _en?.addrEN || '';
    }
    toast('โหลดข้อมูล '+c.Title+' แล้ว', 'success');
  }, 150);
}

function openAddCustomer() {
  editingCustomerId = null;
  document.getElementById('cm-title').textContent = 'เพิ่มลูกค้าใหม่';
  ['cu-name','cu-contact','cu-taxid','cu-phone','cu-fax','cu-email','cu-address','cu-name-en','cu-address-en'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const codeEl = document.getElementById('cu-code'); if (codeEl) codeEl.value = (typeof nextCustomerCode==='function') ? nextCustomerCode() : '';
  openModal('customer-modal');
}

function editCustomer(id) {
  const c = customersData.find(x=>x.id===id);
  if (!c) return;
  editingCustomerId = id;
  document.getElementById('cm-title').textContent = 'แก้ไขข้อมูลลูกค้า';
  const codeEl = document.getElementById('cu-code'); if (codeEl) codeEl.value = (typeof getCustomerCode==='function') ? getCustomerCode(id) : '';
  document.getElementById('cu-name').value = c.Title||'';
  document.getElementById('cu-contact').value = c.ContactPerson||'';
  document.getElementById('cu-taxid').value = c.TaxID||'';
  document.getElementById('cu-phone').value = c.Phone||'';
  const _cf=document.getElementById('cu-fax'); if(_cf) _cf.value = (typeof getCustomerFax==='function')?getCustomerFax(id):'';
  document.getElementById('cu-email').value = c.Email||'';
  document.getElementById('cu-address').value = c.Address||'';
  const _en = (typeof getCustomerDocEN==='function') ? getCustomerDocEN(id) : null;
  const _ne=document.getElementById('cu-name-en'); if(_ne) _ne.value = _en?.nameEN || '';
  const _ae=document.getElementById('cu-address-en'); if(_ae) _ae.value = _en?.addrEN || '';
  openModal('customer-modal');
}

async function saveCustomer() {
  const name = document.getElementById('cu-name').value;
  if (!name) { toast('กรุณาระบุชื่อลูกค้า','error'); return; }
  const fields = { Title:name, ContactPerson:document.getElementById('cu-contact').value, TaxID:document.getElementById('cu-taxid').value, Phone:document.getElementById('cu-phone').value, Email:document.getElementById('cu-email').value, Address:document.getElementById('cu-address').value };
  try {
    toast('กำลังบันทึก...','info');
    const code = (document.getElementById('cu-code')?.value || '').trim();
    let custId = editingCustomerId;
    if (editingCustomerId) { await updateListItem(CONFIG.lists.customers, editingCustomerId, fields); }
    else { const created = await createListItem(CONFIG.lists.customers, fields); custId = created && created.id; }
    if (custId && typeof saveCustomerCode === 'function') { try { await saveCustomerCode(custId, code); } catch(e) { console.warn('save cust code', e.message); } }
    if (custId && typeof saveCustomerFax === 'function') { try { await saveCustomerFax(custId, document.getElementById('cu-fax')?.value || ''); } catch(e) { console.warn('save cust fax', e.message); } }
    if (custId && typeof saveCustomerDocEN === 'function') { try { await saveCustomerDocEN(custId, document.getElementById('cu-name-en')?.value || '', document.getElementById('cu-address-en')?.value || ''); } catch(e) { console.warn('save cust EN', e.message); } }
    closeModal('customer-modal');
    await loadCustomers(); renderCustomers();
    toast('บันทึกข้อมูลลูกค้าสำเร็จ','success');
  } catch(e) { toast('ไม่สำเร็จ: '+e.message,'error'); }
}

async function deleteCustomer(id) {
  if (!confirm('ลบลูกค้านี้?')) return;
  try { await deleteListItem(CONFIG.lists.customers, id); customersData=customersData.filter(c=>c.id!==id); renderCustomers(); toast('ลบลูกค้าแล้ว','success'); }
  catch(e) { toast('ลบไม่สำเร็จ: '+e.message,'error'); }
}

async function openCustomerPicker() {
  if (customersData.length === 0) {
    await loadCustomers();
  }
  renderCustomerPicker();
  openModal('customer-picker-modal');
}

function renderCustomerPicker() {
  const q = (document.getElementById('cust-picker-search')?.value||'').toLowerCase();
  const filtered = customersData.filter(c=>(c.Title||'').toLowerCase().includes(q)||(c.ContactPerson||'').toLowerCase().includes(q));
  const list = document.getElementById('customer-picker-list');
  if (!list) return;
  list.innerHTML = filtered.length ? filtered.map(c=>`
    <div onclick="pickCustomer('${c.id}')" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--border);margin-bottom:8px;transition:all 0.15s" onmouseover="this.style.background='var(--surface2)';this.style.borderColor='var(--accent)'" onmouseout="this.style.background='';this.style.borderColor='var(--border)'">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;flex-shrink:0">${escHtml((c.Title||'?')[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--text)">${escHtml(c.Title||'')}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${[c.ContactPerson,c.Phone,c.Email].filter(Boolean).join(' · ')}</div>
        ${c.TaxID?`<div style="font-size:10px;color:var(--muted);font-family:var(--mono)">เลขภาษี: ${escHtml(c.TaxID)}</div>`:''}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('')
  : '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">ไม่พบลูกค้า</div>';
}

function pickCustomer(id) {
  const c = customersData.find(x=>x.id===id);
  if (!c) return;
  if (document.getElementById('q-client')) {
    document.getElementById('q-client').value = c.Title||'';
    document.getElementById('q-contact').value = c.ContactPerson||'';
    document.getElementById('q-phone').value = c.Phone||'';
    document.getElementById('q-email').value = c.Email||'';
    document.getElementById('q-cust-address').value = c.Address||'';
    document.getElementById('q-cust-taxid').value = c.TaxID||'';
    document.getElementById('q-cust-tel').value = c.Phone||'';
    const _f=document.getElementById('q-cust-fax'); if(_f && typeof getCustomerFax==='function') _f.value = getCustomerFax(c.id)||'';
    const _en=(typeof getCustomerDocEN==='function')?getCustomerDocEN(c.id):null;
    const _cne=document.getElementById('q-client-en'); if(_cne) _cne.value = _en?.nameEN || '';
    const _cae=document.getElementById('q-cust-address-en'); if(_cae) _cae.value = _en?.addrEN || '';
  }
  const box = document.getElementById('client-suggest');
  if (box) box.style.display='none';
  closeModal('customer-picker-modal');
  toast(`เลือก ${c.Title} แล้ว`,'success');
}

function showClientSuggest(val) {
  const box = document.getElementById('client-suggest');
  if (!box) return;
  if (!val||val.length<1){box.style.display='none';return;}
  const q = val.toLowerCase();
  const matches = customersData.filter(c=>(c.Title||'').toLowerCase().includes(q)).slice(0,6);
  if (!matches.length){box.style.display='none';return;}
  box.style.display='block';
  box.innerHTML = matches.map(c=>`
    <div onclick="pickCustomer('${c.id}')" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);transition:background 0.1s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-weight:500">${escHtml(c.Title||'')}</div>
      <div style="font-size:11px;color:var(--muted)">${escHtml(c.ContactPerson||'')} ${c.Phone?'· '+c.Phone:''}</div>
    </div>`).join('');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#client-suggest') && e.target.id!=='q-client') {
    const box = document.getElementById('client-suggest');
    if (box) box.style.display='none';
  }
});

