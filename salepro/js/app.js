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
        +(e.receiptUrl?docThumb(e.receiptUrl,'ใบเสร็จ',{small:true}):'')
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
            +photos.map(function(u,i){return docThumb(u,'รูปงาน'+(photos.length>1?' '+(i+1):''),{small:true});}).join('')
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
      +(j.mapUrl?mapCardHtml(j.mapUrl):'')
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


// ============================================================
// Thumbnail + Preview (Google Drive native — ไม่ต้องใช้ token)
// ============================================================
function _driveId(url){ const s=String(url||''); let m=s.match(/\/d\/([-\w]{10,})/)||s.match(/[?&]id=([-\w]{10,})/); return m?m[1]:''; }
function docExt(name,url){ const s=String(name||url||'').split('?')[0]; const m=s.match(/\.([a-z0-9]+)$/i); return m?m[1].toLowerCase():''; }
function docIsImg(name,url){ return ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(docExt(name,url)); }
function docIsPdf(name,url){ return docExt(name,url)==='pdf'; }
function docIcon(name,url){ const e=docExt(name,url); if(docIsPdf(name,url))return'📄'; if(['doc','docx'].includes(e))return'📝'; if(['xls','xlsx','csv'].includes(e))return'📊'; if(['zip','rar','7z'].includes(e))return'🗜️'; return'📎'; }
function docThumb(url,name,opt){ opt=opt||{}; const sz=opt.small?44:92; const label=escHtml(name||'ไฟล์');
  const payload=`'${encodeURIComponent(url)}','${encodeURIComponent(name||'')}'`;
  const did=_driveId(url);
  const imgSrc = did ? ('https://drive.google.com/thumbnail?id='+did+'&sz=w'+(sz*2)) : url;
  const isImg = docIsImg(name,url) || !!did;   // Drive: ลองโหลด thumbnail เสมอ (ถ้าไม่ใช่รูปจะ fallback เป็นไอคอน)
  const inner = isImg
    ? `<img class="doc-thumb-lazy" src="${imgSrc}" alt="${label}" loading="lazy" style="width:${sz}px;height:${sz}px;object-fit:cover;display:block;background:var(--surface2,#f1f5f9)" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;width:${sz}px;height:${sz}px;align-items:center;justify-content:center;font-size:${opt.small?20:30}px;background:var(--surface2,#f1f5f9)">${docIcon(name,url)}</div>`
    : `<div style="width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;font-size:${opt.small?22:34}px;background:var(--surface2,#f1f5f9)">${docIcon(name,url)}</div>`;
  if(opt.small) return `<span onclick="openDocPreview(${payload})" title="${label}" style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--card);max-width:230px;vertical-align:middle">${inner}<span style="font-size:11px;padding:0 9px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span></span>`;
  return `<div onclick="openDocPreview(${payload})" title="${label}" style="cursor:pointer;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--card);width:${sz}px"><div style="overflow:hidden;border-bottom:1px solid var(--border)">${inner}</div><div style="font-size:11px;padding:5px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div></div>`;
}
function openDocPreview(encUrl,encName){ const url=decodeURIComponent(encUrl), name=decodeURIComponent(encName||'');
  let o=document.getElementById('doc-preview-ov');
  if(!o){ o=document.createElement('div'); o.id='doc-preview-ov'; o.onclick=function(e){ if(e.target===o) closeDocPreview(); }; document.body.appendChild(o); }
  o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:28px';
  const header=`<div style="display:flex;align-items:center;gap:12px;color:#fff;font-size:13px;max-width:90vw"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name||'ไฟล์แนบ')}</span><a href="${url}" target="_blank" rel="noopener" style="color:#9ec1ff;flex-shrink:0">↗ เปิดแท็บใหม่</a><span onclick="closeDocPreview()" style="cursor:pointer;flex-shrink:0;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.18);font-size:16px">✕</span></div>`;
  const wrap=v=>`<div onclick="event.stopPropagation()" style="position:relative;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:10px">${header}${v}</div>`;
  const did=_driveId(url);
  let viewer;
  if(did){ viewer=`<iframe src="https://drive.google.com/file/d/${did}/preview" style="width:min(92vw,900px);height:84vh;border:none;border-radius:8px;background:#fff" allow="autoplay"></iframe>`; }
  else if(docIsImg(name,url)){ viewer=`<img src="${url}" style="max-width:90vw;max-height:84vh;object-fit:contain;border-radius:8px;background:#fff">`; }
  else if(docIsPdf(name,url)){ viewer=`<iframe src="${url}" style="width:min(92vw,900px);height:84vh;border:none;border-radius:8px;background:#fff"></iframe>`; }
  else { viewer=`<div style="background:var(--card);border-radius:12px;padding:30px 34px;text-align:center;max-width:360px"><div style="font-size:52px;margin-bottom:10px">${docIcon(name,url)}</div><div style="font-size:13px;margin-bottom:16px;word-break:break-word">${escHtml(name||'ไฟล์')}</div><a href="${url}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none">เปิด / ดาวน์โหลด</a></div>`; }
  o.innerHTML=wrap(viewer);
  document.addEventListener('keydown',_docPreviewEsc);
}
function _docPreviewEsc(e){ if(e.key==='Escape') closeDocPreview(); }
function closeDocPreview(){ const o=document.getElementById('doc-preview-ov'); if(o)o.remove(); document.removeEventListener('keydown',_docPreviewEsc); }

