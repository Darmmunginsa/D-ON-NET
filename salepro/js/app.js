// ============================================================
// SESSION RESTORE — Google auto-select + PO callback check
// ============================================================
window.addEventListener('load', async () => {
  // ถ้ามี PO callback URL → แสดง hint บน login screen
  const params = new URLSearchParams(window.location.search);
  const poStatus = params.get('po_status');
  const quoteId = params.get('quote_id');
  if (poStatus && quoteId) {
    const cfg = PO_STATUS_CONFIG[poStatus] || {};
    const hint = document.querySelector('.login-card p');
    if (hint) {
      hint.innerHTML = `<span style="color:var(--amber);font-weight:500">${cfg.icon||'📦'} กรุณา Login เพื่อยืนยันสถานะ: <strong style="color:${cfg.color||'var(--text)'}">${cfg.label||poStatus}</strong></span>`;
    }
  }

  // Restore MSAL session silently — if signed in, go straight to app
  await tryRestoreSession();
});


// ============================================================
// TECH JOB ASSIGNMENT
// ============================================================
const TECH_STATUS={assigned:{label:'รอรับงาน',color:'var(--amber)',icon:'🕐'},accepted:{label:'รับงานแล้ว',color:'var(--accent2)',icon:'✅'},inprogress:{label:'กำลังดำเนินการ',color:'var(--purple)',icon:'🔧'},completed:{label:'เสร็จสิ้น',color:'var(--green)',icon:'✓'}};

function clearTechForm(){['tech-name','tech-email','tech-contact-name','tech-contact-phone','tech-scheduled-at','tech-map-url','tech-materials','tech-note'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});}

var _editingTechJobId=null;

function editTechJob(jobId){
  var job=(stDealData.techJobs||[]).find(function(j){return j.id===jobId;});
  if(!job)return;
  _editingTechJobId=jobId;
  var setVal=function(id,v){var el=document.getElementById(id);if(el)el.value=v||'';};
  setVal('tech-name',job.techName);
  setVal('tech-email',job.techEmail);
  setVal('tech-contact-name',job.contactName);
  setVal('tech-contact-phone',job.contactPhone);
  setVal('tech-scheduled-at',job.scheduledAt);
  setVal('tech-map-url',job.mapUrl);
  setVal('tech-materials',job.materials);
  setVal('tech-note',job.note);
  var title=document.getElementById('tech-form-title');
  if(title)title.textContent='✏️ แก้ไขงานช่าง: '+(job.techName||'');
  var btn=document.getElementById('tech-save-btn');
  if(btn)btn.textContent='💾 บันทึกการแก้ไข';
  // เลื่อนขึ้นไปที่ฟอร์ม
  var form=document.getElementById('tech-assign-form');
  if(form)form.scrollIntoView({behavior:'smooth',block:'start'});
}

function cancelEditTechJob(){
  _editingTechJobId=null;
  clearTechForm();
  var title=document.getElementById('tech-form-title');
  if(title)title.textContent='🔧 มอบหมายงานช่าง';
  var btn=document.getElementById('tech-save-btn');
  if(btn)btn.textContent='📤 มอบหมายและส่ง Email';
}

