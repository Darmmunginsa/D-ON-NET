const CustomerHistory=(()=>{
 const $=id=>document.getElementById(id),C=CustomerHistoryCore;
 let version=0,busy=false,profiles=[],history=[],settings=[],identity=null,source=null,sourceRows=[],sourceExtras=[],owner='',fingerprint='',returnFocus=null;
 const form=()=>({name:$('q-client')?.value||'',tax:$('q-cust-taxid')?.value||''});
 const stamp=()=>JSON.stringify([currentUser?.email||'',form().name,form().tax,String(typeof editingQuoteId!=='undefined'?editingQuoteId||'':'')]);
 const visible=()=>$('page-newquote')?.classList.contains('active');
 const same=()=>visible()&&currentUser?.email===owner&&stamp()===fingerprint;
 function status(text){$('customer-history-status').textContent=text;}
 function clear(){identity=null;history=[];source=null;sourceRows=[];sourceExtras=[];$('customer-history-profile').replaceChildren();$('customer-history-quotes').replaceChildren();$('customer-history-items').replaceChildren();$('customer-history-summary').textContent='';}
 function close(restore=true){version++;busy=false;clear();$('customer-history-drawer').hidden=true;$('customer-history-toggle').setAttribute('aria-expanded','false');if(restore&&returnFocus?.isConnected)returnFocus.focus();}
 function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
 function setting(key){return settings.find(r=>r.Title===key)?.Value||'';}
 function outcome(q){
   if(settings.some(r=>{if(!String(r.Title||'').startsWith('QuoteMerge_v1_'))return false;try{const m=JSON.parse(r.Value);return m.committed&&(m.sourceIds||[]).map(String).includes(String(q.id));}catch(_){return false;}}))return 'skip';
   if(typeof _srClassify==='function')return _srClassify({...q,DealStatus:setting('DealStatus_'+q.id)||q.DealStatus});
   return 'progress';
 }
 async function open(){
   if(!visible()||!currentUser)return;if(typeof closeCatalogDrawer==='function')closeCatalogDrawer(false);returnFocus=document.activeElement;$('customer-history-drawer').hidden=false;$('customer-history-toggle').setAttribute('aria-expanded','true');$('customer-history-close').focus();await refresh();
 }
 async function refresh(){
   const run=++version;clear();$('customer-history-search').value='';owner=currentUser?.email||'';fingerprint=stamp();busy=true;status('กำลังโหลดประวัติลูกค้า…');
   try{
     const L=CONFIG.lists,data=await getListItemsMulti([L.customers,L.quotations,L.settings]);
     if(run!==version||!same())return;
     settings=data[L.settings];if(!Array.isArray(settings)||!Array.isArray(data[L.quotations])||!Array.isArray(data[L.customers]))throw Error('ข้อมูลประวัติไม่ครบ กรุณาลองใหม่');
     let en={};try{en=JSON.parse(setting('CustomerDocEN')||'{}');}catch(_){}
     profiles=data[L.customers].map(p=>({...p,nameEN:en[String(p.id)]?.nameEN||''}));identity=C.resolve(form(),profiles);
     if(!identity){status('เลือกลูกค้าจากทะเบียน หรือระบุชื่อและเลขผู้เสียภาษีให้ตรงกันก่อนดูประวัติ');return;}
     const allowed=filterQuotesForUser(data[L.quotations],settings);
     history=allowed.filter(q=>String(q.id)!==String(editingQuoteId||'')&&C.matches(q,identity,profiles)).filter(q=>outcome(q)!=='skip').sort((a,b)=>String(b.QuoteDate||'').localeCompare(String(a.QuoteDate||''))||String(b.Title||'').localeCompare(String(a.Title||'')));
     render();status('แสดงเฉพาะใบเสนอราคาที่บัญชีนี้มีสิทธิ์เห็น · ดึงรายการได้โดยไม่เปลี่ยนต้นฉบับ');
   }catch(e){if(run===version&&same()){clear();status('โหลดประวัติไม่สำเร็จ: '+e.message);}}
   finally{if(run===version)busy=false;}
 }
 function render(){
   const p=identity.profile,profile=$('customer-history-profile');profile.replaceChildren();profile.appendChild(text('h3',p?.Title||identity.name));
   for(const value of [p?.TaxID?'เลขภาษี '+p.TaxID:identity.tax?'เลขภาษี '+identity.tax:'',p?.ContactPerson?'ผู้ติดต่อ '+p.ContactPerson:'',p?.Phone?'โทร '+p.Phone:'',p?.Email,p?.Address])if(value)profile.appendChild(text('p',value));
   const counts={win:0,lose:0,progress:0};history.forEach(q=>{const s=outcome(q);if(s in counts)counts[s]++;});
   $('customer-history-summary').textContent='Win '+counts.win+' · Lose '+counts.lose+' · กำลังดำเนินการ '+counts.progress+' · รวม '+history.length+' ใบ';
   renderQuotes();
 }
 function renderQuotes(){
   const host=$('customer-history-quotes');host.replaceChildren();const search=$('customer-history-search').value.trim().toLowerCase();
   const rows=history.filter(q=>!search||String(q.Title||'').toLowerCase().includes(search));
   if(!rows.length){host.appendChild(text('p','ไม่พบใบเสนอราคาเก่าที่ตรงกับลูกค้านี้','history-empty'));return;}
   for(const q of rows){
     const card=document.createElement('article');card.className='history-quote';
     card.appendChild(text('strong',q.Title||'ไม่มีเลขใบเสนอราคา'));
     const s=outcome(q);card.appendChild(text('span',({win:'Win · ปิดการขาย',lose:'Lose · ยกเลิก',progress:'กำลังดำเนินการ'})[s]||s,'history-badge history-'+s));
     card.appendChild(text('p',(q.QuoteDate?fmtDate(q.QuoteDate):'ไม่ระบุวันที่')+' · '+fmt(q.TotalAmount||0)));
     if(s==='lose'){const reason=setting('LoseReason_'+q.id)||setting('CancelReason_'+q.id);if(reason)card.appendChild(text('p','เหตุผล: '+reason));}
     const details=document.createElement('button');details.type='button';details.className='btn btn-sm';details.textContent='ดูรายการ / เลือกดึง';details.onclick=()=>loadItems(q.id);card.appendChild(details);
     const pdf=document.createElement('button');pdf.type='button';pdf.className='btn btn-sm';pdf.textContent='ดูใบเสนอราคา';pdf.onclick=()=>{if(!same())return invalidate();if(!(quotesData||[]).some(x=>String(x.id)===String(q.id)))return status('กด Sync เพื่อโหลดใบเสนอราคานี้ก่อนดู PDF โดยยังไม่ต้องบันทึกร่าง');showPDFForQuote(q.id);};card.appendChild(pdf);host.appendChild(card);
   }
 }
 async function loadItems(id){
   if(!same())return invalidate();const run=++version,snapshot=stamp();busy=true;source=null;sourceRows=[];$('customer-history-items').replaceChildren();status('กำลังโหลดรายการในใบเสนอราคา…');
   try{
     const L=CONFIG.lists,data=await getListItemsMulti([L.quotations,L.quoteItems,L.settings]);
     if(run!==version||!same()||stamp()!==snapshot)return;
     const allowed=filterQuotesForUser(data[L.quotations],data[L.settings]),q=allowed.find(q=>String(q.id)===String(id));
     if(!q||!C.matches(q,identity,profiles))throw Error('ข้อมูลลูกค้าหรือสิทธิ์ต้นฉบับเปลี่ยน กรุณาโหลดประวัติใหม่');
     settings=data[L.settings];if(outcome(q)==='skip')throw Error('ต้นฉบับถูกรวมกับใบอื่นแล้ว กรุณาโหลดประวัติใหม่');
     let extras=[];const raw=setting('QuoteItemExtra_'+id);if(raw){extras=JSON.parse(raw);if(!Array.isArray(extras))throw Error('ข้อมูลเสริมต้นฉบับไม่ถูกต้อง');}
     source=q;sourceRows=data[L.quoteItems].filter(r=>String(r.QuoteID)===String(id));sourceExtras=extras;renderItems();status('ใช้ราคาต่อหน่วยและส่วนลดรายรายการเดิม · ไม่ดึงส่วนลดท้ายบิล · ค่าเดินทางเดิมจะถูกนำออกให้คำนวณใหม่');
   }catch(e){if(run===version&&same()){source=null;status('โหลดรายการไม่สำเร็จ: '+e.message);}}
   finally{if(run===version)busy=false;}
 }
 function renderItems(){
   const host=$('customer-history-items');host.replaceChildren();host.appendChild(text('h3','รายการจาก '+source.Title));let count=0;
   sourceRows.forEach((row,index)=>{
     const item=C.toItem(row,sourceExtras[index],index);if(!item)return;count++;
     const label=document.createElement('label');label.className='history-item';const cb=document.createElement('input');cb.type='checkbox';cb.value=String(index);cb.className='history-item-choice';label.appendChild(cb);
     const content=document.createElement('span');content.appendChild(text('strong',item.name));content.appendChild(text('small','จำนวน '+item.qty+' '+item.unit+' · ราคา/หน่วย '+(isNumeric(item.price)?fmt(item.price):String(item.price))+(item.disc?' · ลด '+item.disc+'%':'')));if(item.desc)content.appendChild(text('small',item.desc));label.appendChild(content);host.appendChild(label);
   });
   if(!count)return host.appendChild(text('p','ไม่มีรายการสินค้า/บริการที่ดึงได้','history-empty'));
   const actions=document.createElement('div');actions.className='history-import-actions';const all=document.createElement('button');all.type='button';all.className='btn btn-sm';all.textContent='เลือกทั้งหมด';all.onclick=()=>host.querySelectorAll('.history-item-choice').forEach(cb=>cb.checked=true);actions.appendChild(all);
   const add=document.createElement('button');add.type='button';add.className='btn btn-primary btn-sm';add.textContent='เพิ่มรายการที่เลือกในฉบับปัจจุบัน';add.onclick=importSelected;actions.appendChild(add);host.appendChild(actions);
 }
 function importSelected(){
   if(busy||!source)return;if(!same())return invalidate();
   if(editingQuoteId){const q=(quotesData||[]).find(q=>String(q.id)===String(editingQuoteId));if(!q||!canEditQuote(q)||['Pending','Cancelled','Closed','PO Received'].includes(q.Status))return status('ใบเสนอราคาปัจจุบันไม่พร้อมแก้ไข');}
   if(!C.matches(source,identity,profiles))return invalidate();
   const chosen=[...$('customer-history-items').querySelectorAll('.history-item-choice:checked')].map(cb=>Number(cb.value));if(!chosen.length)return status('เลือกรายการที่ต้องการดึงก่อน');
   try{const items=chosen.map(i=>C.toItem(sourceRows[i],sourceExtras[i],_nextItemId())).filter(Boolean);quoteItems.push(...items);renderItemsInQuote();status('เพิ่ม '+items.length+' รายการจาก '+source.Title+' แล้ว ยังไม่บันทึกลงระบบ');$('customer-history-items').querySelectorAll('.history-item-choice').forEach(cb=>cb.checked=false);}catch(e){status(e.message);}
 }
 function renderItemsInQuote(){renderItemsGlobal();}
 // Keep the editor renderer independent from this drawer's item-list renderer.
 function renderItemsGlobal(){window.renderItems();}
 function invalidate(){version++;busy=false;clear();status('ข้อมูลลูกค้า บัญชี หรือฉบับที่แก้ไขเปลี่ยนแล้ว กดโหลดประวัติใหม่');}
 function changed(){if(!$('customer-history-drawer').hidden&&stamp()!==fingerprint)invalidate();}
 function init(){
   $('customer-history-toggle').onclick=()=>{$('customer-history-drawer').hidden?open():close();};$('customer-history-close').onclick=()=>close();$('customer-history-refresh').onclick=refresh;$('customer-history-search').oninput=()=>{if(same())renderQuotes();else invalidate();};
   for(const id of ['q-client','q-cust-taxid'])for(const event of ['input','change'])$(id).addEventListener(event,changed);
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('customer-history-drawer').hidden)close();});
   new MutationObserver(()=>{if(!visible())close(false);}).observe($('page-newquote'),{attributes:true,attributeFilter:['class']});
   document.addEventListener('click',()=>{if(!$('customer-history-drawer').hidden&&!same())invalidate();});
 }
 init();return {open,close,refresh,loadItems,importSelected};
})();
