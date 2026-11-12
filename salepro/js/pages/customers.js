// ============================================================
// CUSTOMERS
// ============================================================
let customersData = [];
let editingCustomerId = null;
let customerCodes = {};   // { [customerId]: 'E003' } — เก็บใน Settings (เลี่ยงคอลัมน์ใหม่)
let customerFaxes = {};   // { [customerId]: 'Fax' } — เก็บใน Settings เช่นกัน

async function loadCustomers(sourceRows) {
  try { customersData = Array.isArray(sourceRows)?sourceRows:await getListItems(CONFIG.lists.customers); } catch(e) { console.warn('ใช้ข้อมูลลูกค้าล่าสุดในเครื่อง:',e.message); }
  loadCustomerCodes();
  loadCustomerFaxes();
}

function loadCustomerFaxes() {
  try { const it = (_settingsCache || []).find(i => i.Title === 'CustomerFax'); customerFaxes = (it && it.Value) ? (JSON.parse(it.Value) || {}) : {}; }
  catch(e) { customerFaxes = {}; }
}
function getCustomerFax(id) { return customerFaxes[String(id)] || ''; }
async function saveCustomerFax(id, fax) {
  customerFaxes[String(id)] = fax;
  const value = JSON.stringify(customerFaxes);
  const items = _settingsCache || await getListItems(CONFIG.lists.settings);
  const ex = items.find(i => i.Title === 'CustomerFax');
  if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
  else { const c = await createListItem(CONFIG.lists.settings, { Title: 'CustomerFax', Value: value }); if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'CustomerFax', Value: value }); }
}

function loadCustomerCodes() {
  try {
    const it = (_settingsCache || []).find(i => i.Title === 'CustomerCodes');
    customerCodes = (it && it.Value) ? (JSON.parse(it.Value) || {}) : {};
  } catch(e) { customerCodes = {}; }
}
function getCustomerCode(id) { return customerCodes[String(id)] || ''; }
async function saveCustomerCode(id, code) {
  customerCodes[String(id)] = code;
  const value = JSON.stringify(customerCodes);
  const items = _settingsCache || await getListItems(CONFIG.lists.settings);
  const ex = items.find(i => i.Title === 'CustomerCodes');
  if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
  else { const c = await createListItem(CONFIG.lists.settings, { Title: 'CustomerCodes', Value: value }); if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'CustomerCodes', Value: value }); }
}
// ── ชื่อบริษัท/ที่อยู่ภาษาอังกฤษสำหรับเอกสารสำคัญ (เก็บใน Settings ไม่เพิ่มคอลัมน์) ──
let _custDocEN = null;
function _loadCustDocEN() {
  if (_custDocEN !== null) return _custDocEN;
  try { _custDocEN = JSON.parse(getSettingValue('CustomerDocEN') || '{}') || {}; } catch(e) { _custDocEN = {}; }
  return _custDocEN;
}
function getCustomerDocEN(id) { const m = _loadCustDocEN(); return m[String(id)] || null; }
// normalize ชื่อเพื่อจับคู่แบบยืดหยุ่น (ตัดช่องว่าง/จุด/จุลภาค/ขีด/วงเล็บ + พิมพ์เล็ก)
function _normName(s) { return String(s || '').toLowerCase().replace(/[\s.,\-()]/g, ''); }
function _digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }
// หาลูกค้า: จับคู่ด้วยเลขผู้เสียภาษีก่อน (ชัวร์สุด) แล้ว fallback เป็นชื่อไทย/EN
function resolveCustomer(clientName, taxId) {
  try {
    if (typeof customersData === 'undefined' || !Array.isArray(customersData)) return null;
    const tx = _digitsOnly(taxId);
    if (tx && tx.length >= 10) { const byTax = customersData.find(c => _digitsOnly(c.TaxID) === tx); if (byTax) return byTax; }
    const key = _normName(clientName); if (!key) return null;
    return customersData.find(c => {
      if (_normName(c.Title) === key) return true;
      const e = getCustomerDocEN(c.id);
      return e && _normName(e.nameEN) === key;
    }) || null;
  } catch(e) { return null; }
}
function resolveCustomerByName(clientName) { return resolveCustomer(clientName, ''); }
// EN (ชื่อ/ที่อยู่) จากลูกค้า — ใช้กับใบเสนอราคา
function customerDocENByName(clientName, taxId) { const c = resolveCustomer(clientName, taxId); return c ? getCustomerDocEN(c.id) : null; }
// ชื่อไทยจากทะเบียน — ใช้กับ SOLD TO ในเอกสารสำคัญ
function customerThaiNameByAny(clientName, taxId) { const c = resolveCustomer(clientName, taxId); return c ? (c.Title || '') : ''; }
async function saveCustomerDocEN(id, nameEN, addrEN) {
  const m = _loadCustDocEN();
  if (!(nameEN || '').trim() && !(addrEN || '').trim()) { delete m[String(id)]; }
  else { m[String(id)] = { nameEN: (nameEN||'').trim(), addrEN: (addrEN||'').trim() }; }
  await putSettingValue('CustomerDocEN', JSON.stringify(m));
}