async function saveTechJob(){
  var name=(document.getElementById('tech-name')?.value||'').trim();
  var email=(document.getElementById('tech-email')?.value||'').trim();
  var cName=(document.getElementById('tech-contact-name')?.value||'').trim();
  var cPhone=(document.getElementById('tech-contact-phone')?.value||'').trim();
  var sched=document.getElementById('tech-scheduled-at')?.value||'';
  var mapUrl=(document.getElementById('tech-map-url')?.value||'').trim();
  var mats=(document.getElementById('tech-materials')?.value||'').trim();
  var note=(document.getElementById('tech-note')?.value||'').trim();
  if(!name){toast('กรุณาระบุชื่อช่าง','error');return;}
  stDealData.techJobs=stDealData.techJobs||[];
  stDealData.notes=stDealData.notes||[];
  if(_editingTechJobId){
    // Edit mode — อัปเดตงานเดิม
    var idx=stDealData.techJobs.findIndex(function(j){return j.id===_editingTechJobId;});
    if(idx<0){toast('ไม่พบงานที่แก้ไข','error');return;}
    var existing=stDealData.techJobs[idx];
    existing.techName=name;existing.techEmail=email;existing.contactName=cName;
    existing.contactPhone=cPhone;existing.scheduledAt=sched;existing.mapUrl=mapUrl;
    existing.materials=mats;existing.note=note;existing.updatedAt=new Date().toISOString();
    stDealData.notes.push({id:Date.now(),type:'tech',user:currentUser?.displayName||currentUser?.email||'',text:'✏️ แก้ไขข้อมูลงานช่าง: '+name,ts:new Date().toISOString()});
    try{
      await saveSTDealData();
      cancelEditTechJob();renderTechJobList();renderSTTimeline();
      toast('💾 บันทึกการแก้ไขเรียบร้อย','success');
    }catch(e){toast('บันทึกไม่สำเร็จ: '+e.message,'error');}
  } else {
    // Create mode — มอบหมายงานใหม่
    var job={id:Date.now(),techName:name,techEmail:email,contactName:cName,contactPhone:cPhone,scheduledAt:sched,mapUrl:mapUrl,materials:mats,note:note,status:'assigned',assignedBy:currentUser?.displayName||currentUser?.email||'',assignedAt:new Date().toISOString(),completedAt:null,completionNote:'',completionPhotoUrl:''};
    stDealData.techJobs.unshift(job);
    stDealData.notes.push({id:Date.now()+1,type:'tech',user:currentUser?.displayName||currentUser?.email||'',text:'🔧 มอบหมายงานช่าง: '+name+(sched?' วันที่ '+sched.replace('T',' '):''),ts:new Date().toISOString()});
    try{
      await saveSTDealData();
      cancelEditTechJob();renderTechJobList();renderSTTimeline();
      if(email&&email.includes('@')){await sendTechAssignEmail(job,stQuoteId);toast('มอบหมายงานและส่ง Email ให้ช่างแล้ว','success');}
      else toast('บันทึกงานช่างแล้ว','success');
    }catch(e){toast('บันทึกไม่สำเร็จ: '+e.message,'error');}
  }
}

async function updateTechStatus(jobId,newStatus){
  var job=(stDealData.techJobs||[]).find(function(j){return j.id===jobId;});
  if(!job)return;
  job.status=newStatus;
  if(newStatus==='completed')job.completedAt=new Date().toISOString();
  var st=TECH_STATUS[newStatus]||{};
  stDealData.notes.push({id:Date.now(),type:'tech',user:currentUser?.displayName||currentUser?.email||'',text:st.icon+' งานช่าง '+(job.techName||'')+': '+st.label,ts:new Date().toISOString()});
  try{await saveSTDealData();renderTechJobList();renderSTTimeline();toast(st.icon+' อัปเดต: '+st.label,'success');}
  catch(e){toast('ไม่สำเร็จ: '+e.message,'error');}
}

async function uploadTechCompletionPhoto(jobId,input){
  var file=input.files?.[0];if(!file)return;
  if(file.size>5*1024*1024){toast('ไฟล์ใหญ่เกิน 5MB','error');return;}
  var job=(stDealData.techJobs||[]).find(function(j){return j.id===jobId;});if(!job)return;
  try{
    toast('กำลังอัปโหลดรูป...','info');
    var reader=new FileReader();
    var b64=await new Promise(function(res,rej){reader.onload=function(e){res(e.target.result.split(',')[1]);};reader.onerror=rej;reader.readAsDataURL(file);});
    var res=await apiPost('uploadFile','Payments',null,{fileName:'TECH_'+jobId+'_'+file.name,mimeType:file.type||'image/jpeg',base64Data:b64});
    job.completionPhotoUrl=res.fileUrl||'';
    await saveSTDealData();renderTechJobList();toast('อัปโหลดรูปสำเร็จ','success');
  }catch(e){toast('อัปโหลดไม่สำเร็จ: '+e.message,'error');}
}

