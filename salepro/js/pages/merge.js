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
  if (q.Status === 'Pending' || q.Status === 'Closed' || q.Status === 'PO Received' || Number(q.PaidAmount)>0) return true;
  try { if (typeof parseDealStatus === 'function' && (parseDealStatus(q.DealStatus).closed || (parseDealStatus(q.DealStatus).custPOs||[]).length || (parseDealStatus(q.DealStatus).techJobs||[]).length)) return true; } catch(e) {}
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
  const clients = Array.from(new Set(sel.map(_mergeCustomerKey)));
  const sameClient = clients.length <= 1 && !clients.includes(null);
  const okCount = sel.length >= 2 && sameClient;
  let warn = '';
  if (sel.length >= 2 && !sameClient) warn = ' · <span style="color:var(--red)">⚠ ต้องเป็นลูกค้าเจ้าเดียวกัน (' + sel.map(q=>escHtml(q.ClientName||'')).join(' / ') + ')</span>';
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
function _mergeMapItems(sourceId, allItems, baseIdx, sourceQuote) {
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
      disc: 100*(1-(1-Number(it.DiscountPct||0)/100)*(1-Number(sourceQuote?.DiscountPct||0)/100)), rowH: rh, cost: +ex.cost || 0, vendorId: ex.vendorId || '', asHeader: !!ex.asHeader, travel: null
    };
  });
}

async function startMerge() {
  const sel = mergeSel.map(id => quotesData.find(q => String(q.id) === String(id))).filter(Boolean);
  if (sel.length < 2) { toast('เลือกอย่างน้อย 2 ใบ', 'error'); return; }
  const clients = Array.from(new Set(sel.map(_mergeCustomerKey)));
  if (clients.length !== 1 || !clients[0]) { toast('ต้องเป็นลูกค้าเดียวกัน โดยมีเลขผู้เสียภาษีหรือ Customer Profile ที่ยืนยันตรงกัน', 'error'); return; }
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
      const rows = _mergeMapItems(q.id, allItems, qi * 100000, q);
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
    _set('g-disc', '0');_set('g-disc-mode','pct');
    if(typeof _dupSourceId!=='undefined')_dupSourceId=null;
    if(typeof _nqProjectId!=='undefined')_nqProjectId=null;

    const eb = document.getElementById('edit-banner'); if (eb) eb.style.display = 'none';
    document.getElementById('items-body').innerHTML = '';
    renderItems();
    if (typeof updateApproverBox === 'function') updateApproverBox();
    if (typeof initQuoteSignature === 'function') initQuoteSignature();
    toast('รวมเป็น ' + newNo + ' แล้ว — ปรับจำนวน/ระยะทางให้ครบ แล้วกดบันทึก', 'success');
  }, 60);
}


