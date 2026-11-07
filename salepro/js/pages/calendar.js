const SaleCalendar=(()=>{
 const C=WorkCalendar,$=id=>document.getElementById(id),esc=s=>escHtml(String(s??''));
 let data={events:[],missing:{},problems:[]},sourceQuotes=[],sourceContracts=[],sourceSettings=[],month='',selected='',turn=0,dataUser='',loading=false,dragItem=null;
 const today=()=>C.date(new Date().toISOString());
 const label=d=>new Date(d+'T12:00:00Z').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'});
 const monthLabel=m=>new Date(m+'-01T12:00:00Z').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',month:'long',year:'numeric'});
 function capacity(){const n=Number($('cal-capacity').value);return Number.isInteger(n)&&n>0?n:0;}
 function filtered(){const types=new Set([...document.querySelectorAll('[data-cal-type]:checked')].map(x=>x.value)),query=$('cal-search').value.trim().toLowerCase(),owner=$('cal-owner').value,done=$('cal-done').checked;return data.events.filter(e=>types.has(e.type)&&(done||!e.done)&&(!owner||e.owner===owner)&&(!query||[e.title,e.client,e.ref,e.owner,e.detail].join(' ').toLowerCase().includes(query)));}
 function render(){
  if(typeof QueuePlanner!=='undefined')QueuePlanner.renderAnalysis(selected);
  const list=filtered(),visible=list.filter(e=>e.date.startsWith(month)),cap=capacity();$('cal-month-label').textContent=monthLabel(month);$('cal-month').value=month;
  $('cal-summary').innerHTML=Object.entries(C.labels).map(([type,title])=>`<div class="cal-stat cal-${type}"><span>${title}</span><strong>${visible.filter(e=>e.type===type).length}</strong></div>`).join('');
  const grid=$('cal-grid');grid.replaceChildren();for(const day of ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.']){const h=document.createElement('div');h.className='cal-weekday';h.textContent=day;grid.appendChild(h);}
  const first=new Date(month+'-01T12:00:00Z'),start=new Date(first);start.setUTCDate(1-first.getUTCDay());const last=new Date(first);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);const cells=Math.ceil((first.getUTCDay()+last.getUTCDate())/7)*7;
  for(let i=0;i<cells;i++){const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);const key=d.toISOString().slice(0,10),items=list.filter(e=>e.date===key),n=C.count(items);const button=document.createElement('button');button.type='button';button.dataset.date=key;button.className='cal-day'+(!key.startsWith(month)?' cal-outside':'')+(key===selected?' cal-selected':'')+(key===today()?' cal-today':'')+(cap&&n.field>cap?' cal-busy':'');button.setAttribute('aria-label',label(key)+` งานหน้างาน ${n.field} รายการอื่น ${n.other}`);button.setAttribute('aria-pressed',String(key===selected));button.innerHTML=`<span class="cal-number">${d.getUTCDate()}</span><span class="cal-field">หน้างาน ${n.field}</span><small>อื่น ๆ ${n.other}</small>`+items.slice(0,2).map(e=>`<span class="cal-mini cal-${e.type}">${esc(C.labels[e.type])}</span>`).join('')+(items.length>2?`<small>+${items.length-2} รายการ</small>`:'');button.onclick=()=>{selected=key;if(!key.startsWith(month))month=key.slice(0,7);render();};
   button.ondragover=e=>{if(dragItem){e.preventDefault();e.dataTransfer.dropEffect='move';button.classList.add('cal-drop');}};
   button.ondragleave=()=>button.classList.remove('cal-drop');
   button.ondrop=e=>{e.preventDefault();button.classList.remove('cal-drop');const it=dragItem;dragItem=null;if(!it)return;QueuePlanner.open(it.quoteId,it.mode==='queue'?it.event:null,{presetDate:key});};
   grid.appendChild(button);}
  const dayItems=list.filter(e=>e.date===selected),counts=C.count(dayItems),clashes=C.collisions(data.events);
  $('cal-day-heading').textContent=label(selected);$('cal-day-count').textContent=`งานหน้างานที่ยังไม่เสร็จ ${counts.field} · รายการอื่น ${counts.other}`+(cap&&counts.field>cap?' · เกินเกณฑ์คิวที่ตั้งไว้':'');
  $('cal-agenda').replaceChildren();
  for(const event of dayItems){const card=document.createElement('article');card.className='cal-event cal-'+event.type;card.innerHTML=`<div><span class="cal-tag">${esc(C.labels[event.type])}</span> <strong>${esc(event.time||'ไม่ระบุเวลา')}</strong>${event.done?' · เสร็จแล้ว':''}</div><h4>${esc(event.title)}</h4><p>${esc(event.client)} · ${esc(event.ref)}</p><p>ผู้รับผิดชอบ: ${esc(event.owner||'ยังไม่ระบุ')}</p>${event.status?`<p>สถานะ: ${esc(({planned:'รอนัดยืนยัน',scheduled:'นัดแล้ว',assigned:'รอรับงาน',accepted:'รับงานแล้ว',inprogress:'กำลังดำเนินการ',completed:'เสร็จแล้ว'})[event.status]||event.status)}</p>`:''}${event.amount!=null?`<p>ยอดคงเหลือ ${esc(fmt(event.amount))} บาท</p>`:''}${event.detail?`<p class="cal-detail">${esc(event.detail)}</p>`:''}${clashes.has(event.id)?'<p class="cal-warning">ช่างคนเดียวกันมีนัดเวลาเริ่มตรงกัน กรุณาตรวจคิว</p>':''}`;const open=document.createElement('button');open.type='button';open.className='btn btn-sm';open.textContent='เปิดรายการต้นทาง';open.disabled=loading;open.onclick=()=>openSource(event);card.appendChild(open);if(event.source==='queue'){const edit=document.createElement('button');edit.type='button';edit.className='btn btn-sm';edit.textContent='เลื่อน / แก้ไขนัด';edit.dataset.queueQuote=String(event.quoteId);edit.disabled=loading||!QueuePlanner.can(sourceQuotes.find(q=>String(q.id)===String(event.quoteId)));edit.onclick=()=>QueuePlanner.open(event.quoteId,event);card.appendChild(edit);const send=document.createElement('button');send.type='button';send.className='btn btn-sm btn-primary';send.textContent='ส่งงานให้ช่าง';send.dataset.queueQuote=String(event.quoteId);send.disabled=edit.disabled;send.onclick=()=>QueueDispatch.open(event);card.appendChild(send);
   card.draggable=!loading&&!edit.disabled;card.title='ลากไปวางบนวันอื่นเพื่อเลื่อนนัด';card.ondragstart=e=>{dragItem={mode:'queue',quoteId:event.quoteId,event};e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(event.quoteId));}catch(_){}};card.ondragend=()=>{dragItem=null;};}$('cal-agenda').appendChild(card);}
  if(!dayItems.length)$('cal-agenda').textContent='ไม่มีรายการตามตัวกรองในวันนี้';
  const missing=Object.entries(data.missing).filter(([,n])=>n).map(([type,n])=>C.labels[type]+' '+n).join(' · ');$('cal-missing').textContent=(missing?'ยังไม่ระบุวันนัด / วันไม่ถูกต้อง: '+missing+' รายการ — จึงยังไม่ลงในปฏิทิน':'')+(data.problems.length?' · ข้อมูลบางรายการอ่านไม่ครบ '+data.problems.length+' รายการ':'');
  renderPending();
 }
 // ใบที่ได้รับ PO แล้ว แต่ยังไม่มีนัดในปฏิทิน (ลอยรอจัดคิว)
 function pendingPOQuotes(){
  const scheduled=new Set(data.events.filter(e=>e.type==='install'||e.type==='service').map(e=>String(e.quoteId)));
  return sourceQuotes.filter(q=>{
   if(q.Status!=='PO Received'||scheduled.has(String(q.id)))return false;
   try{if(typeof parseDealStatus==='function'&&parseDealStatus(q.DealStatus).closed)return false;}catch(_){}
   return true;
  });
 }
 function renderPending(){
  const host=$('cal-pending');if(!host)return;
  const list=pendingPOQuotes();
  if(!list.length){host.style.display='none';host.replaceChildren();return;}
  host.style.display='';
  host.innerHTML=`<div class="cal-pending-head">📦 งานรอจัดคิว (ได้รับ PO แล้ว) <b>${list.length}</b> งาน <span>ลากการ์ดไปวางบนวันในปฏิทิน หรือกด “จัดลงปฏิทิน” เพื่อกำหนดเวลา — เลื่อนวันได้อิสระ</span></div><div class="cal-pending-row" id="cal-pending-row"></div>`;
  const row=$('cal-pending-row');
  list.forEach(q=>{
   const canDo=!loading&&QueuePlanner.can(q);
   const card=document.createElement('div');card.className='cal-pending-card';card.draggable=canDo;card.title=canDo?'ลากไปวางบนวันในปฏิทินเพื่อจัดคิว':'ไม่มีสิทธิ์จัดคิวของใบนี้';
   card.innerHTML=`<div class="cpc-client">${esc(q.ClientName||'-')}</div><div class="cpc-ref">${esc(q.Title||'(ยังไม่ออกเลข)')}</div>`+(q.TotalAmount?`<div class="cpc-amt">${esc(fmt(q.TotalAmount))} บาท</div>`:'');
   const btn=document.createElement('button');btn.type='button';btn.className='btn btn-sm btn-primary';btn.textContent='📅 จัดลงปฏิทิน';btn.disabled=!canDo;btn.onclick=()=>QueuePlanner.open(q.id);card.appendChild(btn);
   card.ondragstart=e=>{dragItem={mode:'pending',quoteId:q.id};e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(q.id));}catch(_){}};
   card.ondragend=()=>{dragItem=null;};
   row.appendChild(card);
  });
 }
 async function load(){
  const request=++turn,user=currentUser?.email;if(!user){$('cal-status').textContent='กรุณาเข้าสู่ระบบ';return;}if(!month){selected=today();month=selected.slice(0,7);}
  loading=true;if(dataUser!==user){QueuePlanner.invalidate();data={events:[],missing:{},problems:[]};sourceQuotes=[];sourceContracts=[];sourceSettings=[];dataUser=user;render();}for(const b of document.querySelectorAll('#cal-agenda button'))b.disabled=true;$('cal-refresh').disabled=true;$('cal-status').textContent='กำลังโหลดวันนัด…';
  try{const L=CONFIG.lists,names=[L.quotations,L.settings,L.contracts];let result;if(typeof getListItemsMulti==='function')result=await getListItemsMulti(names);else{const rows=await Promise.all(names.map(name=>getListItems(name)));result=Object.fromEntries(names.map((name,i)=>[name,rows[i]]));}
   if(request!==turn||currentUser?.email!==user)return;
   for(const name of names)if(!Array.isArray(result[name]))throw Error('ข้อมูล '+name+' มาไม่ครบ');
   const quotes=filterQuotesForUser(result[L.quotations]);let malformed=0;const contracts=result[L.contracts].flatMap(row=>{try{return [{...JSON.parse(row.Value||'{}'),spId:row.id}];}catch{malformed++;return [];}});
   sourceQuotes=quotes;sourceContracts=contracts;sourceSettings=result[L.settings];const next=C.collect(quotes,contracts,sourceSettings);if(JSON.stringify(data.events)!==JSON.stringify(next.events))QueuePlanner.invalidate();data=next;for(let i=0;i<malformed;i++)data.problems.push('ข้อมูลสัญญาอ่านไม่ได้');
   const chosen=$('cal-owner').value;$('cal-owner').replaceChildren(new Option('ผู้รับผิดชอบทุกคน',''));for(const name of [...new Set(data.events.map(e=>e.owner).filter(Boolean))].sort())$('cal-owner').add(new Option(name,name));if([...$('cal-owner').options].some(o=>o.value===chosen))$('cal-owner').value=chosen;
   render();$('cal-status').textContent='อัปเดต '+new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' · แสดงตามสิทธิ์การเข้าถึงเดิม';
  }catch(e){if(request===turn){$('cal-status').textContent='โหลดไม่สำเร็จ: '+e.message+' · กรุณากดโหลดใหม่ ข้อมูลเดิมที่แสดงยังไม่ได้อัปเดต';}}finally{if(request===turn){loading=false;$('cal-refresh').disabled=false;for(const b of document.querySelectorAll('#cal-agenda button'))b.disabled=!!b.dataset.queueQuote&&!QueuePlanner.can(sourceQuotes.find(q=>String(q.id)===b.dataset.queueQuote));}}
 }
 function openSource(event){
  if(loading)return;
  if(event.source==='queue'){QueuePlanner.open(event.quoteId,event);return;}
  if(event.source==='contract'){const c=sourceContracts.find(c=>String(c.spId)===String(event.contractId));if(!c)return;const index=contractsData.findIndex(x=>String(x.spId)===String(c.spId));if(index>=0)contractsData[index]=c;else contractsData.push(c);editContract(c.spId);return;}
  const source=sourceQuotes.find(q=>String(q.id)===String(event.quoteId));if(!source)return;const row=sourceSettings.find(r=>r.Title==='DealStatus_'+source.id);const q={...source,DealStatus:row?.Value||source.DealStatus};const i=quotesData.findIndex(x=>String(x.id)===String(q.id));if(i>=0)quotesData[i]=q;else quotesData.push(q);
 if(row){const index=_settingsCache.findIndex(r=>r.Title===row.Title);if(index>=0)_settingsCache[index]=row;else _settingsCache.push(row);}
  openSaleTrackerModal(q.id);switchSTTab(event.type==='install'?'tech':event.type==='payment'?'payment':'expiry',null);
 }
 function init(){
  pageTitles.calendar='ปฏิทินคิวงาน';const page=document.createElement('section');page.id='page-calendar';page.className='page';page.innerHTML=`<button type="button" class="btn cal-mobile-back">← เมนู SalePro</button><h2>ปฏิทินคิวงาน</h2><p class="cal-help">รวมวันนัดที่บันทึกแล้ว · งานช่าง/ติดตั้ง · นัดชำระเงิน · วันหมดอายุ · รอบ PM / MA</p><div class="cal-toolbar"><button type="button" class="btn" id="cal-prev" aria-label="เดือนก่อน">‹</button><h3 id="cal-month-label"></h3><button type="button" class="btn" id="cal-next" aria-label="เดือนถัดไป">›</button><button type="button" class="btn" id="cal-today">วันนี้</button><input id="cal-month" type="month" aria-label="เลือกเดือน"><button type="button" class="btn" id="cal-refresh">โหลดใหม่</button></div><div class="cal-filters">${Object.entries(C.labels).map(([type,label])=>`<label><input type="checkbox" data-cal-type value="${type}" checked> ${label}</label>`).join('')}<label><input id="cal-done" type="checkbox"> รวมงานเสร็จแล้ว</label><input id="cal-search" type="search" placeholder="ค้นหาลูกค้า / เลขเอกสาร / ช่าง" aria-label="ค้นหารายการ"><select id="cal-owner" aria-label="ผู้รับผิดชอบ"><option value="">ผู้รับผิดชอบทุกคน</option></select><label>เกณฑ์งานหน้างาน / วัน <input id="cal-capacity" type="number" min="1" max="999" placeholder="ไม่กำหนด"></label></div><p class="cal-help">จำนวนตามตัวกรองที่เลือก · งานหน้างานนับตามรายการนัดติดตั้งและรอบ PM/MA ที่ยังไม่เสร็จ ไม่รวมกำหนดชำระและหมดอายุ · วิเคราะห์คิวได้จากปุ่มด้านล่าง โดยต้องตรวจข้อจำกัดของเวลาและที่อยู่</p><p id="cal-status" role="status"></p><p id="cal-missing" class="cal-warning"></p><div id="cal-summary"></div><div id="cal-pending" style="display:none"></div><div class="cal-layout"><div id="cal-grid" aria-label="ปฏิทินรายเดือน"></div><section class="cal-day-panel"><h3 id="cal-day-heading"></h3><p id="cal-day-count"></p><div id="cal-agenda"></div><section class="queue-analysis-box"><h3>ความเป็นไปได้ของคิววันนี้</h3><p>ใช้ข้อมูลหน้างานเท่าที่มี Google Maps คำนวณเส้นทาง และ AI สรุปข้อจำกัด ไม่เปลี่ยนนัดอัตโนมัติ</p><label>เริ่มออกเดินทาง <input id="queue-start" type="time" value="08:00"></label><label>จบวันทำงาน <input id="queue-end" type="time" value="18:00"></label><label>เวลาเผื่อระหว่างงาน (นาที)<input id="queue-buffer" type="number" min="0" max="120" value="0"></label><button type="button" class="btn btn-primary" id="queue-analyze">วิเคราะห์เส้นทางและคิววันนี้</button><div id="queue-analysis" role="status"></div></section></section></div>`;
  $('page-dashboard').parentElement.appendChild(page);const nav=document.createElement('div');nav.className='nav-item';nav.textContent='▦ ปฏิทินคิวงาน';nav.onclick=()=>showPage('calendar',nav);document.querySelector('.nav-group').appendChild(nav);
  for(const id of ['sale-tracker-modal','contract-modal']){const modal=$(id);if(!modal)continue;let wasOpen=modal.classList.contains('open');new MutationObserver(()=>{const isOpen=modal.classList.contains('open');if(wasOpen&&!isOpen&&page.classList.contains('active'))load();wasOpen=isOpen;}).observe(modal,{attributes:true,attributeFilter:['class']});}
  page.querySelector('.cal-mobile-back').onclick=()=>showPage('dashboard');$('cal-refresh').onclick=load;$('queue-analyze').onclick=()=>QueuePlanner.analyze(selected);for(const id of ['queue-start','queue-end','queue-buffer'])$(id).onchange=()=>{QueuePlanner.invalidate();QueuePlanner.renderAnalysis(selected);};
  for(const [id,delta] of [['cal-prev',-1],['cal-next',1]])$(id).onclick=()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);month=d.toISOString().slice(0,7);selected=month+'-01';render();};
  $('cal-today').onclick=()=>{selected=today();month=selected.slice(0,7);render();};$('cal-month').onchange=()=>{if(/^\d{4}-\d{2}$/.test($('cal-month').value)){month=$('cal-month').value;selected=month+'-01';render();}};
  for(const el of page.querySelectorAll('.cal-filters input,.cal-filters select'))el.addEventListener('input',()=>{if(month)render();});
 }
 document.addEventListener('DOMContentLoaded',init);return {load,async selectDate(date){selected=date;month=date.slice(0,7);showPage('calendar');await load();}};
})();