async function deleteTechJob(jobId){
  if(!confirm('ลบงานมอบหมายนี้?'))return;
  stDealData.techJobs=(stDealData.techJobs||[]).filter(function(j){return j.id!==jobId;});
  await saveSTDealData();renderTechJobList();toast('ลบแล้ว','success');
}

function renderTechJobList(){
  var el=document.getElementById('tech-job-list');if(!el)return;
  var jobs=stDealData.techJobs||[];
  var q=quotesData.find(function(x){return x.id===stQuoteId;});
  var isRO=stDealData.closed||(q&&(q.Status==='Closed'||q.Status==='Cancelled'));
  if(!jobs.length){el.innerHTML='<div style="font-size:12px;color:var(--muted);padding:8px 0">ยังไม่มีงานที่มอบหมาย</div>';return;}
  var grandTotal=jobs.reduce(function(s,j){return s+(j.expenses||[]).reduce(function(a,e){return a+(+e.amount||0);},0);},0);
  el.innerHTML=jobs.map(function(j){
    var st=TECH_STATUS[j.status]||TECH_STATUS.assigned;
    var sched=j.scheduledAt?j.scheduledAt.replace('T',' '):'-';
    // ล็อคทันทีที่ช่างกดรับงาน (status != assigned) — Sale/Approval ดูอย่างเดียว
    var techLocked=(j.status!=='assigned');
    var exps=j.expenses||[];
    var expTotal=exps.reduce(function(a,e){return a+(+e.amount||0);},0);
    var expRows=exps.map(function(e){
      return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">'
        +'<span style="background:rgba(79,142,247,0.1);color:var(--accent2);border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap">'+escHtml(e.category)+'</span>'
        +'<span style="color:var(--text);flex:1">'+escHtml(e.description||'')+'</span>'
        +'<span style="font-family:var(--mono);color:var(--amber);font-weight:600">'+fmt(e.amount||0)+'</span>'
        +(e.receiptUrl?'<a href="'+escHtml(e.receiptUrl)+'" target="_blank" style="color:var(--accent2);font-size:10px">🧾↗</a>':'')
        +(!isRO&&!techLocked?'<button onclick="deleteTechExpense('+j.id+','+e.id+')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px;padding:0 2px">✕</button>':'')
        +'</div>';
    }).join('');
    // ฟอร์มเพิ่มค่าใช้จ่าย — เฉพาะ assigned (ยังไม่รับงาน) เท่านั้น
    var expForm=(!isRO&&!techLocked)
      ?'<div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:5px;align-items:center;margin-top:7px">'
        +'<select id="exp-cat-'+j.id+'" style="background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:3px 5px;font-size:11px;color:var(--text)">'
        +'<option>ค่าเดินทาง</option><option>ค่าอาหาร</option><option>วัสดุสิ้นเปลือง</option><option>ค่าแรงเสริม</option><option>ค่าอื่นๆ</option>'
        +'</select>'
        +'<input id="exp-desc-'+j.id+'" placeholder="รายละเอียด..." style="background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:3px 7px;font-size:11px;color:var(--text);width:100%">'
        +'<input id="exp-amt-'+j.id+'" type="number" placeholder="บาท" min="0" style="background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:3px 5px;font-size:11px;color:var(--text);width:72px;font-family:var(--mono)">'
        +'<div style="display:flex;gap:4px">'
        +'<button class="btn btn-sm btn-primary" onclick="addTechExpense('+j.id+')" style="font-size:11px;padding:3px 8px">+ เพิ่ม</button>'
        +'<label class="btn btn-sm" style="font-size:11px;padding:3px 7px;cursor:pointer" title="แนบใบเสร็จ">🧾<input type="file" id="exp-receipt-'+j.id+'" accept="image/*,.pdf" style="display:none" onchange="uploadExpenseReceipt('+j.id+',this)"></label>'
        +'</div></div>'
      :'';
    // Action buttons — แยกตาม lock state
    var actionHtml='';
    if(!isRO){
      if(!techLocked){
        // ยังไม่รับงาน: Sale แก้ไข / ยกเลิกได้
        actionHtml='<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px">'
          +'<button class="btn btn-sm" onclick="editTechJob('+j.id+')" style="font-size:11px;padding:4px 10px;background:none;border:1px solid var(--border2);color:var(--text)">✏️ แก้ไข</button>'
          +'<button class="btn btn-sm" onclick="deleteTechJob('+j.id+')" style="font-size:11px;padding:4px 8px;background:none;border:1px solid var(--red);color:var(--red);margin-left:auto">🗑 ยกเลิก</button>'
          +'</div>';
      } else {
        // รับงานแล้ว: Sale ดูอย่างเดียว — แสดง attachment ที่ช่างอัปโหลด
        var photos=j.completionPhotos||(j.completionPhotoUrl?[j.completionPhotoUrl]:[]);
        if(photos.length){
          actionHtml='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
            +photos.map(function(u,i){return '<a href="'+escHtml(u)+'" target="_blank" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--green);color:var(--green);text-decoration:none">🖼 รูปงาน'+(photos.length>1?' '+(i+1):'')+'↗</a>';}).join('')
            +'</div>';
        }
      }
    }
    var borderStyle=techLocked?'border-left:3px solid '+st.color+';':'';
    return '<div style="background:var(--surface2);border:1px solid var(--border);'+borderStyle+'border-radius:8px;padding:12px 14px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      +'<span style="font-size:13px;font-weight:600;color:var(--text)">'+escHtml(j.techName||'-')+'</span>'
      +'<span style="font-size:11px;color:var(--muted)">'+escHtml(j.techEmail||'')+'</span>'
      +'<span style="margin-left:auto;font-size:11px;font-weight:600;color:'+st.color+'">'+st.icon+' '+st.label+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:11px;color:var(--muted);margin-bottom:8px">'
      +'<div>👤 <span style="color:var(--text)">'+escHtml(j.contactName||'-')+'</span> '+escHtml(j.contactPhone||'')+'</div>'
      +'<div>📅 <span style="color:var(--text)">'+escHtml(sched)+'</span></div>'
      +(j.mapUrl?'<div style="grid-column:1/-1">📍 <a href="'+escHtml(j.mapUrl)+'" target="_blank" style="color:var(--accent2)">เปิดแผนที่ ↗</a></div>':'')
      +(j.materials?'<div style="grid-column:1/-1;white-space:pre-wrap">🔩 '+escHtml(j.materials)+'</div>':'')
      +(j.note?'<div style="grid-column:1/-1">📝 '+escHtml(j.note)+'</div>':'')
      +'</div>'
      +actionHtml
      +'<div style="border-top:1px solid var(--border);padding-top:8px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'
      +'<span style="font-size:11px;font-weight:600;color:var(--text)">💸 ค่าใช้จ่ายหน้างาน</span>'
      +(expTotal>0?'<span style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--amber)">รวม '+fmt(expTotal)+'</span>':'')
      +'</div>'
      +(expRows||'<div style="font-size:11px;color:var(--muted);padding-bottom:5px">ยังไม่มีรายการ</div>')
      +expForm
      +'</div>'
      +'</div>';
  }).join('')
  +(grandTotal>0?'<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:7px;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:4px"><span style="color:var(--muted)">💸 ค่าใช้จ่ายรวมทั้งหมด</span><span style="font-family:var(--mono);font-weight:700;color:var(--amber)">'+fmt(grandTotal)+'</span></div>':'');
}

