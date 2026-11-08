// Each billing document is a saved snapshot in Settings, independently searchable and reprintable.
const Billing=(()=>{
 const selected=new Set();let busy=false,owner='',search='',creditOnly=false,creating=null,basket='pending',periodYear='',periodMonth='',submission=null;
 const $=id=>document.getElementById(id),esc=v=>escHtml(String(v??'')),key=id=>'Billing_v1_'+id;
 const actor=()=>String(currentUser?.email||'').trim().toLowerCase();
 function records(settings=_settingsCache||[]){return settings.filter(r=>String(r.Title||'').startsWith('Billing_v1_')).map(r=>{try{return JSON.parse(r.Value);}catch(_){throw Error('อ่านใบวางบิลไม่ได้ กรุณาตรวจ '+r.Title);}});}
 function visible(d){return Array.isArray(d.sourceIds)&&d.sourceIds.every(id=>quotesData.some(q=>String(q.id)===String(id)));}
 function deal(q,settings=_settingsCache||[]){const r=settings.find(i=>i.Title==='DealStatus_'+q.id);return JSON.parse(r?.Value||q.DealStatus||'{}');}
 function allowed(q){return typeof canManageSaleActions==='function'&&canManageSaleActions(q);}
 function assigned(id,docs){return docs.find(d=>d.status!=='cancelled'&&d.sourceIds?.some(source=>String(source)===String(id)));}
 function status(id){try{return assigned(id,records())||null;}catch(e){return {error:e.message};}}
 function completedLabel(d){return d.error?'ตรวจข้อมูลวางบิล':d.status==='submitted'?'✓ วางบิลแล้ว':'✓ ออกใบวางบิลแล้ว';}
 function buttonHtml(q){if(!allowed(q))return '';const d=status(q.id);return d?`<button class="btn btn-sm" disabled title="${esc(d.error||d.number)}" style="color:var(--green)">${completedLabel(d)}</button>`:`<button class="btn btn-sm" onclick="Billing.add('${esc(q.id)}')">ส่งเข้างานวางบิล</button>`;}
 function refreshTracker(q){const button=$('st-billing-add');if(!button||!q)return;const d=status(q.id);button.style.display=allowed(q)&&['PO Received','Closed'].includes(q.Status)?'':'none';button.disabled=!!d;button.textContent=d?completedLabel(d):'ส่งเข้างานวางบิล';button.title=d?(d.error||'ใบวางบิล '+d.number):'ส่งใบนี้ไปเลือกออกใบวางบิล';button.style.color=d?'var(--green)':'';}
 function eligible(q){try{return allowed(q)&&!BillingCore.reason(q,deal(q));}catch(_){return false;}}
 function date(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function setPeriod(value){periodYear=String(value||'').slice(0,4);periodMonth=String(value||'').slice(5,7);$('billing-period-year').value=periodYear;$('billing-period-month').value=periodMonth;}
 function mountOrganization(host){
  host.insertAdjacentHTML('afterbegin',`<div class="card billing-period"><label>เดือน<select id="billing-period-month" aria-label="เดือนงานวางบิล"><option value="">ทุกเดือน</option>${['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'].map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select></label><label>ปี<select id="billing-period-year" aria-label="ปีงานวางบิล"></select></label><button class="btn btn-sm" id="billing-period-current">เดือนนี้</button><button class="btn btn-sm" id="billing-period-all">ทุกเดือน / ทุกปี</button><p class="billing-help">ใบวางบิลกรองตามวันที่บนเอกสาร · รายการรอออกใบกรองตามวันที่ใบเสนอราคา</p></div><div class="billing-baskets" id="billing-baskets" aria-label="ตะกร้าสถานะงานวางบิล"></div><p class="billing-help" id="billing-period-summary" role="status"></p>`);
  host.insertAdjacentHTML('beforeend',`<dialog id="billing-submission-dialog" class="billing-submission"><form method="dialog"><h3>ยืนยันนำเอกสารไปวางบิลแล้ว</h3><p id="billing-submission-number"></p><label>วันที่วางบิลจริง<input id="billing-submission-date" type="date" required></label><label>ผู้รับเอกสาร / แผนก (ไม่บังคับ)<input id="billing-submission-receiver" maxlength="200"></label><p class="billing-help">บันทึกสถานะการส่งเอกสารเท่านั้น ไม่บันทึกการรับเงิน</p><p id="billing-submission-message" role="status"></p><div class="billing-actions"><button class="btn btn-primary" type="button" id="billing-submission-save">ยืนยันวางบิลแล้ว</button><button class="btn" type="button" id="billing-submission-close">ปิด</button></div></form></dialog>`);
  setPeriod(date());for(const id of ['billing-period-month','billing-period-year'])$(id).onchange=()=>{periodYear=$('billing-period-year').value;periodMonth=$('billing-period-month').value;render();};
  $('billing-history-state').hidden=true;
  $('billing-period-current').onclick=()=>{setPeriod(date());render();};$('billing-period-all').onclick=()=>{periodYear=periodMonth='';render();};$('billing-submission-save').onclick=saveSubmission;$('billing-submission-close').onclick=()=>{if(!busy)$('billing-submission-dialog').close();};$('billing-submission-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 }
 function renderOrganization(docs){
  const years=new Set([date().slice(0,4),periodYear,...docs.map(d=>String(d.date||'').slice(0,4)),...quotesData.map(q=>String(q.QuoteDate||'').slice(0,4))].filter(y=>/^\d{4}$/.test(y)));$('billing-period-year').innerHTML='<option value="">ทุกปี</option>'+[...years].sort().reverse().map(y=>`<option value="${y}">${y} (พ.ศ. ${Number(y)+543})</option>`).join('');$('billing-period-year').value=periodYear;$('billing-period-month').value=periodMonth;
  const current=docs.filter(visible).filter(d=>BillingCore.inPeriod(d.date,periodYear,periodMonth));
  const pending=quotesData.filter(q=>eligible(q)&&!assigned(q.id,docs)&&BillingCore.inPeriod(q.QuoteDate,periodYear,periodMonth));
  const states=[['pending','รอวางบิล',pending.length],['issued','ออกใบแล้ว',current.filter(d=>BillingCore.workflowState(d)==='issued').length],['submitted','วางบิลแล้ว',current.filter(d=>BillingCore.workflowState(d)==='submitted').length],['cancelled','ยกเลิก',current.filter(d=>BillingCore.workflowState(d)==='cancelled').length],['all','ทั้งหมด',pending.length+current.length]];
  $('billing-baskets').innerHTML=states.map(([state,label,count])=>`<button type="button" class="billing-basket ${basket===state?'active':''}" data-billing-basket="${state}" aria-pressed="${basket===state}">${label}<b>${count}</b></button>`).join('');$('billing-baskets').querySelectorAll('[data-billing-basket]').forEach(el=>el.onclick=()=>{basket=el.dataset.billingBasket;$('billing-history-state').value='';render();});
  $('billing-workspace').hidden=!['pending','all'].includes(basket);$('billing-history-panel').hidden=basket==='pending';
  const active=current.filter(d=>d.status!=='cancelled'),amount=active.reduce((sum,d)=>sum+BillingCore.cents((d.displayTotals||d.totals).balance),0)/100;
  $('billing-period-summary').textContent=`ช่วงที่เลือก: ${periodMonth||'ทุกเดือน'} / ${periodYear||'ทุกปี'} · เอกสารที่ยังใช้งาน ${active.length} ใบ · ยอดตามเอกสาร ${fmt(amount)} บาท`;
 }
 function openSubmission(id){const d=records().find(d=>d.id===id);if(!d||!visible(d)||BillingCore.workflowState(d)!=='issued'||!(userRoles.isAdmin||d.owner===actor()))return;submission={id,owner:actor()};$('billing-submission-number').textContent=d.number;$('billing-submission-date').value=date();$('billing-submission-receiver').value='';$('billing-submission-message').textContent='';$('billing-submission-dialog').showModal();}
 async function saveSubmission(){
  if(busy||!submission)return;const target={...submission},day=$('billing-submission-date').value,receiver=$('billing-submission-receiver').value.trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){$('billing-submission-message').textContent='กรุณาระบุวันที่วางบิลจริง';return;}
  busy=true;$('billing-submission-save').disabled=true;$('billing-submission-close').disabled=true;
  try{const rows=await getListItems(CONFIG.lists.settings),r=rows.find(r=>r.Title===key(target.id));if(!r||target.owner!==actor())throw Error('ไม่พบเอกสารหรือบัญชีเปลี่ยน');const d=JSON.parse(r.Value);if(!visible(d)||!(userRoles.isAdmin||d.owner===actor()))throw Error('ไม่มีสิทธิ์เปลี่ยนสถานะ');if(BillingCore.workflowState(d)!=='issued')throw Error('สถานะเอกสารเปลี่ยนแล้ว กรุณารีเฟรช');if(day<d.date)throw Error('วันที่วางบิลจริงต้องไม่ก่อนวันที่บนเอกสาร');
   d.status='submitted';d.submittedDate=day;d.receivedBy=receiver.slice(0,200);d.submittedAt=new Date().toISOString();d.submittedBy=actor();const value=JSON.stringify(d);if(value.length>45000)throw Error('ข้อมูลเอกสารยาวเกินขนาดที่บันทึกได้');await updateListItem(CONFIG.lists.settings,r.id,{Value:value});if(target.owner!==actor())return;const cached=(_settingsCache||[]).find(x=>x.Title===key(target.id));if(cached)cached.Value=value;submission=null;$('billing-submission-dialog').close();basket='submitted';$('billing-history-state').value='';render();toast('บันทึกว่าวางบิลแล้ว','success');
  }catch(e){$('billing-submission-message').textContent=e.message;}finally{busy=false;$('billing-submission-save').disabled=false;$('billing-submission-close').disabled=false;render();}
 }
 function mount(){
  const host=$('page-billing');if(!host||host.dataset.ready)return;host.dataset.ready='1';
  host.innerHTML=`<div class="billing-head"><div><h2>งานวางบิล</h2><div class="billing-help">เลือกใบของลูกค้าเดียวกัน รวมรายการและ PO เป็นใบวางบิลเดียว · เก็บใบเสนอราคาต้นฉบับไว้</div></div><button class="btn" id="billing-refresh">รีเฟรชข้อมูล</button></div><div class="billing-layout" id="billing-workspace"><section class="card billing-panel"><h3>รายการรอวางบิล</h3><div class="billing-toolbar"><input id="billing-search" placeholder="ค้นหาลูกค้า / ใบเสนอราคา / PO" aria-label="ค้นหางานวางบิล"><label class="billing-help"><input type="checkbox" id="billing-credit"> เฉพาะ Credit</label></div><div class="billing-rows" id="billing-candidates"></div></section><aside class="card billing-panel billing-summary"><h3>เตรียมใบวางบิล</h3><div id="billing-selection"></div><label>วันที่วางบิล<input type="date" id="billing-date"></label><label>กำหนดชำระ<input type="date" id="billing-due"></label><label>หมายเหตุ<textarea id="billing-note" rows="3" placeholder="ระบุเงื่อนไขหรือนัดรับเช็ค"></textarea></label><div class="billing-actions"><button class="btn btn-primary" id="billing-create">สร้างใบวางบิล</button><button class="btn" id="billing-clear">ล้างที่เลือก</button></div><p class="billing-help">บันทึกเมื่อกดสร้างเท่านั้น · ไม่บันทึกการรับชำระเงิน</p><p id="billing-status" role="status" class="billing-warn"></p></aside></div><section class="card billing-panel billing-history" id="billing-history-panel"><h3>ใบวางบิลที่บันทึกแล้ว</h3><div class="billing-toolbar"><input id="billing-history-search" placeholder="ค้นหาเลขใบวางบิล / ลูกค้า / PO" aria-label="ค้นหาใบวางบิล"><select id="billing-history-state" aria-label="สถานะใบวางบิล"><option value="">ทุกสถานะ</option><option value="issued">ออกใบแล้ว</option><option value="submitted">วางบิลแล้ว</option><option value="cancelled">ยกเลิก</option></select></div><div id="billing-history" class="billing-rows"></div></section>`;
  $('billing-date').value=date();$('billing-search').oninput=e=>{search=e.target.value;render();};$('billing-credit').onchange=e=>{creditOnly=e.target.checked;render();};$('billing-history-search').oninput=renderHistory;$('billing-history-state').onchange=renderHistory;
  $('billing-clear').onclick=()=>{selected.clear();creating=null;render();};$('billing-create').onclick=create;$('billing-refresh').onclick=()=>load();
  mountOrganization(host);
 }
 function render(){
  mount();if(!$('billing-candidates'))return;
  if(owner!==actor()){owner=actor();selected.clear();creating=null;search='';$('billing-search').value='';$('billing-due').value='';$('billing-note').value='';}
  let docs;try{docs=records();}catch(e){$('billing-status').textContent=e.message;$('billing-create').disabled=true;return;}
  for(const id of selected)if(!quotesData.some(q=>String(q.id)===id&&eligible(q)&&!assigned(id,docs)))selected.delete(id);
  const sel=quotesData.filter(q=>selected.has(String(q.id))),identity=sel[0]&&BillingCore.customerKey(sel[0],customersData);
  renderOrganization(docs);
  const candidates=quotesData.filter(q=>eligible(q)&&!assigned(q.id,docs)&&BillingCore.inPeriod(q.QuoteDate,periodYear,periodMonth)).filter(q=>!creditOnly||/credit|เครดิต/i.test(q.PaymentMethod||'')).filter(q=>[q.ClientName,q.Title,...BillingCore.poNumbers(q,deal(q))].join(' ').toLowerCase().includes(search.toLowerCase()));
  $('billing-candidates').innerHTML=candidates.length?`<table><thead><tr><th>เลือก</th><th>ใบเสนอราคา / PO</th><th>ลูกค้า</th><th>คงเหลือ</th></tr></thead><tbody>${candidates.map(q=>{const same=!sel.length||identity&&BillingCore.customerKey(q,customersData)===identity;return `<tr><td><input type="checkbox" data-billing-select="${esc(q.id)}" aria-label="เลือก ${esc(q.Title)}" ${selected.has(String(q.id))?'checked':''} ${same?'':'disabled'}></td><td><span class="billing-number">${esc(q.Title)}</span><small>PO ${esc(BillingCore.poNumbers(q,deal(q)).join(', '))}</small></td><td>${esc(q.ClientName)}<small>${esc(q.PaymentMethod)}${same?'':' · ลูกค้าคนละราย'}</small></td><td class="billing-money">${fmt(Number(q.TotalAmount||0)-Number(q.PaidAmount||0))}</td></tr>`;}).join('')}</tbody></table>`:'<div class="billing-empty">ไม่มีรายการรอวางบิลที่ตรงเงื่อนไข<br><small>ต้องได้รับ PO มีเลข PO และยังมียอดคงเหลือ</small></div>';
  $('billing-candidates').querySelectorAll('[data-billing-select]').forEach(el=>el.onchange=()=>{const id=el.dataset.billingSelect;if(el.checked)selected.add(id);else selected.delete(id);creating=null;render();});
  const total=sel.reduce((n,q)=>n+BillingCore.cents(q.TotalAmount),0)/100,paid=sel.reduce((n,q)=>n+BillingCore.cents(q.PaidAmount),0)/100;
  $('billing-selection').innerHTML=`<div class="billing-help">เลือก ${sel.length} ใบ${sel.length?' · '+esc(sel[0].ClientName):''}</div><div class="billing-total">${fmt(total-paid)}</div><div class="billing-help">ยอดคงเหลือที่วางบิล</div><div class="billing-stat"><span>รวมยอดต้นฉบับ</span><b>${fmt(total)}</b></div><div class="billing-stat"><span>ชำระแล้ว</span><b>${fmt(paid)}</b></div><div class="billing-help">${sel.map(q=>esc(q.Title)).join('<br>')}</div>`;
  $('billing-create').disabled=busy||!sel.length;$('billing-clear').disabled=busy;renderHistory();
  if(typeof stQuoteId!=='undefined'){const q=quotesData.find(q=>String(q.id)===String(stQuoteId));if(q)refreshTracker(q);}
  $('billing-candidates').querySelectorAll('[data-billing-select]').forEach(el=>{el.disabled=el.disabled||busy;});
  for(const id of ['billing-date','billing-due','billing-note','billing-refresh'])$(id).disabled=busy;
 }
 function renderHistory(){
  if(!$('billing-history'))return;const term=$('billing-history-search').value.toLowerCase(),state=$('billing-history-state').value;
  let docs;try{docs=records().filter(visible);}catch(e){$('billing-history').textContent=e.message;return;}
  docs=docs.filter(d=>BillingCore.inPeriod(d.date,periodYear,periodMonth)&&(basket==='all'||basket==='pending'||BillingCore.workflowState(d)===basket)&&(!state||BillingCore.workflowState(d)===state)&&[d.number,d.customer?.ClientName,...d.sources.map(s=>s.poNumbers.join(' '))].join(' ').toLowerCase().includes(term)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.number).localeCompare(String(a.number)));
  $('billing-history').innerHTML=docs.length?`<table><thead><tr><th>เลขที่ / วันที่</th><th>ลูกค้า / Refer PO</th><th>ยอดวางบิล</th><th>สถานะ</th><th>เอกสาร</th></tr></thead><tbody>${docs.map(d=>`<tr><td class="billing-number">${esc(d.number)}<small>${esc(fmtDate(d.date))}</small></td><td>${esc(d.customer.ClientName)}<small>${esc(d.sources.map(s=>s.poNumbers.join(', ')).join(' / '))}</small><small>${esc(d.sources.map(s=>s.title).join(', '))}</small></td><td class="billing-money">${fmt((d.displayTotals||d.totals).balance)}</td><td>${d.status==='cancelled'?'ยกเลิก':d.status==='submitted'?'✓ วางบิลแล้ว':'ออกใบวางบิลแล้ว'}${d.status==='submitted'?`<small>วันที่ ${esc(fmtDate(d.submittedDate))}${d.receivedBy?' · '+esc(d.receivedBy):''}</small>`:''}</td><td><div class="billing-actions"><button class="btn btn-sm" data-billing-print="${esc(d.id)}">ดู / PDF</button>${d.status!=='cancelled'&&(userRoles.isAdmin||d.owner===actor())?`${BillingCore.workflowState(d)==='issued'?`<button class="btn btn-sm btn-primary" data-billing-submit="${esc(d.id)}">ยืนยันวางบิลแล้ว</button>`:''}<button class="btn btn-sm" data-billing-cancel="${esc(d.id)}">ยกเลิกใบวางบิล</button>`:''}</div></td></tr>`).join('')}</tbody></table>`:'<div class="billing-empty">ยังไม่มีใบวางบิล</div>';
  $('billing-history').querySelectorAll('[data-billing-print]').forEach(el=>el.onclick=()=>preview(el.dataset.billingPrint));$('billing-history').querySelectorAll('[data-billing-cancel]').forEach(el=>el.onclick=()=>cancel(el.dataset.billingCancel));
  $('billing-history').querySelectorAll('[data-billing-submit]').forEach(el=>el.onclick=()=>openSubmission(el.dataset.billingSubmit));
 }
 async function load(){try{if(!await syncAll())return;render();}catch(e){toast(e.message,'error');}}
 function add(id){mount();basket='pending';$('billing-history-state').value='';const q=quotesData.find(q=>String(q.id)===String(id));if(!q||!eligible(q)){toast('ต้องได้รับ PO ระบุเลข PO และมียอดคงเหลือก่อน','error');return;}let docs;try{docs=records();}catch(e){toast(e.message,'error');return;}if(/^\d{4}-\d{2}/.test(q.QuoteDate||''))setPeriod(q.QuoteDate);if(assigned(id,docs)){basket=BillingCore.workflowState(assigned(id,docs));toast('ใบนี้อยู่ในใบวางบิลแล้ว ดูได้ที่งานวางบิล','info');}else{const prior=quotesData.find(q=>selected.has(String(q.id)));if(prior&&BillingCore.customerKey(prior,customersData)!==BillingCore.customerKey(q,customersData)){toast('เลือกใบของลูกค้าเดียวกันเท่านั้น กรุณาล้างที่เลือกก่อน','error');return;}if(owner!==actor()){selected.clear();owner=actor();}selected.add(String(id));}closeModal('sale-tracker-modal');showPage('billing',document.querySelector('[data-nav-billing]'));render();}
 async function create(){
  if(busy||!selected.size)return;busy=true;render();$('billing-status').textContent='กำลังตรวจต้นฉบับและบันทึก…';const email=actor();
  try{
   const ids=[...selected];if(!creating)creating=crypto.randomUUID();const id=creating;
   const m=await getListItemsMulti([CONFIG.lists.quotations,CONFIG.lists.quoteItems,CONFIG.lists.settings,CONFIG.lists.customers],{strict:true});
   if(actor()!==email)throw Error('บัญชีเปลี่ยน กรุณาเปิดงานวางบิลใหม่');
   for(const l of [CONFIG.lists.quotations,CONFIG.lists.quoteItems,CONFIG.lists.settings,CONFIG.lists.customers])if(!Array.isArray(m[l]))throw Error('โหลดข้อมูลไม่ครบ กรุณาลองใหม่');
   const docs=records(m[CONFIG.lists.settings]),existing=docs.find(d=>d.id===id);
   if(existing){selected.clear();creating=null;basket=BillingCore.workflowState(existing);setPeriod(existing.date);await syncAll();render();preview(id);return;}
   const available=filterQuotesForUser(m[CONFIG.lists.quotations],m[CONFIG.lists.settings]);const quotes=ids.map(id=>available.find(q=>String(q.id)===id));
   if(quotes.some(q=>!q||!allowed(q)))throw Error('ไม่มีสิทธิ์หรือไม่พบต้นฉบับบางใบ');
   const day=$('billing-date').value,due=$('billing-due').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||due&&due<day)throw Error('วันที่วางบิลหรือกำหนดชำระไม่ถูกต้อง');
   const settings=m[CONFIG.lists.settings];
   const d=BillingCore.build({quotes,items:m[CONFIG.lists.quoteItems],profiles:m[CONFIG.lists.customers],documents:docs,id,date:day,dueDate:due,owner:email,note:$('billing-note').value.trim(),dealFor:q=>deal(q,settings),extraFor:q=>{const x=settings.find(r=>r.Title==='QuoteItemExtra_'+q.id);return x?JSON.parse(x.Value):[];}});
   const value=JSON.stringify(d);if(value.length>45000)throw Error('รายการยาวเกินขนาดเอกสาร กรุณาแบ่งใบวางบิล');
   // A stable id makes retries after an uncertain response reuse the same document.
   const saved=await createListItem(CONFIG.lists.settings,{Title:key(id),Value:value});
   if(actor()!==email)return;
   _settingsCache=(_settingsCache||[]).filter(r=>r.Title!==key(id));_settingsCache.push({id:saved.id,Title:key(id),Value:value,_srcList:CONFIG.lists.settings});
   selected.clear();creating=null;basket='issued';setPeriod(d.date);$('billing-history-state').value='';$('billing-status').textContent='บันทึก '+d.number+' แล้ว';render();preview(id);
  }catch(e){$('billing-status').textContent=e.message;toast('สร้างใบวางบิลไม่สำเร็จ: '+e.message,'error');}finally{busy=false;if(actor()===email)render();}
 }
 function preview(id){try{
  const record=(_settingsCache||[]).find(r=>r.Title===key(id));if(!record)throw Error('ไม่พบเอกสาร');
  const d=JSON.parse(record.Value);if(!visible(d))throw Error('ไม่มีสิทธิ์ดูเอกสาร');
  const clone=v=>JSON.parse(JSON.stringify(v)),email=actor();let baseValue=record.Value,saving=false;
  const state={docManual:clone(d.layout||{on:true,rows:d.rows,breaks:d.rows.flatMap((r,i)=>i>0&&i%14===13?[i]:[])}),docReferNote:{billing:d.layoutNote??d.note??''}};state.docManual.on=true;
  let baseline=JSON.stringify(state);
  function totals(){return BillingCore.layoutTotals(d,state.docManual.rows);}
  function build(copy){const effective={...d,totals:totals(),note:state.docReferNote.billing},q={...d.customer,Title:d.number,PaymentDueDate:d.dueDate,_billing:effective};return buildCustomerDocHTML('billing',copy==='billingcopy'?'billingcopy':'billingoriginal',q,[],{poNumber:[...new Set(d.sources.flatMap(s=>s.poNumbers))].join(', ')},companySettings,state.docManual,state.docReferNote.billing);}
  const session={state,seedRows:()=>clone(d.rows),isDirty:()=>JSON.stringify(state)!==baseline,build,buildBoth:()=>BillingCore.copiesHTML(build('customer'),build('billingcopy')),
   warning:()=>{const t=totals(),changed=BillingCore.cents(t.total)!==BillingCore.cents(d.totals.total);return '<span style="color:'+(changed?'#b91c1c':'#15803d')+'">รวมสุทธิ '+esc(fmt(t.total))+' · คงเหลือ '+esc(fmt(t.balance))+(changed?' · ยอดต่างจากต้นฉบับ '+esc(fmt(d.totals.total))+' (ปรับเฉพาะใบวางบิล)':' · ยอดตรงกับต้นฉบับ')+'</span>';},
   save:async()=>{
    if(saving)throw Error('กำลังบันทึก');if(email!==actor()||!(userRoles.isAdmin||d.owner===email))throw Error('ไม่มีสิทธิ์บันทึกเอกสาร');
    const t=totals();if(t.net<0||t.balance<0)throw Error('ยอดเอกสารต้องไม่น้อยกว่า 0 หรือยอดที่ชำระแล้ว');
    const edit=JSON.stringify(state);saving=true;
    try{const fresh=await getListItems(CONFIG.lists.settings),r=fresh.find(r=>r.Title===key(id));if(!r||actor()!==email)throw Error('ไม่พบเอกสารหรือบัญชีเปลี่ยน');if(r.Value!==baseValue)throw Error('มีการแก้ไขเอกสารจากที่อื่น กรุณาปิดและรีเฟรชก่อนจัดหน้าใหม่');
     const saved=JSON.parse(r.Value);if(saved.status==='cancelled')throw Error('ใบวางบิลถูกยกเลิกแล้ว');const captured=JSON.parse(edit);saved.layout=captured.docManual;saved.layoutNote=captured.docReferNote.billing;saved.displayTotals=BillingCore.layoutTotals(d,captured.docManual.rows);saved.layoutUpdatedAt=new Date().toISOString();
     const value=JSON.stringify(saved);if(value.length>45000)throw Error('รายการยาวเกินขนาดเอกสาร กรุณาลดข้อความ');await updateListItem(CONFIG.lists.settings,r.id,{Value:value});baseValue=value;baseline=edit;if(actor()!==email)return;
     const cached=(_settingsCache||[]).find(r=>r.Title===key(id));if(cached)cached.Value=value;renderHistory();
    }finally{saving=false;}
   }
  };
  openCDPreview('billing','customer',session);
 }catch(e){toast(e.message,'error');}}
 async function cancel(id){if(busy)return;const d=records().find(d=>d.id===id);if(!d||!visible(d)||!(userRoles.isAdmin||d.owner===actor()))return;if(!confirm('ยกเลิกใบวางบิล '+d.number+'? ใบเสนอราคาและการชำระเงินยังคงเดิม'))return;busy=true;const email=actor();try{const list=await getListItems(CONFIG.lists.settings),r=list.find(r=>r.Title===key(id));if(!r||actor()!==email)throw Error('ไม่พบเอกสารหรือบัญชีเปลี่ยน');const fresh=JSON.parse(r.Value);if(!(userRoles.isAdmin||fresh.owner===email))throw Error('ไม่มีสิทธิ์');fresh.status='cancelled';fresh.cancelledAt=new Date().toISOString();await updateListItem(CONFIG.lists.settings,r.id,{Value:JSON.stringify(fresh)});if(actor()!==email)return;const cached=(_settingsCache||[]).find(r=>r.Title===key(id));if(cached)cached.Value=JSON.stringify(fresh);render();toast('ยกเลิกใบวางบิลแล้ว','success');}catch(e){toast(e.message,'error');}finally{busy=false;}}
 return {render,load,add,preview,status,buttonHtml,refreshTracker};
})();