// ============================================================
// แผนที่: ฝังในหน้า + ปักหมุด (Leaflet + OSM, ไม่ต้องใช้ API key)
// ============================================================
function mapEmbedUrl(url){
  if(!url) return null;
  try{
    const u=String(url).trim();
    let m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
         || u.match(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
         || u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
         || u.match(/[/=](-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if(m) return 'https://maps.google.com/maps?q='+m[1]+','+m[2]+'&z=16&output=embed';
    let qm = u.match(/[?&](?:q|query|destination)=([^&]+)/);
    if(qm) return 'https://maps.google.com/maps?q='+qm[1]+'&z=16&output=embed';
    let pm = u.match(/\/maps\/place\/([^/@]+)/);
    if(pm) return 'https://maps.google.com/maps?q='+encodeURIComponent(decodeURIComponent(pm[1]))+'&output=embed';
    if(/google\.[^/]+\/maps/.test(u)) return u+(u.includes('?')?'&':'?')+'output=embed';
    return null;
  }catch(e){ return null; }
}
function mapCardHtml(url){
  const emb=mapEmbedUrl(url);
  const link='<a href="'+escHtml(url)+'" target="_blank" rel="noopener" style="color:var(--accent2)">เปิดใน Google Maps ↗</a>';
  if(emb){
    return '<div style="grid-column:1/-1;margin-top:2px">'
      +'<div style="font-size:11px;margin-bottom:5px;color:var(--text)">📍 สถานที่ติดตั้ง <span style="color:var(--muted)">·</span> '+link+'</div>'
      +'<iframe src="'+escHtml(emb)+'" loading="lazy" referrerpolicy="no-referrer-when-downgrade" style="width:100%;height:190px;border:1px solid var(--border);border-radius:8px;display:block" allowfullscreen></iframe>'
      +'</div>';
  }
  return '<div style="grid-column:1/-1">📍 '+link+' <span style="font-size:10px;color:var(--muted)">(ลิงก์ย่อ — แสดงตัวอย่างในหน้าไม่ได้)</span></div>';
}
let _mapPicker={map:null,marker:null,target:'tech-map-url',ll:null};
function _parseLL(url){ const m=String(url||'').match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/); return m?{lat:+m[1],lng:+m[2]}:null; }
function openMapPicker(targetId){
  _mapPicker.target=targetId||'tech-map-url';
  if(typeof L==='undefined'){ toast('แผนที่ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง','error'); return; }
  let o=document.getElementById('map-picker-ov');
  if(!o){ o=document.createElement('div'); o.id='map-picker-ov'; o.onclick=function(e){ if(e.target===o) closeMapPicker(); }; document.body.appendChild(o); }
  o.style.cssText='position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
  o.innerHTML='<div onclick="event.stopPropagation()" style="background:var(--card);border-radius:12px;width:min(640px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">'
    +'<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)"><span style="font-size:14px;font-weight:600;color:var(--text)">📍 ปักหมุดตำแหน่งติดตั้ง</span><span onclick="closeMapPicker()" style="margin-left:auto;cursor:pointer;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--surface2);color:var(--muted);font-size:15px">✕</span></div>'
    +'<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;overflow:auto">'
    +'<div style="display:flex;gap:6px"><input id="mp-search" placeholder="🔍 ค้นหาที่อยู่ / สถานที่ แล้วกด Enter" style="flex:1" onkeydown="if(event.key===\'Enter\'){event.preventDefault();mpSearch();}"><button type="button" class="btn btn-sm" onclick="mpSearch()">ค้นหา</button><button type="button" class="btn btn-sm" onclick="mpLocate()" title="ใช้ตำแหน่งปัจจุบัน">🎯</button></div>'
    +'<div id="mp-map" style="width:100%;height:340px;border-radius:8px;border:1px solid var(--border)"></div>'
    +'<div id="mp-coord" style="font-size:12px;color:var(--muted)">คลิกบนแผนที่เพื่อปักหมุด หรือค้นหาที่อยู่ด้านบน</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--border)"><button type="button" class="btn btn-sm" onclick="closeMapPicker()">ยกเลิก</button><button type="button" class="btn btn-primary btn-sm" id="mp-confirm" onclick="mpConfirm()" disabled style="opacity:.5">✓ ใช้ตำแหน่งนี้</button></div>'
    +'</div>';
  document.addEventListener('keydown',_mpEsc);
  const start=_parseLL(document.getElementById(_mapPicker.target)?.value)||{lat:13.7563,lng:100.5018};
  setTimeout(function(){
    const map=L.map('mp-map').setView([start.lat,start.lng],_parseLL(document.getElementById(_mapPicker.target)?.value)?16:11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    _mapPicker.map=map; _mapPicker.marker=null; _mapPicker.ll=null;
    if(_parseLL(document.getElementById(_mapPicker.target)?.value)) _mpSet(start.lat,start.lng,false);
    map.on('click',function(e){ _mpSet(e.latlng.lat,e.latlng.lng,false); });
    map.invalidateSize();
  },60);
}
function _mpSet(lat,lng,pan){ const m=_mapPicker.map; if(!m)return; lat=+(+lat).toFixed(6); lng=+(+lng).toFixed(6); _mapPicker.ll={lat,lng};
  if(_mapPicker.marker) _mapPicker.marker.setLatLng([lat,lng]); else _mapPicker.marker=L.marker([lat,lng],{draggable:true}).addTo(m).on('dragend',function(ev){ const p=ev.target.getLatLng(); _mpSet(p.lat,p.lng,false); });
  if(pan) m.setView([lat,lng],16);
  const c=document.getElementById('mp-coord'); if(c)c.innerHTML='พิกัด: <b style="color:var(--text)">'+lat+', '+lng+'</b> <span style="color:var(--muted)">(ลากหมุดปรับตำแหน่งได้)</span>';
  const b=document.getElementById('mp-confirm'); if(b){ b.disabled=false; b.style.opacity='1'; }
}
async function mpSearch(){ const q=(document.getElementById('mp-search')?.value||'').trim(); if(!q)return; const c=document.getElementById('mp-coord'); if(c)c.textContent='⏳ กำลังค้นหา...';
  try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q),{headers:{'Accept-Language':'th'}});
    const j=await r.json(); if(j&&j.length){ _mpSet(+j[0].lat,+j[0].lon,true); } else if(c){ c.textContent='ไม่พบสถานที่ — ลองคำค้นอื่น หรือคลิกปักเอง'; }
  }catch(e){ if(c)c.textContent='ค้นหาไม่สำเร็จ — คลิกปักเองบนแผนที่ได้'; }
}
function mpLocate(){ if(!navigator.geolocation){ toast('อุปกรณ์ไม่รองรับระบุตำแหน่ง','error'); return; } const c=document.getElementById('mp-coord'); if(c)c.textContent='⏳ กำลังหาตำแหน่งปัจจุบัน...';
  navigator.geolocation.getCurrentPosition(function(p){ _mpSet(p.coords.latitude,p.coords.longitude,true); },function(){ if(c)c.textContent='เข้าถึงตำแหน่งไม่ได้ — คลิกปักเองบนแผนที่'; },{enableHighAccuracy:true,timeout:8000});
}
function mpConfirm(){ const ll=_mapPicker.ll; if(!ll)return; const inp=document.getElementById(_mapPicker.target);
  if(inp){ inp.value='https://www.google.com/maps?q='+ll.lat+','+ll.lng; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  closeMapPicker(); toast('ปักหมุดแล้ว ✓','success');
}
function _mpEsc(e){ if(e.key==='Escape') closeMapPicker(); }
function closeMapPicker(){ if(_mapPicker.map){ _mapPicker.map.remove(); _mapPicker.map=null; } const o=document.getElementById('map-picker-ov'); if(o)o.remove(); document.removeEventListener('keydown',_mpEsc); }