async function addTechExpense(jobId){
  var job=(stDealData.techJobs||[]).find(function(j){return j.id===jobId;});if(!job)return;
  var cat=document.getElementById('exp-cat-'+jobId)?.value||'ค่าอื่นๆ';
  var desc=(document.getElementById('exp-desc-'+jobId)?.value||'').trim();
  var amt=+(document.getElementById('exp-amt-'+jobId)?.value)||0;
  if(!amt){toast('กรุณาระบุจำนวนเงิน','error');return;}
  job.expenses=job.expenses||[];
  job.expenses.push({id:Date.now(),category:cat,description:desc,amount:amt,receiptUrl:window['_expReceipt_'+jobId]||'',addedBy:currentUser?.displayName||currentUser?.email||'',addedAt:new Date().toISOString()});
  window['_expReceipt_'+jobId]='';
  try{await saveSTDealData();renderTechJobList();toast('บันทึกค่าใช้จ่ายแล้ว','success');}
  catch(e){toast('ไม่สำเร็จ: '+e.message,'error');}
}

async function deleteTechExpense(jobId,expId){
  var job=(stDealData.techJobs||[]).find(function(j){return j.id===jobId;});if(!job)return;
  job.expenses=(job.expenses||[]).filter(function(e){return e.id!==expId;});
  await saveSTDealData();renderTechJobList();toast('ลบแล้ว','success');
}

