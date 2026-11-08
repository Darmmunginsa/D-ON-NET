async function requireQuotationNumbering(){const cap=await _callRaw({action:'serviceCapabilities'});if(!cap.quotationNumbering)throw Error('ต้องอัปเดต Apps Script รุ่น Draft / ออกเลขหลังอนุมัติก่อน จึงจะอนุมัติใบที่ยังไม่มีเลขได้');}
const DraftDrawer=(()=>{
 const $=id=>document.getElementById(id);let loading=false,returnFocus=null,request=0,selectedName=null,selectedDelete=null;
 const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 const archived=q=>q.DraftArchived===true||q.DraftArchived==='true';
 const manage=q=>q.LocalRevision?true:typeof isQuoteOwner==='function'?isQuoteOwner(q):canEditQuote(q);
 function rows(){return currentUser?[...filterQuotesForUser(quotesData).filter(q=>q.Status==='Draft'&&!archived(q)),...(typeof LocalFirst!=='undefined'?LocalFirst.cards():[])]:[];}
 function position(){const bar=document.querySelector('.topbar');if(bar)$('draft-drawer').style.top=Math.max(0,bar.getBoundingClientRect().bottom)+'px';}
 function render(){
   const data=rows(),query=$('draft-drawer-search').value.trim().toLowerCase();$('draft-drawer-count').textContent=new Set(data.map(q=>q.LocalDraftId||q.id)).size;
   const host=$('draft-drawer-list');host.replaceChildren();
   for(const q of data.filter(q=>[q.DraftName,q.ClientName,q.Title,q.Tag,q.Note].some(v=>String(v||'').toLowerCase().includes(query))).sort((a,b)=>String(b.UpdatedAt||b.QuoteDate||'').localeCompare(String(a.UpdatedAt||a.QuoteDate||'')))){
     const card=text('article','');card.appendChild(text('strong',q.DraftName||q.ClientName||'ยังไม่ระบุลูกค้า'));
     if(q.DraftName)card.appendChild(text('small','ลูกค้า: '+(q.ClientName||'ยังไม่ระบุ')));
     card.appendChild(text('small',q.Title?'เลขเดิม: '+q.Title:q.LocalConflict?'มีหลายเวอร์ชัน · เลือกฉบับก่อนส่งอนุมัติ':'Draft · ยังไม่มีเลข Quotation'));
     card.appendChild(text('p',(q.QuoteDate?fmtDate(q.QuoteDate)+' · ':'')+(q.LocalRevision?'สำเนาในเครื่อง':fmt(q.TotalAmount||0)+' บาท')));
     if(q.Tag||q.Note)card.appendChild(text('p',String(q.Tag||q.Note).slice(0,160)));
     const actions=text('div','');actions.className='draft-card-actions';
     const button=text('button','เปิดทำต่อ');button.type='button';button.className='btn btn-primary btn-sm';button.disabled=!canEditQuote(q);button.onclick=()=>resume(q.id);actions.appendChild(button);
     const rename=text('button','ตั้งชื่อ');rename.type='button';rename.className='btn btn-sm';rename.disabled=!manage(q);rename.onclick=()=>openName(q);actions.appendChild(rename);
     const remove=text('button','ลบ');remove.type='button';remove.className='btn btn-danger btn-sm';remove.disabled=!manage(q);remove.onclick=()=>openDelete(q);actions.appendChild(remove);card.appendChild(actions);host.appendChild(card);
   }
   if(!host.children.length)host.appendChild(text('p','ไม่มี Draft ที่ตรงกับการค้นหา'));
 }
 function close(){request++;$('draft-drawer').hidden=true;$('draft-drawer-toggle').setAttribute('aria-expanded','false');if(returnFocus?.isConnected)returnFocus.focus();}
 async function open(refresh=true){
   returnFocus=document.activeElement;position();$('draft-drawer').hidden=false;$('draft-drawer-toggle').setAttribute('aria-expanded','true');render();$('draft-drawer-search').focus();
   if(typeof LocalFirst!=='undefined')LocalFirst.flush();
   if(!refresh||loading)return;if(!navigator.onLine){$('draft-drawer-status').textContent='ออฟไลน์ · เปิด Draft ที่เก็บในเครื่องได้';return;}const email=currentUser?.email,run=++request;loading=true;$('draft-drawer-status').textContent='กำลังโหลด Draft…';
   try{const L=CONFIG.lists,data=await getListItemsMulti([L.quotations,L.settings]);if(run!==request||currentUser?.email!==email)return;if(!Array.isArray(data[L.quotations])||!Array.isArray(data[L.settings]))throw Error('ข้อมูลไม่ครบ');if(typeof _settingsCache!=='undefined')_settingsCache=[...(_settingsCache||[]).filter(s=>s._srcList&&s._srcList!==L.settings),...data[L.settings].map(s=>({...s,_srcList:L.settings}))];quotesData=filterQuotesForUser(data[L.quotations],data[L.settings]);render();$('draft-drawer-status').textContent='เลือก Draft เพื่อเปิดทำต่อ · ตรวจสถานะซิงก์ที่แถบเครื่องมือ';}
   catch(e){if(run===request)$('draft-drawer-status').textContent='โหลดไม่สำเร็จ: '+e.message;}
   finally{loading=false;}
 }
 async function resume(id){const q=rows().find(q=>String(q.id)===String(id));if(!q||!canEditQuote(q))return;if(q.LocalRevision)return LocalFirst.open(q.LocalDraftId,q.LocalRevision);if(document.getElementById('page-newquote').classList.contains('active')&&quoteItems.some(i=>i.name)&&!confirm('เปิด Draft นี้แทนฟอร์มปัจจุบัน? กรุณาบันทึกงานที่แก้ไขก่อนสลับ'))return;close();await editQuote(q.id);}
 function openName(q){selectedName=q;$('draft-name-input').value=q.DraftName||'';$('draft-name-error').textContent='';$('draft-name-dialog').showModal();$('draft-name-input').focus();}
 function openDelete(q){selectedDelete=q;$('draft-delete-error').textContent='';$('draft-delete-text').textContent='ลบ Draft “'+(q.DraftName||q.ClientName||'ยังไม่ระบุชื่อ')+'” ออกจากตะกร้า?'+(q.LocalRevision?' หากมีหลายเวอร์ชัน จะนำออกทั้งหมด':'');$('draft-delete-dialog').showModal();}
 async function freshLegacy(q){const L=CONFIG.lists,data=await getListItemsMulti([L.quotations,L.settings]),fresh=filterQuotesForUser(data[L.quotations]||[],data[L.settings]).find(r=>String(r.id)===String(q.id));if(!fresh||fresh.Status!=='Draft'||archived(fresh)||!manage(fresh))throw Error('Draft เปลี่ยนสถานะหรือสิทธิ์แล้ว กรุณาโหลดใหม่');return fresh;}
 async function saveName(event){event.preventDefault();if(!selectedName)return;const button=$('draft-name-save'),q=selectedName,name=$('draft-name-input').value.trim();if(!name||name.length>120){$('draft-name-error').textContent='ระบุชื่อ Draft ไม่เกิน 120 ตัวอักษร';return;}button.disabled=true;
   try{if(q.LocalRevision)await LocalFirst.rename(q.LocalDraftId,q.LocalRevision,name);else{await freshLegacy(q);await updateListItem(CONFIG.lists.quotations,q.id,{DraftName:name});const cached=quotesData.find(r=>String(r.id)===String(q.id));if(cached)cached.DraftName=name;if(typeof editingQuoteId!=='undefined'&&String(editingQuoteId)===String(q.id)&&$('q-draft-name'))$('q-draft-name').value=name;}render();$('draft-name-dialog').close();selectedName=null;}catch(e){$('draft-name-error').textContent=e.message;}finally{button.disabled=false;}}
 async function removeSelected(){if(!selectedDelete)return;const button=$('draft-delete-confirm'),q=selectedDelete;button.disabled=true;
   try{if(q.LocalRevision)await LocalFirst.remove(q.LocalDraftId);else{await freshLegacy(q);await updateListItem(CONFIG.lists.quotations,q.id,{DraftArchived:'true'});const cached=quotesData.find(r=>String(r.id)===String(q.id));if(cached)cached.DraftArchived='true';if(typeof editingQuoteId!=='undefined'&&String(editingQuoteId)===String(q.id)){editingQuoteId=null;showPage('quotes',null);}}render();$('draft-delete-dialog').close();selectedDelete=null;}catch(e){$('draft-delete-error').textContent=e.message;}finally{button.disabled=false;}}
 $('draft-drawer-toggle').onclick=()=>{$('draft-drawer').hidden?open():close();};$('draft-drawer-close').onclick=close;$('draft-drawer-search').oninput=render;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('draft-drawer').hidden)close();});window.addEventListener('resize',position);
 $('draft-name-form').onsubmit=saveName;$('draft-name-cancel').onclick=()=>$('draft-name-dialog').close();$('draft-delete-cancel').onclick=()=>$('draft-delete-dialog').close();$('draft-delete-confirm').onclick=removeSelected;
 return {open,close,render};
})();
