// Only Draft snapshots are queued. Financial/approval writes remain online operations.
const LocalFirst=(()=>{
 let engine=null,account='',generation=0,groups=[],active=null,dirty=false,saving=Promise.resolve(),syncing=false,error='',lastSync='',restoring=false,initializing=null,syncTask=null,cacheTail=Promise.resolve(),localWrites=0;
 const $=id=>document.getElementById(id),clone=v=>JSON.parse(JSON.stringify(v)),uuid=()=>crypto.randomUUID();
 const fields=()=>Object.fromEntries([...$('page-newquote').querySelectorAll('input[id],select[id],textarea[id]')].filter(e=>e.type!=='file'&&!/^(customer-history|draft-drawer)/.test(e.id)).map(e=>[e.id,{value:e.value,checked:e.checked}]));
 function snapshot(){const values=fields();if(values['q-draft-name'])values['q-draft-name'].value=String(values['q-draft-name'].value||'').trim();return {fields:values,items:clone(quoteItems),signature:currentQuoteSignature||'',fonts:clone(zoneFont),spacing:clone(rowSpacing),columns:{...clone(colVisible),__lines:colLines,__pricePeriod:typeof pricePeriod!=='undefined'?pricePeriod:''},columnLines:colLines,mergeSources:typeof _mergeSourceIds!=='undefined'?clone(_mergeSourceIds||[]):[],duplicateSource:typeof _dupSourceId!=='undefined'?_dupSourceId:null,project:typeof _nqProjectId!=='undefined'?_nqProjectId:null};}
 function mine(){return !!engine&&String(currentUser?.email||'').toLowerCase()===account;}
 async function status(){if(!mine())return;const pending=await engine.pending();const el=$('local-sync-status');if(el){el.textContent=error?'ข้อมูลในเครื่อง · '+error:syncing?'กำลังซิงก์ Draft…':pending?'บันทึกในเครื่องแล้ว · รอซิงก์ '+pending+' เวอร์ชัน':(lastSync?'Draft ซิงก์แล้ว · '+lastSync:'สำเนาในเครื่องพร้อม');el.title='กดบันทึก Draft เพื่อเก็บใน IndexedDB แยกตามบัญชี · Catalog/ลูกค้าใช้สำเนาล่าสุดในเครื่อง';}await refreshGroups();}
 async function refreshGroups(){if(!mine())return;const e=engine,result=await e.list();if(e!==engine||!mine())return;groups=result;if(typeof DraftDrawer!=='undefined')DraftDrawer.render();}
 async function initialize(){
   const email=String(currentUser?.email||'').toLowerCase();if(!email)return false;if(mine())return true;if(initializing)return initializing;
   initializing=(async()=>{const run=++generation;engine=null;active=null;dirty=false;groups=[];account=email;error='';lastSync='';catalogData=[];catalogExtra={};catalogExtraLoaded=false;customersData=[];quotesData=[];_settingsCache=[];for(const render of [renderCatalog,renderCustomers,renderQuotes,renderApprove]){try{render();}catch(_){}}if(typeof DraftDrawer!=='undefined')DraftDrawer.render();
     try{const store=await LocalFirstIDB.open(CONFIG.appsScriptUrl+'|'+email);if(run!==generation||String(currentUser?.email||'').toLowerCase()!==email)return false;
       engine=LocalFirstCore.create({store,owner:email,uuid,changed:()=>{status().catch(()=>{});},remote:{read:async()=>{const since=await store.get('cursor')||0;let d;try{d=await _callRaw({action:'localDraftSync',since});}catch(e){if(/unknown action.*localDraft/i.test(e.message))throw Error('ต้องอัปเดต Apps Script รุ่น Local-first · Draft ยังอยู่ในเครื่อง');throw e;}if(!Array.isArray(d.records))throw Error('ต้องอัปเดต Apps Script รุ่น Local-first · Draft ยังอยู่ในเครื่อง');return d;},append:async record=>{if(String(currentUser?.email||'').toLowerCase()!==email)throw Error('บัญชีเปลี่ยน กรุณาเข้าสู่ระบบใหม่');await _callRaw({action:'localDraftAppend',record});}}});
       const [cat,customer,extra]=await Promise.all([engine.cached(CONFIG.lists.catalog),engine.cached(CONFIG.lists.customers),engine.cached('CatalogExtra')]);if(!mine())return false;
       if(cat){catalogData=cat.rows;if(extra)catalogExtra=extra.rows[0]||{};renderCatalog();}if(customer)customersData=customer.rows;
       error='';await status();flush();return true;
     }catch(e){error='เก็บข้อมูลในเครื่องไม่ได้: '+e.message;const el=$('local-sync-status');if(el)el.textContent=error;engine=null;return false;}
   })();try{return await initializing;}finally{initializing=null;}
 }
 function flush(){if(syncTask)return syncTask;syncTask=flushImpl().catch(err=>{error='เก็บข้อมูลในเครื่องไม่สำเร็จ: '+err.message;if($('local-sync-status'))$('local-sync-status').textContent=error;}).finally(()=>{syncTask=null;});return syncTask;}
 async function flushImpl(){if(!mine()||!navigator.onLine)return;const e=engine,run=generation;syncing=true;error='';status().catch(()=>{});
   try{const task=()=>e.flush();if(navigator.locks)await navigator.locks.request('donnet-drafts:'+CONFIG.appsScriptUrl+':'+account,task);else await task();if(run===generation&&mine())lastSync=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});}
   catch(err){if(run===generation&&mine())error=err.message||'รอเชื่อมต่อ';}
   finally{syncing=false;if(run===generation)await status();}
 }
 async function remember(name,rows,actor=currentUser?.email){if(!mine()||String(actor||'').toLowerCase()!==account||![CONFIG.lists.catalog,CONFIG.lists.customers,'CatalogExtra'].includes(name)||!Array.isArray(rows))return;await engine.cache(name,rows).catch(e=>{error='สำเนาในเครื่องไม่ครบ: '+e.message;});}
 function cacheWrite(name,id,fields,deleted,actor){
   if(!mine()||String(actor||'').toLowerCase()!==account||![CONFIG.lists.catalog,CONFIG.lists.customers].includes(name))return Promise.resolve();
   const e=engine,task=cacheTail.catch(()=>{}).then(async()=>{const saved=await e.cached(name);if(!saved)return;const rows=saved.rows.filter(r=>String(r.id)!==String(id));if(!deleted){const old=saved.rows.find(r=>String(r.id)===String(id))||{};rows.push({...old,...fields,id});}await e.cache(name,rows);});cacheTail=task;return task.catch(err=>{error='สำเนาในเครื่องไม่ครบ: '+err.message;});
 }
 function editorChanged(){if(($('q-client')?.value||quoteItems.some(i=>i.name)||active))markDirty({target:$('page-newquote')});}
 function reset(){dirty=false;active=null;}
 async function pause(){await saving.catch(()=>{});dirty=false;generation++;engine=null;active=null;groups=[];account='';}
 function save(show=false){
   if(!mine())return Promise.reject(Error('ข้อมูลในเครื่องยังไม่พร้อม'));
   if(editingQuoteId)return Promise.reject(Error('ใบเดิมบันทึกผ่านเซิร์ฟเวอร์ กรุณาออนไลน์ก่อน'));
   const email=account,e=engine,data=snapshot();
   if(!data.fields['q-draft-name']?.value&&!data.fields['q-client']?.value&&!data.fields['q-note']?.value&&!data.items.some(i=>i.name)){if(show)toast('เพิ่มชื่อ Draft ชื่อลูกค้า หรือรายการก่อนบันทึก','info');return Promise.resolve(null);}
   const context=active||(active={draftId:uuid(),revision:null,snapshot:null});localWrites++;
   const task=saving.catch(()=>{}).then(async()=>{
     if(!mine()||email!==account||engine!==e)throw Error('บัญชีเปลี่ยนก่อนบันทึก กรุณาตรวจ Draft');
     if(context.snapshot&&JSON.stringify(context.snapshot)===JSON.stringify(data)&&!context.resolvedParents?.some(p=>p!==context.revision)){if(active===context)dirty=false;if(show&&active===context){showPage('quotes',null);DraftDrawer.open(false);}return context;}
     const parents=context.resolvedParents||(context.revision?[context.revision]:[]),record=await e.save(context.draftId,parents,data);
     Object.assign(context,record);delete context.resolvedParents;if(active===context&&JSON.stringify(snapshot())===JSON.stringify(data))dirty=false;
     if(!mine()||engine!==e)return record;
     error='';await status();flush();if(show&&active===context&&!dirty){toast('บันทึก Draft ในเครื่องแล้ว','success');showPage('quotes',null);DraftDrawer.open(false);}return record;
   });saving=task;return task.finally(()=>{localWrites--;});
 }

 async function open(id,revision){if(!mine())return;const g=groups.find(g=>g.id===id),r=g?.heads.find(r=>r.revision===revision);if(!r||r.kind!=='draft')return;
   if($('page-newquote').classList.contains('active')&&quoteItems.some(i=>i.name)&&!confirm('เปิด Draft นี้แทนฟอร์มปัจจุบัน? บันทึกงานก่อนสลับได้ด้วยปุ่ม Draft'))return;
   if(g.heads.length>1&&!confirm('พบการแก้ไขจากหลายเครื่อง เลือกใช้เวอร์ชันนี้เป็นฐาน? เมื่อบันทึก ระบบจะใช้เวอร์ชันที่เลือกเป็นฉบับหลัก'))return;
   restoring=true;editingQuoteId='local:'+id;showPage('newquote',null);editingQuoteId=null;const s=r.snapshot;
   for(const [id,v]of Object.entries(s.fields)){const el=$(id);if(el&&el.type!=='file'){el.value=v.value;if(['checkbox','radio'].includes(el.type))el.checked=!!v.checked;}}
   quoteItems=clone(s.items);currentQuoteSignature=s.signature||'';applyZoneFonts(s.fonts);setRowSpacingState(s.spacing);setColVisible({...s.columns,__lines:s.columnLines!==false});
   if(typeof _mergeSourceIds!=='undefined')_mergeSourceIds=clone(s.mergeSources||[]);if(typeof _dupSourceId!=='undefined')_dupSourceId=s.duplicateSource||null;if(typeof _nqProjectId!=='undefined')_nqProjectId=s.project||null;
   active={...r,resolvedParents:g.heads.map(h=>h.revision)};$('items-body')?.replaceChildren();if(typeof TravelQuote!=='undefined')TravelQuote.reset();renderItems();if(typeof TravelQuote!=='undefined')TravelQuote.restore();updateSigPreview(currentQuoteSignature);updateApproverBox();autoGrowAll($('page-newquote'));DraftDrawer.close();dirty=false;restoring=false;
 }
 async function rename(id,revision,name){
   if(!mine())throw Error('กรุณาเข้าสู่ระบบก่อน');name=String(name||'').trim();if(!name||name.length>120)throw Error('ระบุชื่อ Draft ไม่เกิน 120 ตัวอักษร');await saving.catch(()=>{});await refreshGroups();
   const group=groups.find(g=>g.id===id),r=group?.heads.find(r=>r.revision===revision);if(!r||r.kind!=='draft')throw Error('Draft เปลี่ยนแล้ว กรุณาเปิดลิ้นชักใหม่');
   const data=clone(r.snapshot);data.fields['q-draft-name']={value:name,checked:false};const next=await engine.save(id,[r.revision],data);
   if(active?.draftId===id&&active.revision===r.revision){const parents=active.resolvedParents?.map(p=>p===r.revision?next.revision:p);Object.assign(active,next);if(parents)active.resolvedParents=parents;if($('q-draft-name'))$('q-draft-name').value=name;}
   await status();flush();
 }
 async function remove(id){
   if(!mine())throw Error('กรุณาเข้าสู่ระบบก่อน');await saving.catch(()=>{});await refreshGroups();const group=groups.find(g=>g.id===id);if(!group)throw Error('ไม่พบ Draft นี้');
   // A terminal marker uses the existing lifecycle protocol, so older backends also sync deletion.
   await engine.save(id,group.heads.map(r=>r.revision),{deleted:true},'submitted','');
   if(active?.draftId===id){reset();if($('page-newquote').classList.contains('active'))showPage('quotes',null);}
   await status();flush();
 }
 async function beforeSubmit(){const context=active;if(!active||!mine())return;if(!navigator.onLine)throw Error('ส่งอนุมัติต้องออนไลน์ Draft ยังอยู่ในเครื่อง');await save(false);await flush();if(active!==context)throw Error('Draft ที่เปิดเปลี่ยนแล้ว กรุณาตรวจฉบับก่อนส่ง');if(await engine.pending())throw Error('ยังซิงก์ Draft ไม่ครบ กรุณารอหรือตรวจการเข้าสู่ระบบ');
   const group=groups.find(g=>g.id===active.draftId);if(!group||group.heads.length!==1||group.heads[0].revision!==active.revision)throw Error('Draft เปลี่ยนจากอีกเครื่อง กรุณาเปิดลิ้นชักและเลือกเวอร์ชันก่อนส่งอนุมัติ');
   const cap=await _callRaw({action:'serviceCapabilities'});if(!cap.localFirstDrafts)throw Error('ต้องอัปเดต Apps Script รุ่น Local-first ก่อนส่ง Draft นี้อนุมัติ');
   const all=await getListItems(CONFIG.lists.quotations),found=all.find(q=>q.LocalDraftId===active.draftId);if(found)throw Error('Draft นี้มีรายการส่งแล้ว กรุณากด Sync และตรวจใบรออนุมัติ ห้ามส่งซ้ำ');
 }
 async function submitted(quoteId){if(!active||!mine())return;await engine.save(active.draftId,[active.revision],{},'submitted',quoteId);active=null;await status();flush();}
 function markDirty(event){if(restoring||!mine()||editingQuoteId||!$('page-newquote').classList.contains('active')||!event.target?.closest('#page-newquote')||event.target.closest('#customer-history-drawer'))return;dirty=true;}
 document.addEventListener('input',markDirty);document.addEventListener('change',markDirty);
 window.addEventListener('online',()=>flush());window.addEventListener('offline',()=>{error='ออฟไลน์ · เก็บ Draft ในเครื่อง';status();});
 window.addEventListener('beforeunload',event=>{if(dirty||localWrites){event.preventDefault();event.returnValue='';}});
 setInterval(()=>{if(mine())flush();},45000);
 return {initialize,remember,cacheWrite,editorChanged,save,open,rename,remove,flush,reset,pause,beforeSubmit,submitted,refreshGroups,ready:mine,activeId:()=>active?.draftId||'',cards:()=>mine()?groups.flatMap(g=>g.heads.filter(r=>r.kind==='draft').map(r=>({id:'local:'+r.revision,LocalDraftId:g.id,LocalRevision:r.revision,LocalConflict:g.heads.length>1,DraftName:r.snapshot.fields['q-draft-name']?.value||'',Status:'Draft',Title:'',ClientName:r.snapshot.fields['q-client']?.value||'ยังไม่ระบุลูกค้า',SaleEmail:account,QuoteDate:r.snapshot.fields['q-date']?.value||'',TotalAmount:0,Note:'บันทึก '+r.at+(g.heads.length>1?' · มีหลายเวอร์ชัน':''),UpdatedAt:r.at}))):[]};
})();