async function uploadExpenseReceipt(jobId,input){
  var file=input.files?.[0];if(!file)return;
  if(file.size>5*1024*1024){toast('ไฟล์ใหญ่เกิน 5MB','error');return;}
  try{
    toast('กำลังอัปโหลดใบเสร็จ...','info');
    var reader=new FileReader();
    var b64=await new Promise(function(res,rej){reader.onload=function(e){res(e.target.result.split(',')[1]);};reader.onerror=rej;reader.readAsDataURL(file);});
    var res=await apiPost('uploadFile','Payments',null,{fileName:'RECEIPT_'+jobId+'_'+file.name,mimeType:file.type||'image/jpeg',base64Data:b64});
    window['_expReceipt_'+jobId]=res.fileUrl||'';
    toast('อัปโหลดใบเสร็จแล้ว — กด "+ เพิ่ม" เพื่อบันทึก','success');
  }catch(e){toast('อัปโหลดไม่สำเร็จ: '+e.message,'error');}
}


async function sendTechAssignEmail(job,quoteId){
  var q=quotesData.find(function(x){return x.id===quoteId;})||{};
  var subject='[มอบหมายงาน] '+(q.Title||'')+' — '+(q.ClientName||'');
  var body='คุณได้รับมอบหมายงานติดตั้ง/ซ่อมบำรุง\n\n'
    +'ใบเสนอราคา : '+(q.Title||'')+'\n'
    +'ลูกค้า      : '+(q.ClientName||'')+'\n\n'
    +'=== ข้อมูลหน้างาน ===\n'
    +'ผู้ติดต่อ   : '+(job.contactName||'-')+'  '+(job.contactPhone||'')+'\n'
    +'วันเวลา    : '+(job.scheduledAt?job.scheduledAt.replace('T',' '):'-')+'\n'
    +'แผนที่      : '+(job.mapUrl||'-')+'\n\n'
    +(job.materials?'=== วัสดุ/อุปกรณ์ที่ต้องนำไป ===\n'+job.materials+'\n\n':'')
    +(job.note?'=== หมายเหตุ ===\n'+job.note+'\n\n':'')
    +'มอบหมายโดย: '+(job.assignedBy||'');
  await apiPost('sendEmail','_',null,{to:job.techEmail,subject:subject,body:body});
}

// ============================================================
// THEME CUSTOMIZATION (per-user, saved in SharePoint Settings)
// ============================================================
const THEME_DEFAULT = { accent: '#4f8ef7', bg: '#0f1117' };
const ACCENT_PRESETS = ['#4f8ef7','#F97316','#14b8a6','#a78bfa','#f43f5e','#22c55e','#eab308','#06b6d4'];
const BG_PRESETS = ['#0f1117','#0a0e1a','#111827','#1a1410','#0d1b14','#1a1024','#f5f5f7','#ffffff'];
let _currentTheme = { ...THEME_DEFAULT };

