async function requireQuotationNumbering(){const cap=await _callRaw({action:'serviceCapabilities'});if(!cap.quotationNumbering)throw Error('ต้องอัปเดต Apps Script รุ่น Draft / ออกเลขหลังอนุมัติก่อน จึงจะอนุมัติใบที่ยังไม่มีเลขได้');}
const DraftDrawer=(()=>{
 const $=id=>document.getElementById(id);let loading=false,returnFocus=null,request=0;
 const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 function rows(){return currentUser?[...filterQuotesForUser(quotesData).filter(q=>q.Status==='Draft'),...(typeof LocalFirst!=='undefined'?LocalFirst.cards():[])]:[];}
 function position(){const bar=document.querySelector('.topbar');if(bar)$('draft-drawer').style.top=Math.max(0,bar.getBoundingClientRect().bottom)+'px';}
 function render(){
   const data=rows(),query=$('draft-drawer-search').value.trim().toLowerCase();$('draft-drawer-count').textContent=new Set(data.map(q=>q.LocalDraftId||q.id)).size;
   const host=$('draft-drawer-list');host.replaceChildren();
   for(const q of data.filter(q=>[q.ClientName,q.Title,q.Tag,q.Note].some(v=>String(v||'').toLowerCase().includes(query))).sort((a,b)=>String(b.UpdatedAt||b.QuoteDate||'').localeCompare(String(a.UpdatedAt||a.QuoteDate||'')))){
     const card=text('article','');card.appendChild(text('strong',q.ClientName||'ยังไม่ระบุลูกค้า'));
     card.appendChild(text('small',q.Title?'เลขเดิม: '+q.Title:q.LocalConflict?'มีหลายเวอร์ชัน · เลือกฉบับก่อนส่งอนุมัติ':'Draft · ยังไม่มีเลข Quotation'));
     card.appendChild(text('p',(q.QuoteDate?fmtDate(q.QuoteDate)+' · ':'')+(q.LocalRevision?'สำเนาในเครื่อง':fmt(q.TotalAmount||0)+' บาท')));
     if(q.Tag||q.Note)card.appendChild(text('p',String(q.Tag||q.Note).slice(0,160)));
     const button=text('button','เปิดทำต่อ');button.type='button';button.className='btn btn-primary btn-sm';button.disabled=!canEditQuote(q);button.onclick=()=>resume(q.id);card.appendChild(button);host.appendChild(card);
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
 $('draft-drawer-toggle').onclick=()=>{$('draft-drawer').hidden?open():close();};$('draft-drawer-close').onclick=close;$('draft-drawer-search').oninput=render;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('draft-drawer').hidden)close();});window.addEventListener('resize',position);
 return {open,close,render};
})();