// รหัสถัดไปอัตโนมัติ (C001, C002, ...) — ใช้เป็นค่าเริ่มต้นตอนเพิ่มลูกค้าใหม่
function nextCustomerCode() {
  let max = 0;
  Object.values(customerCodes).forEach(c => { const m = String(c).match(/(\d+)\s*$/); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return 'C' + String(max + 1).padStart(3, '0');
}
// หารหัสลูกค้าจากใบเสนอราคา (จับคู่ทน: เลขภาษีก่อน → ชื่อ; รองรับสาขาต่อท้าย/เว้นวรรค/ขีด)
function _normTax(s) { return String(s || '').replace(/\D/g, ''); }
function _normName(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
function findCustomerForQuote(q) {
  if (!q) return null;
  // 1) เลขภาษี (ตัดอักขระไม่ใช่ตัวเลขออกทั้งสองฝั่ง)
  const tax = _normTax(q.CustomerTaxID);
  if (tax) { const c = customersData.find(x => _normTax(x.TaxID) === tax); if (c) return c; }
  // 2) ชื่อ — ตรงเป๊ะหลัง normalize
  const nm = _normName(q.ClientName);
  if (nm) {
    let c = customersData.find(x => _normName(x.Title) === nm);
    if (c) return c;
    // 3) ชื่อขึ้นต้นตรงกัน (รองรับ "... สาขาประเทศไทย" ต่อท้าย ทั้งสองทิศ)
    c = customersData.find(x => { const xn = _normName(x.Title); return xn && (nm.indexOf(xn) === 0 || xn.indexOf(nm) === 0); });
    if (c) return c;
  }
  return null;
}
function customerCodeForQuote(q) {
  const c = findCustomerForQuote(q);
  return c ? getCustomerCode(c.id) : '';
}

// Read fresh CRM data for every saved quote; serialize auto-creates within this tab.
let _customerAutoSaveQueue=Promise.resolve();
function quoteCustomerTax(value){return String(value||'').replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50)).replace(/[\s-]/g,'');}
function autoAddCustomerFromQuote(fields, fax, docEN={}, options={}) {
  const snapshot={...fields},extras={...docEN},owner=currentUser?.email;
  const allowMissingTax=options.allowMissingTax===true;
  const operation=_customerAutoSaveQueue.then(async()=>{
    const name=String(snapshot.ClientName||'').trim(),tax=quoteCustomerTax(snapshot.CustomerTaxID);
    if(!name||name==='(ไม่ระบุ)')return {state:'skipped',message:'ยังไม่เพิ่ม CRM: กรุณาระบุชื่อลูกค้า'};
    if(!/^\d{13}$/.test(tax)&&!(allowMissingTax&&!tax))return {state:'skipped',message:'ยังไม่เพิ่ม CRM: เลขประจำตัวผู้เสียภาษีต้องครบ 13 หลัก (หากยังไม่มี ให้เว้นว่าง)'};
    if(!owner||currentUser?.email!==owner)throw Error('บัญชีผู้ใช้งานเปลี่ยน กรุณาตรวจทะเบียนลูกค้า');
    const fresh=await getListItems(CONFIG.lists.customers);
    if(!Array.isArray(fresh))throw Error('โหลดทะเบียนลูกค้าล่าสุดไม่สำเร็จ');
    customersData=fresh;
    const matches=tax?fresh.filter(c=>quoteCustomerTax(c.TaxID)===tax):[];
    if(matches.length)return {state:'existing',customer:matches[0],message:matches.length>1?'พบเลขผู้เสียภาษีซ้ำในทะเบียนเดิม กรุณาตรวจ CRM — ไม่ได้สร้างเพิ่ม':'พบเลขผู้เสียภาษีเดิม ใช้ลูกค้าใน CRM เดิมแล้ว — ไม่สร้างซ้ำ'};
    const nameKey=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
    const sameName=fresh.filter(c=>nameKey(c.Title)===nameKey(name)&&(!tax||!quoteCustomerTax(c.TaxID)));
    if(sameName.length>1)return {state:'skipped',message:'ยังไม่เพิ่ม CRM: พบชื่อลูกค้าซ้ำหลายราย กรุณาตรวจทะเบียนลูกค้า'};
    if(sameName.length===1)return {state:'existing',customer:sameName[0],message:'พบชื่อลูกค้าใน CRM แล้ว — ไม่สร้างซ้ำและไม่ทับข้อมูลเดิม'};
    if(currentUser?.email!==owner)throw Error('บัญชีผู้ใช้งานเปลี่ยน กรุณาตรวจทะเบียนลูกค้า');
    const cfields={Title:name,ContactPerson:snapshot.ContactPerson||'',TaxID:tax,Phone:snapshot.CustomerTel||snapshot.Phone||'',Email:snapshot.Email||'',Address:snapshot.CustomerAddress||''};
    const created=await createListItem(CONFIG.lists.customers,cfields);
    if(!created?.id)throw Error('ยังไม่ยืนยันการบันทึกลูกค้า กรุณาตรวจ CRM ก่อนเพิ่มซ้ำ');
    const customer={...cfields,...created};customersData.push(customer);
    let extrasFailed=false;
    try{
      if(typeof saveCustomerCode==='function')await saveCustomerCode(created.id,nextCustomerCode());
      if(fax&&typeof saveCustomerFax==='function')await saveCustomerFax(created.id,fax);
      if((extras.nameEN||extras.addrEN)&&typeof saveCustomerDocEN==='function')await saveCustomerDocEN(created.id,extras.nameEN||'',extras.addrEN||'');
    }catch(e){extrasFailed=true;}
    return {state:'created',customer,message:extrasFailed?'เพิ่มลูกค้าเข้า CRM แล้ว แต่ข้อมูลเสริมบางส่วนยังบันทึกไม่ครบ กรุณาตรวจทะเบียนลูกค้า':'เพิ่มข้อมูลลูกค้าเข้า CRM อัตโนมัติแล้ว'};
  });
  _customerAutoSaveQueue=operation.catch(()=>{});return operation;
}

async function syncApprovedQuoteCustomer(quote){
  if(quote?.Status!=='Approved')return null;
  try{
    const fax=typeof getQuoteFax==='function'?getQuoteFax(quote.id):'';
    const en=typeof getQuoteDocEN==='function'?getQuoteDocEN(quote.id):{};
    return await autoAddCustomerFromQuote(quote,fax,en,{allowMissingTax:true});
  }catch(error){return {state:'error',message:'อนุมัติแล้ว แต่เพิ่ม CRM ไม่สำเร็จ: '+error.message+' · กรุณาตรวจทะเบียนลูกค้า'};}
}

function renderCustomers() {
  const q = (document.getElementById('cust-search')?.value||'').toLowerCase();
  const filtered = customersData.filter(c=>(c.Title||'').toLowerCase().includes(q)||(c.ContactPerson||'').toLowerCase().includes(q)||(c.Email||'').toLowerCase().includes(q));
  document.getElementById('customers-body').innerHTML = filtered.length ? filtered.map(c=>`
    <tr>
      <td style="font-family:var(--mono);font-size:11px;color:var(--accent2)">${escHtml(getCustomerCode(c.id)||'—')}</td>
      <td style="font-weight:500">${escHtml(c.Title||'')}</td>
      <td>${escHtml(c.ContactPerson||'')}</td>
      <td>${escHtml(c.Phone||'')}</td>
      <td>${escHtml(c.Email||'')}</td>
      <td style="font-family:var(--mono);font-size:11px">${escHtml(c.TaxID||'')}</td>
      <td style="font-size:12px;color:var(--muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.Address||'')}</td>
      <td style="display:flex;gap:4px">
        <button class="action-btn" onclick="selectCustomerForQuote('${c.id}')" style="color:var(--accent2)" title="ใช้ในใบเสนอราคา"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <button class="action-btn" onclick="editCustomer('${c.id}')" title="แก้ไข"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn" onclick="deleteCustomer('${c.id}')" style="color:var(--red)" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </td>
    </tr>`).join('') : '<tr><td colspan=8 style="text-align:center;padding:32px;color:var(--muted)">ยังไม่มีข้อมูลลูกค้า</td></tr>';
}