function _hexToRgb(h){ h=h.replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function _luminance(hex){ const [r,g,b]=_hexToRgb(hex); return (0.299*r+0.587*g+0.114*b)/255; }
function _shade(hex, amt){ // amt>0 lighten, <0 darken
  let [r,g,b]=_hexToRgb(hex);
  r=Math.max(0,Math.min(255,Math.round(r+amt*255)));
  g=Math.max(0,Math.min(255,Math.round(g+amt*255)));
  b=Math.max(0,Math.min(255,Math.round(b+amt*255)));
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function applyTheme(t) {
  const r = document.documentElement.style;
  const isLight = _luminance(t.bg) > 0.5;
  const dir = isLight ? -1 : 1;   // light bg → darken surfaces; dark bg → lighten
  r.setProperty('--bg', t.bg);
  r.setProperty('--surface', _shade(t.bg, dir*0.04));
  r.setProperty('--surface2', _shade(t.bg, dir*0.08));
  r.setProperty('--accent', t.accent);
  r.setProperty('--accent2', _shade(t.accent, 0.12));
  r.setProperty('--text', isLight ? '#1a1d27' : '#e8eaf0');
  r.setProperty('--muted', isLight ? '#5b6472' : '#7b8299');
  r.setProperty('--muted2', isLight ? '#3b424d' : '#9ca3b5');
  r.setProperty('--border', isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)');
  r.setProperty('--border2', isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)');
}

function previewTheme() {
  applyTheme({ accent: document.getElementById('theme-accent').value, bg: document.getElementById('theme-bg').value });
}

function openThemeModal() {
  // build preset swatches
  const mkSwatch = (color, inputId) => `<button type="button" onclick="document.getElementById('${inputId}').value='${color}';previewTheme()" style="width:28px;height:28px;border-radius:7px;border:2px solid var(--border2);background:${color};cursor:pointer"></button>`;
  document.getElementById('accent-presets').innerHTML = ACCENT_PRESETS.map(c=>mkSwatch(c,'theme-accent')).join('');
  document.getElementById('bg-presets').innerHTML = BG_PRESETS.map(c=>mkSwatch(c,'theme-bg')).join('');
  document.getElementById('theme-accent').value = _currentTheme.accent;
  document.getElementById('theme-bg').value = _currentTheme.bg;
  openModal('theme-modal');
}

function resetTheme() {
  document.getElementById('theme-accent').value = THEME_DEFAULT.accent;
  document.getElementById('theme-bg').value = THEME_DEFAULT.bg;
  previewTheme();
}

async function saveTheme() {
  _currentTheme = { accent: document.getElementById('theme-accent').value, bg: document.getElementById('theme-bg').value };
  applyTheme(_currentTheme);
  closeModal('theme-modal');
  toast('บันทึกธีมแล้ว', 'success');
  // persist to SharePoint Settings: Title = Theme_<email>
  try {
    const email = (currentUser?.email||'').toLowerCase();
    if (!email) return;
    const key = 'Theme_' + email;
    const items = await getListItems(CONFIG.lists.settings);
    const existing = items.find(i => i.Title === key);
    if (existing) await updateListItem(CONFIG.lists.settings, existing.id, { Value: JSON.stringify(_currentTheme) });
    else await createListItem(CONFIG.lists.settings, { Title: key, Value: JSON.stringify(_currentTheme) });
  } catch(e) { console.warn('Save theme failed:', e.message); }
}

async function loadTheme() {
  try {
    const email = (currentUser?.email||'').toLowerCase();
    if (!email) return;
    const items = await getListItems(CONFIG.lists.settings);
    const it = items.find(i => i.Title === 'Theme_' + email);
    if (it && it.Value) { _currentTheme = JSON.parse(it.Value); applyTheme(_currentTheme); }
  } catch(e) { /* keep default */ }
}