// Match stable identity, never accept the displayed customer name by itself.
function _mergeCustomerKey(q){
 const digits=v=>String(v||'').replace(/\D/g,''),tax=digits(q.CustomerTaxID);
 if(tax.length===13)return 'tax:'+tax;
 const profiles=typeof customersData!=='undefined'?customersData:[];
 const matches=profiles.filter(c=>q.CustomerID?String(c.id)===String(q.CustomerID):String(c.Title||'').trim()===String(q.ClientName||'').trim());
 if(matches.length!==1)return null;const found=digits(matches[0].TaxID);
 if(tax&&tax!==found)return null;
 return found.length===13?'tax:'+found:'profile:'+matches[0].id;
}
const mergeCleanupBusy=new Set();
function mergeRecords(){return (typeof _settingsCache!=='undefined'?_settingsCache:[]).filter(r=>String(r.Title||'').startsWith('QuoteMerge_v1_')).flatMap(r=>{try{return [{...JSON.parse(r.Value),key:r.Title}];}catch(_){return [];}});}
function mergeSourceExcluded(id){return mergeRecords().some(r=>r.committed&&r.sourceIds?.map(String).includes(String(id)));}
function renderMergeRecovery(){
 const host=document.getElementById('merge-recovery');if(!host)return;host.replaceChildren();
 for(const record of mergeRecords().filter(r=>r.state!=='complete')){
   const row=document.createElement('div');row.style.cssText='padding:10px;margin-bottom:8px;border:1px solid var(--amber);border-radius:8px';
   const label=document.createElement('span');label.textContent='ใบรวม '+(record.targetTitle||record.targetId)+' บันทึกแล้ว · ยังล้างต้นฉบับไม่ครบ ';row.appendChild(label);
   const button=document.createElement('button');button.type='button';button.className='btn btn-sm';button.textContent='ดำเนินการลบต้นฉบับต่อ';button.disabled=mergeCleanupBusy.has(record.targetId);button.onclick=()=>resumeMerge(record.targetId);row.appendChild(button);host.appendChild(row);
 }
}
async function resumeMerge(targetId){
 if(!confirm('ล้างใบต้นฉบับของใบรวมนี้ต่อ? ระบบจะใช้ใบรวมเดิม ไม่สร้างใบใหม่ซ้ำ'))return;
 try{await finalizeMerge(targetId,true);}catch(e){toast('ยังล้างต้นฉบับไม่สำเร็จ: '+e.message,'error');renderMergeRecovery();}
}
async function finalizeMerge(newId,resume=false){
 newId=String(newId);if(mergeCleanupBusy.has(newId))throw Error('กำลังดำเนินการใบรวมนี้');
 mergeCleanupBusy.add(newId);
 try{
 const settings=await getListItems(CONFIG.lists.settings),key='QuoteMerge_v1_'+newId;
 const stored=settings.find(r=>r.Title===key);let record=stored?JSON.parse(stored.Value):null;
 const ids=record?.sourceIds||(_mergeSourceIds||[]).map(String).filter(id=>id!==newId);
 if(!ids.length)return;
 const allQuotes=await getListItems(CONFIG.lists.quotations),target=allQuotes.find(q=>String(q.id)===newId);
 if(!target)throw Error('ไม่พบใบรวมที่บันทึกไว้ จึงไม่ลบต้นฉบับ');
 if(!canEditQuote(target))throw Error('ไม่มีสิทธิ์ดำเนินการใบรวมนี้');
 if(record?.state==='complete'){_mergeSourceIds=null;return;}
 if(!record){
   const sources=ids.map(id=>allQuotes.find(q=>String(q.id)===id));
   if(sources.some(q=>!q||!canEditQuote(q)))throw Error('ใบต้นฉบับหรือสิทธิ์เปลี่ยน กรุณาตรวจข้อมูลก่อนรวม');
   const identity=_mergeCustomerKey(target);
   for(const q of sources){const ds=settings.find(r=>r.Title==='DealStatus_'+q.id);if(_mergeLocked({...q,DealStatus:ds?.Value||q.DealStatus})||!identity||_mergeCustomerKey(q)!==identity)throw Error('ต้นฉบับมี PO งานช่าง ยอดชำระ หรือข้อมูลลูกค้าเปลี่ยน จึงไม่ลบ');}
   const conflicting=settings.filter(r=>r.Title.startsWith('QuoteMerge_v1_')&&r.Title!==key).some(r=>{try{const x=JSON.parse(r.Value);return x.committed&&x.sourceIds.some(id=>ids.includes(String(id)));}catch(_){return false;}});
   if(conflicting)throw Error('มีใบต้นฉบับถูกนำไปรวมในรายการอื่นแล้ว');
   for(const list of [CONFIG.lists.payments,CONFIG.lists.procurement,CONFIG.lists.contracts].filter(Boolean)){
     const linked=await getListItems(list);
     if(linked.some(r=>{let c=r;try{if(r.Value)c={...r,...JSON.parse(r.Value)};}catch(_){throw Error('ข้อมูลอ้างอิงอ่านไม่ได้');}const refs=String(c.quoteId||c.QuoteID||c.QuoteId||'').split(',').map(x=>x.trim());return refs.some(id=>ids.includes(id));}))throw Error('ต้นฉบับผูกกับการชำระเงิน จัดซื้อ หรือสัญญาแล้ว กรุณาตรวจรายการอ้างอิงก่อนรวม');
   }
   const items=await getListItems(CONFIG.lists.quoteItems);
   if(!items.some(i=>String(i.QuoteID)===newId))throw Error('ใบรวมยังไม่มีรายการสินค้า จึงไม่ลบต้นฉบับ');
   // Back up source rows and their formatting/travel metadata before any deletion.
   for(const source of sources){
     const backup={quote:source,items:items.filter(i=>String(i.QuoteID)===String(source.id)),settings:settings.filter(r=>r.Title.endsWith('_'+source.id))};
     const value=JSON.stringify(backup);if(value.length>45000)throw Error('ต้นฉบับมีข้อมูลสำรองขนาดใหญ่ ต้องจัดการสำรองก่อนลบ');
     await putSettingValue('QuoteMergeBackup_v1_'+newId+'_'+source.id,value);
   }
   record={version:1,targetId:newId,targetTitle:target.Title,sourceIds:ids,remaining:ids.slice(),state:'pending',committed:true,at:new Date().toISOString(),owner:currentUser?.email||''};
   await putSettingValue(key,JSON.stringify(record));
 }
 const failures=[];
 for(const id of record.remaining.slice()){
   try{
     const fresh=await getListItems(CONFIG.lists.quotations),source=fresh.find(q=>String(q.id)===String(id));
     if(source){const currentSettings=await getListItems(CONFIG.lists.settings),ds=currentSettings.find(r=>r.Title==='DealStatus_'+source.id);if(!canEditQuote(source)||_mergeLocked({...source,DealStatus:ds?.Value||source.DealStatus}))throw Error('ต้นฉบับเปลี่ยนสถานะหรือสิทธิ์');await deleteListItem(CONFIG.lists.quotations,id);}
     // Verify an uncertain delete before touching the line items.
     const after=await getListItems(CONFIG.lists.quotations);
     if(after.some(q=>String(q.id)===String(id)))throw Error('ยังยืนยันการลบใบต้นฉบับไม่ได้');
     quotesData=quotesData.filter(q=>String(q.id)!==String(id));
     await deleteWhere(CONFIG.lists.quoteItems,'QuoteID',id);
     const residual=await getListItems(CONFIG.lists.quoteItems);
     if(residual.some(i=>String(i.QuoteID)===String(id)))throw Error('ยังลบรายการสินค้าไม่ครบ');
     const oldSettings=await getListItems(CONFIG.lists.settings);
     for(const setting of oldSettings.filter(r=>!String(r.Title||'').startsWith('QuoteMerge')&&String(r.Title||'').endsWith('_'+id)))await deleteListItem(CONFIG.lists.settings,setting.id);
     record.remaining=record.remaining.filter(x=>String(x)!==String(id));await putSettingValue(key,JSON.stringify(record));
   }catch(e){failures.push(id+': '+e.message);}
 }
 record.state=record.remaining.length?'pending':'complete';await putSettingValue(key,JSON.stringify(record));
 if(record.state==='complete')_mergeSourceIds=null;
 if(typeof renderDash==='function')renderDash();renderQuotes();
 if(typeof renderSaleResult==='function')renderSaleResult();
 if(typeof renderPayment==='function')renderPayment();if(typeof updateBadge==='function')updateBadge();
 if(failures.length)throw Error('ใบรวมบันทึกแล้ว แต่ยังล้างต้นฉบับ '+record.remaining.length+' ใบไม่ครบ กดดำเนินการต่อในหน้ารายการได้');
 toast('รวมสำเร็จและล้างต้นฉบับครบ '+ids.length+' ใบแล้ว','success');
 }finally{mergeCleanupBusy.delete(newId);renderMergeRecovery();}
}
