// ============================================================
// PurchasePro — ระบบจัดซื้อ (รับช่วงจาก SalePro แจ้งจัดซื้อ)
// เก็บข้อมูลใน Settings list ร่วมกับ SalePro:
//   Procurements           = งานจัดซื้อที่ Sale ส่งมา (handoff)
//   Purchase_<id>          = ข้อมูลขั้นตอนจัดซื้อ (stage + stageData)
//   PurchaseStatus_<qid>   = สถานะย่อให้ SalePro แสดง progress
//   Vendors                = Vendor (อ่านจาก SalePro)
// ============================================================
// currentUser มาจาก auth.js (Google Sign-In)
let _settingsCache = [];
let procurements = [];      // handoff records
let quotesById = {};        // ใบเสนอราคา SalePro (id → quote) เพื่อเทียบกำไร
let quoteItemsByQuote = {}; // รายการในใบเสนอราคา (quoteId → [items]) — ราคาขายรายชิ้น
let purchaseExt = {};       // { [id]: {stage, stageData, history} }
let vendorsData = [];
let editingPO = null;       // purchase object currently in modal

const STAGES = [
  { n:1, key:'received',  label:'รับงาน' },
  { n:2, key:'rfq',       label:'ขอราคา' },
  { n:3, key:'quotes',    label:'รับราคา' },
  { n:4, key:'compare',   label:'เทียบราคา' },
  { n:5, key:'po',        label:'ออก PO' },
  { n:6, key:'payment',   label:'จ่ายเงิน' },
  { n:7, key:'shipping',  label:'ยืนยันส่ง' },
  { n:8, key:'receive',   label:'รับของครบ' }
];
const STAGE_BADGE = {
  1:['รับงาน','#8b949e'], 2:['ขอราคา','#f59e0b'], 3:['รับราคา','#f59e0b'], 4:['เทียบราคา','#a78bfa'],
  5:['ออก PO','#4f8ef7'], 6:['จ่ายเงิน','#4f8ef7'], 7:['รอส่ง','#fbbf24'], 8:['รับครบ','#34d399']
};
// สถานะย่อสำหรับ SalePro (mapping ขั้น → ข้อความ progress)
const SALE_PROGRESS = {1:'ส่งจัดซื้อแล้ว',2:'กำลังขอราคา',3:'กำลังขอราคา',4:'กำลังเทียบราคา',5:'สั่งซื้อแล้ว',6:'สั่งซื้อแล้ว',7:'รอของ',8:'ของถึงแล้ว'};

const fmt = n => '฿' + Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
function toast(msg,type='info'){const w=document.getElementById('toasts');if(!w)return;const e=document.createElement('div');e.className='toast '+type;e.textContent=msg;w.appendChild(e);setTimeout(()=>e.remove(),3500);}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

// ── auth: ดู auth.js (Google Sign-In). afterLogin() ถูกเรียกหลังล็อกอินสำเร็จ ──
async function afterLogin(){
  document.getElementById('user-name').textContent=currentUser.displayName||currentUser.email;
  document.getElementById('user-email').textContent=currentUser.email;
  document.getElementById('user-avatar').textContent=(currentUser.displayName||'U')[0].toUpperCase();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-screen').style.display='flex';
  buildFilterOptions();
  await syncAll();
  if (typeof maybeStartTour === 'function') { try { maybeStartTour(); } catch(e) {} }
}

// ── data ──
async function syncAll(){
  toast('กำลังซิงค์...','info');
  try{
    await BasketPersistence.idle();
    // ข้อมูลจัดซื้ออยู่ที่ลิสต์ ProcurementData แล้ว — โหลดลิสต์ใหม่เป็นหลัก + fallback ค่าเก่าจาก Settings (ย้ายเองตอนเซฟถัดไป)
    let procList=[], oldSettings=[];
    procList = await getListItems(CONFIG.lists.procurement);
    oldSettings = await getListItems(CONFIG.lists.settings);
    _settingsCache = [...new Map(procList.map(i=>[i.Title,{...i,_srcList:CONFIG.lists.procurement}])).values()];
    // นำ key เก่าจาก Settings ที่ยังไม่มีในลิสต์ใหม่มาเสริม (mark _srcList=settings → เซฟครั้งหน้าจะย้ายเข้าลิสต์ใหม่)
    oldSettings.forEach(i=>{
      // SalePro owns DealStatus; an old migrated procurement copy must not shadow it.
      if((i.Title||'').startsWith('DealStatus_')) _settingsCache=_settingsCache.filter(x=>x.Title!==i.Title);
      if(!_settingsCache.some(x=>x.Title===i.Title)) _settingsCache.push({...i,_srcList:CONFIG.lists.settings});
    });
    const procItem = _settingsCache.find(i=>i.Title==='Procurements');
    procurements = (procItem&&procItem.Value)?(JSON.parse(procItem.Value)||[]):[];
    const venItem = _settingsCache.find(i=>i.Title==='Vendors');
    vendorsData = (venItem&&venItem.Value)?(JSON.parse(venItem.Value)||[]):[];
    purchaseExt={};
    _settingsCache.forEach(i=>{ if((i.Title||'').startsWith('Purchase_')){ try{ purchaseExt[i.Title.slice(9)]=JSON.parse(i.Value)||{}; }catch(e){} } });
    await loadMailTemplates();
    loadPOCompany();   // ตั้งค่าบริษัท (โลโก้/ชื่อ/ที่อยู่) จาก Settings
    // โหลดใบเสนอราคา (ไซต์เดียวกัน) เพื่อเทียบกำไร
    try{ const qs=await getListItems(CONFIG.lists.quotations); quotesById={}; qs.forEach(q=>{ quotesById[String(q.id)]=q; }); }catch(e){ quotesById={}; }
    // โหลดรายการในใบเสนอราคา (ราคาขายรายชิ้น) เพื่อคิดกำไรเฉพาะรายการที่ดึงมาทำ
    try{ const its=await getListItems(CONFIG.lists.quoteItems); quoteItemsByQuote={}; its.forEach(it=>{ const qid=String(it.QuoteID); (quoteItemsByQuote[qid]=quoteItemsByQuote[qid]||[]).push(it); }); }catch(e){ quoteItemsByQuote={}; }
    await BasketPersistence.retry([_poBkKey('PurchaseBaskets'),_poBkKey('PurchaseBasketMap')],putSetting);
    loadPoBaskets(); // Replace any empty basket cache initialized before remote data arrived.
    renderDash(); renderPurchases(); renderVendors();
    toast('Sync สำเร็จ','success');
    checkReminderEmails().catch(e=>console.warn('reminder mail',e.message));
  }catch(e){ toast('Sync ไม่สำเร็จ: '+e.message,'error'); }
}

// รวม handoff + ส่วนขยาย → purchase object
function getPurchases(){
  return procurements.map(p=>{
    const ext = purchaseExt[String(p.id)] || {};
    return Object.assign({}, p, { stage: ext.stage||1, stageData: ext.stageData||{}, history: ext.history||[], closed: !!ext.closed, assetType: ext.assetType||'sale', assetCategory: ext.assetCategory||'' });
  });
}
function getVendorById(id){ return vendorsData.find(v=>String(v.id)===String(id))||null; }
function vendorOptions(sel){ return '<option value="">– เลือก Vendor –</option>'+vendorsData.map(v=>`<option value="${v.id}"${String(v.id)===String(sel)?' selected':''}>${esc(v.name)}</option>`).join(''); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── pages ──
function showPage(id,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el)el.classList.add('active');
  document.getElementById('page-title').textContent={dashboard:'ภาพรวม',purchases:'งานจัดซื้อ',catalog:'Catalog สินค้า',vendors:'Vendor',settings:'ตั้งค่าบริษัท'}[id]||id;
  if(id==='settings' && typeof renderCompanyForm==='function') renderCompanyForm();
}
function buildFilterOptions(){
  const sel=document.getElementById('po-filter');
  sel.innerHTML='<option value="">ทุกสถานะ</option><option value="__out__">💰 เฉพาะที่ค้างจ่าย</option>'+STAGES.map(s=>`<option value="${s.n}">${s.n}. ${s.label}</option>`).join('');
}
function stageBadge(stage){ const [t,c]=STAGE_BADGE[stage]||['?','#888']; return `<span class="badge" style="background:${c}22;color:${c}">${stage}. ${t}</span>`; }

function poPaid(po){ const v=(po.stageData&&po.stageData.payment&&po.stageData.payment.vendors)||{}; return Object.values(v).reduce((s,x)=>s+(+x.amount||0),0); }
function poValue(po){
  if(+po.total>0) return +po.total;
  const s=po.stageData||{};
  if(s.po && +s.po.total>0) return +s.po.total;               // ยอดจาก Vendor ที่เลือก (ขั้นเทียบราคา/ออก PO)
  const itemsSum=(po.items||[]).reduce((a,it)=> a + ((it.total!=null&&+it.total>0)?+it.total:(+it.qty||0)*(+it.cost||0)),0);
  if(itemsSum>0) return itemsSum;                              // รวมต้นทุนรายการ
  return poPaid(po);                                           // อย่างน้อยเท่ายอดที่จ่ายแล้ว
}
function renderDash(){
  const list=getPurchases();
  const open=list.filter(p=>p.stage<8 && !p.closed).length;
  const totalValue=list.reduce((s,p)=>s+poValue(p),0);
  const paid=list.reduce((s,p)=>s+poPaid(p),0);
  const outstanding=list.filter(p=>!p.closed).reduce((s,p)=>s+Math.max(0,poValue(p)-poPaid(p)),0);
  const fb=(n,c)=>'฿'+Number(n||0).toLocaleString('th-TH',{maximumFractionDigits:0});
  document.getElementById('stat-grid').innerHTML=
    `<div class="stat"><div class="n">${list.length}</div><div class="l">งานจัดซื้อทั้งหมด</div></div>`+
    `<div class="stat"><div class="n" style="color:var(--accent2)">${open}</div><div class="l">กำลังดำเนินการ</div></div>`+
    `<div class="stat"><div class="n" style="font-size:20px">${fb(totalValue)}</div><div class="l">มูลค่าสั่งซื้อรวม</div></div>`+
    `<div class="stat"><div class="n" style="font-size:20px;color:var(--red)">${fb(outstanding)}</div><div class="l">ค้างจ่าย</div></div>`+
    `<div class="stat"><div class="n" style="font-size:20px;color:var(--green)">${fb(paid)}</div><div class="l">จ่ายแล้ว</div></div>`;
  const active=list.filter(p=>p.stage<8).sort((a,b)=>b.stage-a.stage);
  document.getElementById('dash-body').innerHTML = active.length ? active.map(rowFor).join('')
    : '<tr><td colspan=5 style="text-align:center;padding:28px;color:var(--muted)">ไม่มีงานค้าง 🎉</td></tr>';
  renderReminders();
}
function _todayStr(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function collectReminders(){
  const today=_todayStr(), due=[];
  getPurchases().forEach(po=>{
    if(po.stage>=8) return;
    const s=po.stageData||{};
    const pv=(s.payment&&s.payment.vendors)||{};
    Object.keys(pv).forEach(vid=>{ const rd=pv[vid].remindDate; if(rd && rd<=today) due.push({type:'ครบกำหนดจ่ายเงิน',icon:'💰',date:rd,po,vid}); });
    const sv=(s.shipping&&s.shipping.vendors)||{};
    Object.keys(sv).forEach(vid=>{ const rd=sv[vid].remindDate; if(rd && rd<=today) due.push({type:'ถึงกำหนดส่ง/นัดส่ง',icon:'🚚',date:rd,po,vid}); });
  });
  return due.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
// #9 ส่งอีเมลแจ้งเตือนถึงกำหนด (ครั้งเดียวต่อรายการ — กันสแปม)
async function checkReminderEmails(){
  const due=collectReminders(); if(!due.length) return;
  const to=currentUser&&currentUser.email; if(!to) return;
  let sent={}; const it=_settingsCache.find(i=>i.Title==='RemindSent'); try{ sent=it?(JSON.parse(it.Value||'{}')||{}):{}; }catch(e){ sent={}; }
  const keyOf=r=>r.po.id+'|'+r.type+'|'+r.vid+'|'+r.date;
  const fresh=due.filter(r=>!sent[keyOf(r)]);
  if(!fresh.length) return;
  const rows=fresh.map(r=>'<tr><td style="padding:5px 9px;border:1px solid #ddd">'+r.icon+' '+esc(r.type)+'</td><td style="padding:5px 9px;border:1px solid #ddd">'+esc(getVendorById(r.vid)?.name||'')+'</td><td style="padding:5px 9px;border:1px solid #ddd">'+esc(r.po.quoteTitle||'')+' · '+esc(r.po.client||'')+'</td><td style="padding:5px 9px;border:1px solid #ddd">'+fmtDate(r.date)+'</td></tr>').join('');
  const body='<div style="font-family:Sarabun,sans-serif;font-size:14px"><b>🔔 แจ้งเตือนงานจัดซื้อที่ถึงกำหนด</b><table style="border-collapse:collapse;margin-top:10px"><tr style="background:#f3f3f3"><th style="padding:5px 9px;border:1px solid #ddd">รายการ</th><th style="padding:5px 9px;border:1px solid #ddd">Vendor</th><th style="padding:5px 9px;border:1px solid #ddd">งาน</th><th style="padding:5px 9px;border:1px solid #ddd">กำหนด</th></tr>'+rows+'</table><p style="font-size:12px;color:#888">— PurchasePro</p></div>';
  await _sendMailGraph(to,'🔔 แจ้งเตือนจัดซื้อ ('+fresh.length+' รายการถึงกำหนด)',body);
  fresh.forEach(r=>{ sent[keyOf(r)]=_todayStr(); });
  await putSetting('RemindSent', JSON.stringify(sent));
  toast('ส่งอีเมลแจ้งเตือน '+fresh.length+' รายการแล้ว','info');
}
function renderReminders(){
  const wrap=document.getElementById('pp-reminders'); if(!wrap) return;
  const due=collectReminders();
  if(!due.length){ wrap.innerHTML=''; return; }
  wrap.innerHTML='<div class="card" style="margin-bottom:22px;border-color:var(--amber)"><div class="card-head" style="color:var(--amber)">🔔 แจ้งเตือนถึงกำหนด ('+due.length+')</div><table><tbody>'+
    due.map(r=>`<tr style="cursor:pointer" onclick="openPO('${r.po.id}')"><td style="width:36px">${r.icon}</td><td>${esc(r.type)} — <b>${esc(getVendorById(r.vid)?.name||'')}</b></td><td style="color:var(--muted)">${esc(r.po.quoteTitle||'')} · ${esc(r.po.client||'')}</td><td style="text-align:right;color:var(--red);font-family:var(--mono)">${fmtDate(r.date)}</td></tr>`).join('')+
    '</tbody></table></div>';
}
function rowFor(p){
  return `<tr style="cursor:pointer" onclick="openPO('${p.id}')">
    <td style="font-family:var(--mono);font-size:12px">${esc(p.quoteTitle||'-')}</td>
    <td>${esc(p.client||'-')}</td><td>${esc(p.vendorName||'-')}</td>
    <td style="font-family:var(--mono)">${fmt(poValue(p))}</td><td>${stageBadge(p.stage)}</td></tr>`;
}
// ===== ตะกร้า (Baskets) — จัดกลุ่มงานจัดซื้อ (เก็บใน Settings JSON) =====
//   PurchaseBaskets   = [{id,name,color}]
//   PurchaseBasketMap = { purchaseId: [basketId,...] }
let _poBaskets=null, _poBasketMap=null, _poActiveBasket='__none__', _poBasketView='', _poAssignId=null;
const PO_BASKET_COLORS=['#d97706','#2563eb','#059669','#7c3aed','#db2777','#dc2626','#0d9488','#ca8a04'];
function _getSettingVal(key){ const it=(_settingsCache||[]).find(i=>i.Title===key); return it&&it.Value?it.Value:''; }
function _poBkUser(){ return ((currentUser && currentUser.email) || 'anon').trim().toLowerCase(); }
function _poBkKey(base){ return base+'_'+_poBkUser(); }
function loadPoBaskets(){
  try{ _poBaskets=JSON.parse(BasketPersistence.load(_poBkKey('PurchaseBaskets'),_getSettingVal(_poBkKey('PurchaseBaskets')),_getSettingVal('PurchaseBaskets')||'[]'))||[]; }catch(e){ _poBaskets=[]; }
  try{ _poBasketMap=JSON.parse(BasketPersistence.load(_poBkKey('PurchaseBasketMap'),_getSettingVal(_poBkKey('PurchaseBasketMap')),_getSettingVal('PurchaseBasketMap')||'{}'))||{}; }catch(e){ _poBasketMap={}; }
}
function poBaskets(){ if(_poBaskets===null) loadPoBaskets(); return _poBaskets; }
function poBasketMap(){ if(_poBasketMap===null) loadPoBaskets(); return _poBasketMap; }
function poItemBaskets(id){ return poBasketMap()[String(id)]||[]; }
function poBasketById(bid){ return poBaskets().find(b=>b.id===bid); }
async function savePoBaskets(){ await BasketPersistence.save(_poBkKey('PurchaseBaskets'), JSON.stringify(poBaskets()),putSetting); }
async function savePoBasketMap(){ await BasketPersistence.save(_poBkKey('PurchaseBasketMap'), JSON.stringify(poBasketMap()),putSetting); }
// ── tree helpers (sub-ตะกร้าไม่จำกัดชั้น) ──
function poBasketChildren(pid){ return poBaskets().filter(b=>(b.parentId||'')===(pid||'')); }
function poBasketDescendants(bid){ const out=[bid]; poBasketChildren(bid).forEach(c=>out.push(...poBasketDescendants(c.id))); return out; }
function poBasketAncestors(bid){ const out=[]; let b=poBasketById(bid); while(b&&b.parentId){ b=poBasketById(b.parentId); if(b) out.unshift(b); } return out; }
function poBasketHasChildren(bid){ return poBasketChildren(bid).length>0; }
function poBasketRollupCount(bid){ const set=new Set(poBasketDescendants(bid)), map=poBasketMap(), live=new Set(getPurchases().map(p=>String(p.id))); return Object.keys(map).filter(id=>live.has(id)&&(map[id]||[]).some(x=>set.has(x))).length; }
function poPassBasket(p){ if(!_poActiveBasket) return true; const bs=poItemBaskets(p.id); if(_poActiveBasket==='__none__') return bs.length===0; const set=new Set(poBasketDescendants(_poActiveBasket)); return bs.some(x=>set.has(x)); }
function poBasketDots(id){ const bs=poItemBaskets(id).map(poBasketById).filter(Boolean); return bs.length?' '+bs.map(b=>`<span title="${esc(b.name)}" style="width:8px;height:8px;border-radius:50%;background:${b.color};display:inline-block;margin-left:2px;vertical-align:middle"></span>`).join(''):''; }
function renderPoBasketBar(){
  const bar=document.getElementById('po-basket-bar'); if(!bar) return;
  const map=poBasketMap(), all=getPurchases();
  const uncat=all.filter(p=>!(map[String(p.id)]||[]).length).length;
  const chipBtn=(onclick,label,color,on)=>`<button onclick="${onclick}" style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:16px;border:1px solid ${on?(color||'var(--accent)'):'var(--border2)'};background:${on?(color?color+'22':'var(--accent-soft)'):'var(--surface2)'};color:${on?(color||'var(--accent2)'):'var(--muted)'};font-size:12px;font-family:var(--font);cursor:pointer;font-weight:${on?600:400}">${label}</button>`;
  const folderChip=b=>chipBtn(`openPoBasket('${b.id}')`,`<span style="width:9px;height:9px;border-radius:50%;background:${b.color};display:inline-block"></span> ${esc(b.name)} <span style="opacity:.6">${poBasketRollupCount(b.id)}</span>${poBasketHasChildren(b.id)?' <span style="opacity:.5">▸</span>':''}`,b.color,_poActiveBasket===b.id);
  let crumbs=`<span onclick="gotoPoBasketView('')" style="cursor:pointer;color:${_poBasketView?'var(--accent2)':'var(--text)'}">🏠 หน้าหลัก</span>`;
  poBasketAncestors(_poBasketView).concat(_poBasketView?[poBasketById(_poBasketView)]:[]).filter(Boolean).forEach((b,i,arr)=>{ const last=i===arr.length-1; crumbs+=` <span style="color:var(--muted)">›</span> <span onclick="gotoPoBasketView('${b.id}')" style="cursor:pointer;color:${last?'var(--text)':'var(--accent2)'};font-weight:${last?600:400}">${esc(b.name)}</span>`; });
  let chips='';
  if(_poBasketView===''){
    chips+=chipBtn(`setPoBasketFilter('__none__')`,`📥 ยังไม่จัด <span style="opacity:.6">${uncat}</span>`,null,_poActiveBasket==='__none__');
    poBasketChildren('').forEach(b=>chips+=folderChip(b));
    chips+=chipBtn(`setPoBasketFilter('')`,`ทั้งหมด <span style="opacity:.6">${all.length}</span>`,null,_poActiveBasket==='');
  }else{
    const kids=poBasketChildren(_poBasketView);
    kids.forEach(b=>chips+=folderChip(b));
    if(!kids.length) chips+=`<span style="font-size:11px;color:var(--muted);padding:5px 4px">— ไม่มีตะกร้าย่อย —</span>`;
    chips+=chipBtn(`addPoSubBasket('${_poBasketView}')`,'＋ ตะกร้าย่อย',null,false);
  }
  chips+=`<button onclick="openPoBasketManage()" style="padding:5px 12px;border-radius:16px;border:1px dashed var(--border2);background:none;color:var(--muted);font-size:12px;font-family:var(--font);cursor:pointer">⚙ จัดการตะกร้า</button>`;
  bar.innerHTML=`<div style="font-size:12px;margin-bottom:8px">${crumbs}</div><div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center">${chips}</div>`;
}
function openPoBasket(bid){ _poBasketView=bid; _poActiveBasket=bid; renderPoBasketBar(); renderPurchases(); }
function gotoPoBasketView(id){ _poBasketView=id; _poActiveBasket=id===''?'__none__':id; renderPoBasketBar(); renderPurchases(); }
function setPoBasketFilter(v){ _poActiveBasket=v; if(v===''||v==='__none__') _poBasketView=''; renderPoBasketBar(); renderPurchases(); }
async function addPoSubBasket(pid){
  const name=(prompt('ชื่อตะกร้าย่อย:')||'').trim(); if(!name) return;
  const baskets=poBaskets(); baskets.push({id:'bk'+Date.now(),name,color:PO_BASKET_COLORS[baskets.length%PO_BASKET_COLORS.length],parentId:pid||''});
  try{ await savePoBaskets(); }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); return; }
  renderPoBasketBar(); if(document.getElementById('po-basket-manage-modal')?.classList.contains('open')) renderPoBasketManage();
}
function openPoBasketAssign(id){ _poAssignId=String(id); const p=getPurchases().find(x=>String(x.id)===_poAssignId); const ql=document.getElementById('pba-quote'); if(ql) ql.textContent=(p?.quoteTitle||'')+' — '+(p?.client||''); renderPoBasketAssign(); openModal('po-basket-assign-modal'); }
function _poAssignTreeRows(pid,depth,mine){
  return poBasketChildren(pid).map(b=>{ const on=mine.includes(b.id);
    const row=`<label style="display:flex;align-items:center;gap:9px;padding:6px 10px;margin-left:${depth*18}px;border:1px solid ${on?b.color:'var(--border2)'};border-radius:8px;cursor:pointer;background:${on?b.color+'1a':'transparent'}"><input type="checkbox" ${on?'checked':''} onchange="togglePoBasket('${b.id}')" style="width:auto"><span style="width:10px;height:10px;border-radius:50%;background:${b.color};display:inline-block"></span><span style="font-size:13px">${esc(b.name)}</span></label>`;
    return row+_poAssignTreeRows(b.id,depth+1,mine); }).join('');
}
function renderPoBasketAssign(){
  const list=document.getElementById('pba-list'); if(!list) return;
  const rows=_poAssignTreeRows('',0,poItemBaskets(_poAssignId));
  list.innerHTML = rows || '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">ยังไม่มีตะกร้า — สร้างด้านล่างได้เลย</div>';
}
async function togglePoBasket(bid){
  const map=poBasketMap(), key=_poAssignId, arr=map[key]||[]; const i=arr.indexOf(bid);
  if(i>=0) arr.splice(i,1); else arr.push(bid);
  if(arr.length) map[key]=arr; else delete map[key];
  renderPoBasketAssign(); renderPoBasketBar(); renderPurchases();
  try{ await savePoBasketMap(); }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}
async function poBasketCreateInline(fromManage){
  const inp=document.getElementById(fromManage?'pbm-new':'pba-new'); const name=(inp?.value||'').trim();
  if(!name){ toast('ใส่ชื่อตะกร้าก่อน','error'); return; }
  const baskets=poBaskets(), color=PO_BASKET_COLORS[baskets.length%PO_BASKET_COLORS.length];
  baskets.push({id:'bk'+Date.now(),name,color,parentId:''}); if(inp) inp.value='';
  try{ await savePoBaskets(); }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); return; }
  if(fromManage) renderPoBasketManage(); else renderPoBasketAssign();
  renderPoBasketBar();
}
function openPoBasketManage(){ renderPoBasketManage(); openModal('po-basket-manage-modal'); }
function _poManageTreeRows(pid,depth){
  return poBasketChildren(pid).map(b=>{
    const row=`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin-left:${depth*18}px;border:1px solid var(--border2);border-radius:8px">
      <input type="color" value="${b.color}" onchange="poBasketSetColor('${b.id}',this.value)" style="width:28px;height:28px;padding:1px;border:none;background:none;cursor:pointer">
      <input value="${esc(b.name)}" onchange="poBasketRename('${b.id}',this.value)" style="flex:1">
      <span style="font-size:11px;color:var(--muted);white-space:nowrap">${poBasketRollupCount(b.id)} งาน</span>
      <button class="btn btn-sm" onclick="addPoSubBasket('${b.id}')" title="เพิ่มตะกร้าย่อย">＋ ย่อย</button>
      <button class="btn btn-sm" style="color:var(--red)" onclick="poBasketDelete('${b.id}')">✕</button></div>`;
    return row+_poManageTreeRows(b.id,depth+1); }).join('');
}
function renderPoBasketManage(){
  const list=document.getElementById('pbm-list'); if(!list) return;
  const rows=_poManageTreeRows('',0);
  list.innerHTML = rows || '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">ยังไม่มีตะกร้า</div>';
}
async function poBasketRename(bid,name){ const b=poBasketById(bid); if(!b) return; b.name=(name||'').trim()||b.name; try{ await savePoBaskets(); }catch(e){toast('ยังบันทึกชื่อตะกร้าขึ้นระบบไม่ได้ เก็บรอส่งซ้ำบนเครื่องนี้แล้ว: '+e.message,'error');} renderPoBasketBar(); }
async function poBasketSetColor(bid,color){ const b=poBasketById(bid); if(!b) return; b.color=color; try{ await savePoBaskets(); }catch(e){toast('ยังบันทึกสีตะกร้าขึ้นระบบไม่ได้ เก็บรอส่งซ้ำบนเครื่องนี้แล้ว: '+e.message,'error');} renderPoBasketBar(); renderPoBasketManage(); }
async function poBasketDelete(bid){
  const b=poBasketById(bid); if(!b) return;
  const hasKids=poBasketHasChildren(bid);
  if(!confirm('ลบตะกร้า "'+b.name+'"?'+(hasKids?'\nตะกร้าย่อยจะถูกเลื่อนขึ้นระดับบน':'')+'\nงานจัดซื้อไม่ถูกลบ แค่เอาออกจากตะกร้านี้')) return;
  const parent=b.parentId||'';
  poBaskets().forEach(x=>{ if((x.parentId||'')===bid) x.parentId=parent; });
  _poBaskets=poBaskets().filter(x=>x.id!==bid);
  const map=poBasketMap(); Object.keys(map).forEach(id=>{ const a=map[id].filter(x=>x!==bid); if(a.length) map[id]=a; else delete map[id]; });
  if(_poActiveBasket===bid) _poActiveBasket=parent||'__none__';
  if(_poBasketView===bid) _poBasketView=parent;
  try{ await savePoBaskets(); await savePoBasketMap(); }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
  renderPoBasketManage(); renderPoBasketBar(); renderPurchases();
}

function renderPurchases(){
  renderPoBasketBar();
  const q=(document.getElementById('po-search')?.value||'').toLowerCase();
  const f=document.getElementById('po-filter')?.value||'';
  const vf=document.getElementById('po-vfilter')?.value||'';
  const tf=document.getElementById('po-tfilter')?.value||'';
  // เติมตัวเลือก Vendor ในกรอง
  const vsel=document.getElementById('po-vfilter');
  if(vsel){ const names=[...new Set(getPurchases().map(p=>p.vendorName).filter(Boolean))].sort(); if(vsel.options.length!==names.length+1){ vsel.innerHTML='<option value="">ทุก Vendor</option>'+names.map(n=>`<option>${esc(n)}</option>`).join(''); vsel.value=vf; } }
  let list=getPurchases().filter(p=>!q||(p.quoteTitle||'').toLowerCase().includes(q)||(p.client||'').toLowerCase().includes(q)||(p.vendorName||'').toLowerCase().includes(q));
  if(f==='__out__') list=list.filter(p=>!p.closed && (poValue(p)-poPaid(p))>0);
  else if(f) list=list.filter(p=>String(p.stage)===f);
  if(vf) list=list.filter(p=>p.vendorName===vf);
  if(tf) list=list.filter(p=>(p.assetType||'sale')===tf);
  list=list.filter(poPassBasket);
  document.getElementById('purchases-body').innerHTML = list.length ? list.map(p=>`
    <tr>
      <td style="font-family:var(--mono);font-size:12px">${esc(p.quoteTitle||'-')}${poBasketDots(p.id)}</td>
      <td>${esc(p.client||'-')}</td><td>${esc(p.vendorName||'-')}</td>
      <td style="color:var(--muted)">${(p.items||[]).length} รายการ</td>
      <td style="font-family:var(--mono)">${fmt(poValue(p))}</td>
      <td>${p.closed?'<span class="badge" style="background:#34d39922;color:var(--green)">✓ ปิดงานแล้ว</span>':stageBadge(p.stage)}</td>
      <td style="white-space:nowrap"><div style="display:flex;align-items:center;justify-content:flex-end;gap:6px"><button class="btn btn-sm" onclick="openPoBasketAssign('${p.id}')" title="จัดเข้าตะกร้า" style="display:inline-flex;align-items:center;justify-content:center;padding:6px 8px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg></button>${p.closed?`<button class="btn btn-sm" onclick="openPO('${p.id}',true)">📖 ประวัติ</button>`:`<button class="btn btn-sm" onclick="openPO('${p.id}')">เปิด</button>`}</div></td>
    </tr>`).join('') : '<tr><td colspan=7 style="text-align:center;padding:28px;color:var(--muted)">ยังไม่มีงานจัดซื้อในมุมมองนี้</td></tr>';
}
function renderVendors(){
  document.getElementById('vendors-body').innerHTML = vendorsData.length ? vendorsData.map(v=>`
    <tr><td style="font-weight:500">${esc(v.name)}</td><td>${esc(v.contact||'')}</td><td>${esc(v.phone||'')}</td><td>${esc(v.email||'')}</td>
    <td>${(v.contracts||[]).length?(v.contracts||[]).map(d=>`<a href="${d.url}" target="_blank">📄 ${esc(d.name)}</a>`).join(' '):'<span style="color:var(--muted)">—</span>'}</td></tr>`).join('')
    : '<tr><td colspan=5 style="text-align:center;padding:28px;color:var(--muted)">ยังไม่มี Vendor</td></tr>';
}

// ── สร้างงานจัดซื้อเอง (ไม่ผ่าน SalePro) ──
let _npRows=[];
function openNewPurchase(){
  _npRows=[{name:'',qty:1,unit:'ชิ้น',cost:0}];
  document.getElementById('np-title').value='';
  document.getElementById('np-client').value='';
  document.getElementById('np-assettype').value='asset';
  document.getElementById('np-reqdate').value='';
  renderNpRows();
  openModal('newpo-modal');
}
function renderNpRows(){
  const ip='background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:5px 7px;font-size:12px;color:var(--text);width:100%';
  document.getElementById('np-rows').innerHTML=_npRows.map((r,i)=>`<tr>
    <td><input value="${esc(r.name)}" oninput="npUpd(${i},'name',this.value)" style="${ip}"></td>
    <td><input type="number" min="1" value="${r.qty}" oninput="npUpd(${i},'qty',+this.value)" style="${ip};text-align:center"></td>
    <td><input value="${esc(r.unit)}" oninput="npUpd(${i},'unit',this.value)" style="${ip};text-align:center"></td>
    <td><input type="number" min="0" value="${r.cost}" oninput="npUpd(${i},'cost',+this.value)" style="${ip};text-align:right"></td>
    <td style="text-align:center"><button class="btn btn-sm" onclick="npDel(${i})" style="color:var(--red)">✕</button></td></tr>`).join('');
}
function npAddRow(){ _npRows.push({name:'',qty:1,unit:'ชิ้น',cost:0}); renderNpRows(); }
function npUpd(i,k,v){ _npRows[i][k]=v; }
function npDel(i){ _npRows.splice(i,1); if(!_npRows.length)_npRows.push({name:'',qty:1,unit:'ชิ้น',cost:0}); renderNpRows(); }
// ── เลือกสินค้าจาก Catalog เข้ามาในงานจัดซื้อเอง ──
let _npCatSel={};
async function openNpCatalog(){
  _npCatSel={};
  if(typeof loadCatalogData==='function' && (!catalogData || !catalogData.length)){ try{ await loadCatalogData(); }catch(e){} }
  const s=document.getElementById('npcat-search'); if(s) s.value='';
  renderNpCatalog();
  openModal('npcat-modal');
}
function renderNpCatalog(){
  const body=document.getElementById('npcat-body'); if(!body) return;
  const q=(document.getElementById('npcat-search')?.value||'').toLowerCase();
  const ce=(typeof catExtra==='function')?catExtra:(()=>({}));
  const list=(catalogData||[]).filter(p=>!q||(p.Title||'').toLowerCase().includes(q)||(ce(p.id).pn||p.SKU||'').toLowerCase().includes(q)||(p.Category||'').toLowerCase().includes(q));
  body.innerHTML = list.length ? list.map(p=>{
    const cost=+ce(p.id).cost||0, on=!!_npCatSel[p.id];
    return `<tr style="cursor:pointer${on?';background:var(--accent-soft)':''}" onclick="npCatToggle('${p.id}')">
      <td style="text-align:center"><input type="checkbox" ${on?'checked':''} onclick="event.stopPropagation();npCatToggle('${p.id}')" style="width:auto"></td>
      <td>${esc(p.Title||'')}<div style="font-size:10px;color:var(--muted);font-family:var(--mono)">${esc(ce(p.id).pn||p.SKU||'')}</div></td>
      <td style="color:var(--muted)">${esc(p.Category||'')}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmt(cost)}</td></tr>`;
  }).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">ไม่พบสินค้าใน Catalog</td></tr>`;
  const c=document.getElementById('npcat-count'); if(c) c.textContent='เลือก '+Object.keys(_npCatSel).filter(k=>_npCatSel[k]).length+' รายการ';
}
function npCatToggle(id){ _npCatSel[id]=!_npCatSel[id]; if(!_npCatSel[id]) delete _npCatSel[id]; renderNpCatalog(); }
function confirmNpCatalog(){
  const ce=(typeof catExtra==='function')?catExtra:(()=>({}));
  const ids=Object.keys(_npCatSel).filter(k=>_npCatSel[k]);
  if(!ids.length){ toast('ยังไม่ได้เลือกสินค้า','error'); return; }
  // ลบแถวว่างเริ่มต้นออกถ้ายังไม่ได้กรอก
  if(_npRows.length===1 && !(_npRows[0].name||'').trim()) _npRows=[];
  let added=0;
  ids.forEach(id=>{
    const p=(catalogData||[]).find(x=>String(x.id)===String(id)); if(!p) return;
    const nm=(p.Title||'').trim();
    if(_npRows.some(r=>(r.name||'').trim().toLowerCase()===nm.toLowerCase())) return; // กันซ้ำ
    _npRows.push({name:nm,qty:1,unit:p.Unit||'ชิ้น',cost:+ce(p.id).cost||0,catalogId:id});
    added++;
  });
  if(!_npRows.length) _npRows.push({name:'',qty:1,unit:'ชิ้น',cost:0});
  renderNpRows();
  closeModal('npcat-modal');
  toast(added?('เพิ่ม '+added+' รายการจาก Catalog'):'รายการที่เลือกมีอยู่แล้ว', added?'success':'info');
}
async function saveNewPurchase(){
  const title=document.getElementById('np-title').value.trim();
  if(!title){ toast('กรุณาระบุชื่องาน','error'); return; }
  const items=_npRows.filter(r=>(r.name||'').trim()).map(r=>({name:r.name,qty:+r.qty||1,unit:r.unit||'',cost:+r.cost||0,total:(+r.qty||1)*(+r.cost||0)}));
  if(!items.length){ toast('เพิ่มอย่างน้อย 1 รายการ','error'); return; }
  const id=Date.now();
  const rec={ id, quoteId:null, quoteTitle:title, client:document.getElementById('np-client').value.trim()||'(ซื้อใช้เอง)', vendorName:'', items, total:items.reduce((s,x)=>s+x.total,0), requiredDate:document.getElementById('np-reqdate').value||'', createdBy:currentUser?.displayName||currentUser?.email||'', createdAt:new Date().toISOString(), source:'purchasepro' };
  try{
    toast('กำลังสร้าง...','info');
    procurements.push(rec);
    await putSetting('Procurements', JSON.stringify(procurements));
    // ตั้งประเภทการซื้อไว้ใน Purchase_<id>
    const at=document.getElementById('np-assettype').value||'asset';
    purchaseExt[String(id)]={stage:1,closed:false,assetType:at,assetCategory:'',stageData:{},history:[]};
    await putSetting('Purchase_'+id, JSON.stringify(purchaseExt[String(id)]));
    closeModal('newpo-modal');
    renderDash(); renderPurchases();
    toast('สร้างงานจัดซื้อแล้ว','success');
    openPO(id);
  }catch(e){ toast('สร้างไม่สำเร็จ: '+e.message,'error'); }
}

// ── detail modal ──
let _poReadonly=false;
function openPO(id,readonly){
  const p=getPurchases().find(x=>String(x.id)===String(id));
  if(!p)return;
  _poReadonly = !!readonly || !!p.closed;
  editingPO=JSON.parse(JSON.stringify(p));     // working copy
  if(!editingPO.stageData)editingPO.stageData={};
  _poAttach={};
  document.getElementById('pom-title').textContent=(_poReadonly?'📖 ประวัติ — ':'จัดซื้อ — ')+(p.quoteTitle||'')+' · '+(p.client||'');
  renderStepper(); renderStageBody(); renderFooter();
  openModal('po-modal');
}
// โหมดประวัติ: ปิดเฉพาะช่องกรอก/อัปโหลด แต่ลิงก์ไฟล์แนบ (<a>) ยังกดเปิดดูได้
function applyReadonly(){
  if(!_poReadonly) return;
  const body=document.getElementById('pom-stagebody'); if(!body) return;
  body.querySelectorAll('input,select,textarea').forEach(el=>{ el.disabled=true; });
  // ปุ่มที่แก้ข้อมูล/ส่งเมล ปิด — ยกเว้นลิงก์ <a> (เปิดไฟล์แนบ) ที่ปล่อยให้กดได้
  body.querySelectorAll('button').forEach(b=>{ if(b.getAttribute('data-ro')==='keep')return; b.disabled=true; b.style.opacity='0.5'; b.style.cursor='not-allowed'; });
  body.style.opacity='0.96';
}
// ── Lock ขั้น 5-8 จนกว่า SalePro จะรับ PO ลูกค้า (ยกเว้นงานซื้อใช้เอง) ──
const PO_LOCK_FROM_STAGE = 5;
function _quoteHasCustPO(quoteId){
  // 1) เช็ค DealStatus (Settings): มี custPOs แล้ว หรือได้รับอนุมัติ "ข้ามการรับ PO" แล้ว
  try{ const it=(_settingsCache||[]).find(i=>i.Title==='DealStatus_'+quoteId); if(it){ const ds=JSON.parse(it.Value||'{}');
    if(ds.custPOs&&ds.custPOs.length) return true;
    if(ds.poWaiver && ds.poWaiver.status==='approved') return true;   // SalePro อนุมัติให้ข้ามการรับ PO
    if(ds.poWaiver) return false; // A pending/rejected request is not an approval.
  } }catch(e){}
  // 2) เช็คสถานะใบเสนอราคา (PO Received / Closed = รับ PO แล้ว)
  const q=quotesById[String(quoteId)];
  return !!(q && ['PO Received','Closed'].includes(q.Status));
}
function poStagesLocked(){
  if(!editingPO || !editingPO.quoteId) return false;   // ซื้อใช้เอง (ไม่ผูกใบเสนอราคา) → ไม่ล็อก
  return !_quoteHasCustPO(editingPO.quoteId);
}
let _poGateRefreshing=false;
async function refreshCustomerPOGate(){
  const id=editingPO && editingPO.quoteId;
  if(!id) return;
  const [settings,quotes]=await Promise.all([getListItems(CONFIG.lists.settings),getListItems(CONFIG.lists.quotations)]);
  if(!editingPO || String(editingPO.quoteId)!==String(id)) return;
  const key='DealStatus_'+id;
  _settingsCache=_settingsCache.filter(item=>item.Title!==key);
  const current=settings.find(item=>item.Title===key);
  if(current) _settingsCache.push({...current,_srcList:CONFIG.lists.settings});
  const quote=quotes.find(item=>String(item.id)===String(id));
  if(quote) quotesById[String(id)]=quote; else delete quotesById[String(id)];
}
async function refreshPOLock(){
  if(_poGateRefreshing) return;
  _poGateRefreshing=true;
  try{await refreshCustomerPOGate();renderStepper();renderStageBody();renderFooter();toast(poStagesLocked()?'ยังรอรับ PO หรืออนุมัติคำขอข้าม PO':'สถานะล่าสุดพร้อมดำเนินการขั้น 5–8','info');}
  catch(e){toast('ตรวจสถานะ PO ล่าสุดไม่ได้: '+e.message,'error');}
  finally{_poGateRefreshing=false;}
}
async function canEnterPOStage(target){
  if(!editingPO || _poReadonly || _poGateRefreshing) return false;
  if(target<PO_LOCK_FROM_STAGE || !editingPO.quoteId) return true;
  const purchaseId=String(editingPO.id),quoteId=String(editingPO.quoteId);
  _poGateRefreshing=true;
  try{
    await refreshCustomerPOGate();
    if(!editingPO || String(editingPO.id)!==purchaseId || String(editingPO.quoteId)!==quoteId) return false;
    if(poStagesLocked()){renderStepper();toast('🔒 ต้องได้รับ PO ลูกค้า หรืออนุมัติคำขอข้าม PO ก่อน (ใส่เหตุผลอย่างเดียวยังรออนุมัติ)','error');return false;}
    return true;
  }catch(e){toast('ตรวจสถานะอนุมัติล่าสุดไม่ได้ — ยังไม่เปลี่ยนขั้นตอน: '+e.message,'error');return false;}
  finally{_poGateRefreshing=false;}
}
function _lockedNotice(){
  return `<div class="card" style="border-color:var(--amber)"><div style="padding:22px;text-align:center">
    <div style="font-size:34px;margin-bottom:8px">🔒</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:6px">ยังเปิดขั้นตอนนี้ไม่ได้</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.6">ขั้น 5-8 (ออก PO → จ่ายเงิน → ส่ง → รับของ) จะปลดล็อกเมื่อ<br><b>SalePro ได้รับ PO จากลูกค้า</b> หรือ <b>ได้รับอนุมัติให้ข้ามการรับ PO</b> แล้วเท่านั้น<br>การใส่เหตุผลเป็นเพียงคำขอ ต้องให้ผู้อนุมัติกด “อนุมัติให้ข้าม PO” ใน SalePro ก่อน<br>ตอนนี้ทำได้ถึงขั้นเทียบราคา/ยืนยันสั่งซื้อ (ขั้น 1-4)</div>
    <button class="btn btn-sm" style="margin-top:12px" onclick="refreshPOLock()">↻ ตรวจสถานะอนุมัติล่าสุด</button>
  </div></div>`;
}
function renderStepper(){
  const locked=poStagesLocked();
  document.getElementById('pom-stepper').innerHTML=STAGES.map(s=>{
    const cls=s.n<editingPO.stage?'done':(s.n===editingPO.stage?'current':'');
    const lk=(locked && s.n>=PO_LOCK_FROM_STAGE)?' 🔒':'';
    return `<div class="step ${cls}" onclick="gotoStage(${s.n})" title="${lk?'ล็อก — รอรับ PO ลูกค้า':''}"><span class="sn">${s.n}</span>${s.label}${lk}</div>`;
  }).join('');
}
// ปิดงานได้เมื่อขั้น 6-7-8 สมบูรณ์ทุก Vendor (จ่ายเงิน/ส่ง/รับของ)
function canClosePurchase(){
  const vids=poVendorList(); if(!vids.length) return false;
  return vids.every(vid=>{ const pay=(sd().payment&&sd().payment.vendors&&sd().payment.vendors[vid])||{}; const sh=(sd().shipping&&sd().shipping.vendors&&sd().shipping.vendors[vid])||{}; const rc=(sd().receive&&sd().receive.vendors&&sd().receive.vendors[vid])||{}; return (+pay.amount>0) && sh.date && rc.date; });
}
function renderFooter(){
  const f=document.getElementById('pom-footer'); if(!f)return;
  // ปุ่ม "เพิ่มเข้า Catalog" แยกจาก 8 ขั้น — ใช้ได้ทุกโหมด/ทุกสถานะ (footer ไม่โดน readonly)
  const catBtn='<button class="btn btn-sm" onclick="addPurchaseToCatalog()">➕ เพิ่มเข้า Catalog</button>';
  const docBtn='<button class="btn btn-sm" onclick="openAllDocs()">📂 เอกสารทั้งงาน</button>';
  if(_poReadonly){ f.innerHTML='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+docBtn+catBtn+'<span style="font-size:12px;color:var(--muted)">📖 ดูอย่างเดียว</span></div><button class="btn" onclick="closeModal(\'po-modal\')">ปิด</button>'; return; }
  const st=editingPO.stage;
  let right='<button class="btn" onclick="savePurchase()">💾 บันทึก</button>';
  if(st<8){ right+='<button class="btn btn-primary" onclick="moveStage(1)">ขั้นถัดไป →</button>'; }
  else { const ok=canClosePurchase(); right+=`<button class="btn btn-primary" onclick="closePurchase()" ${ok?'':'disabled style="opacity:0.5;cursor:not-allowed"'} title="${ok?'':'ต้องกรอกขั้น 6 (จ่ายเงิน), 7 (ส่ง), 8 (รับของ) ให้ครบทุก Vendor ก่อน'}">✓ ปิดงาน</button>`; }
  f.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" onclick="moveStage(-1)">← ย้อนขั้น</button>'+docBtn+catBtn+'</div><div style="display:flex;gap:8px">'+right+'</div>';
}
// #8 รวมเอกสารทั้งงาน
function collectAllDocs(){
  const s=editingPO.stageData||{}, out=[];
  const vn=vid=>getVendorById(vid)?.name||vid;
  Object.keys(s.quotes||{}).forEach(vid=>{ const q=s.quotes[vid]; if(q.fileUrl)out.push({cat:'ใบเสนอราคา Vendor',vendor:vn(vid),name:q.fileName||'ไฟล์',url:q.fileUrl}); });
  Object.keys((s.po&&s.po.vendorDocs)||{}).forEach(vid=>{ const d=s.po.vendorDocs[vid]; if(d.round2Url)out.push({cat:'ใบเสนอราคารอบ 2',vendor:vn(vid),name:d.round2Name||'ไฟล์',url:d.round2Url}); if(d.signedUrl)out.push({cat:'PO/เอกสารลงนาม',vendor:vn(vid),name:d.signedName||'ไฟล์',url:d.signedUrl}); });
  Object.keys((s.payment&&s.payment.vendors)||{}).forEach(vid=>{ const p=s.payment.vendors[vid]; if(p.invUrl)out.push({cat:'ใบแจ้งหนี้ Vendor',vendor:vn(vid),name:p.invName||('INV '+(p.invNo||'')),url:p.invUrl}); if(p.slipUrl)out.push({cat:'หลักฐานจ่ายเงิน',vendor:vn(vid),name:p.slipName||'สลิป',url:p.slipUrl}); if(p.whtUrl)out.push({cat:'หนังสือหัก ณ ที่จ่าย',vendor:vn(vid),name:p.whtName||'WHT',url:p.whtUrl}); (p.docs||[]).forEach(dc=>{ if(dc.url)out.push({cat:dc.label||'เอกสารจ่ายเงิน',vendor:vn(vid),name:dc.name||'ไฟล์',url:dc.url}); }); });
  Object.keys((s.shipping&&s.shipping.vendors)||{}).forEach(vid=>{ (s.shipping.vendors[vid].docs||[]).forEach(dc=>{ if(dc.url)out.push({cat:dc.label||'เอกสารส่งของ',vendor:vn(vid),name:dc.name||'ไฟล์',url:dc.url}); }); });
  Object.keys((s.receive&&s.receive.vendors)||{}).forEach(vid=>{ (s.receive.vendors[vid].docs||[]).forEach(dc=>{ if(dc.url)out.push({cat:dc.label||'เอกสารรับของ',vendor:vn(vid),name:dc.name||'ไฟล์',url:dc.url}); }); });
  return out;
}
function openAllDocs(){
  const docs=collectAllDocs();
  // จัดกลุ่มตามหมวด แล้วแสดงเป็น thumbnail grid
  const byCat={}; docs.forEach(d=>{ (byCat[d.cat]=byCat[d.cat]||[]).push(d); });
  document.getElementById('alldocs-body').innerHTML = docs.length
    ? Object.keys(byCat).map(cat=>`<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px">${esc(cat)}</div><div style="display:flex;flex-wrap:wrap;gap:12px">`+byCat[cat].map(d=>`<div style="display:flex;flex-direction:column;align-items:center;gap:3px">${docThumb(d.url,d.name)}<span style="font-size:10px;color:var(--muted);max-width:92px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.vendor)}</span></div>`).join('')+'</div></div>').join('')
    : '<div style="text-align:center;color:var(--muted);padding:24px">ยังไม่มีเอกสารแนบในงานนี้</div>';
  openModal('alldocs-modal');
}
// เพิ่มรายการเข้า Catalog — เปิด modal ให้เลือกก่อน (รายการเยอะ จะได้ติ๊กเอง)
let _catPicks=[];
function addPurchaseToCatalog(){
  const d=sd(); let picks=[];
  if((d.compareMode||'whole')==='item' && d.itemChoice){
    picks=(editingPO.items||[]).map((it,idx)=>({it,idx,vid:d.itemChoice[idx]})).filter(x=>x.vid).map(x=>({name:x.it.name,unit:x.it.unit,cost:vendorItemPrice(x.vid,x.idx),vid:x.vid,sel:true}));
  } else if(d.chosenVendor){
    const vid=String(d.chosenVendor);
    picks=(editingPO.items||[]).map((it,idx)=>({name:it.name,unit:it.unit,cost:vendorItemPrice(vid,idx),vid,sel:true}));
  } else {
    picks=(editingPO.items||[]).map(it=>({name:it.name,unit:it.unit,cost:+it.cost||0,vid:'',sel:true}));
  }
  _catPicks=picks.filter(p=>(p.name||'').trim());
  if(!_catPicks.length){ toast('ไม่มีรายการให้เพิ่ม','error'); return; }
  renderCatImport();
  openModal('catimport-modal');
}
function renderCatImport(){
  const ip='background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:4px 7px;font-size:12px;color:var(--text);width:100%';
  document.getElementById('catimport-rows').innerHTML=_catPicks.map((p,i)=>`<tr style="${p.sel?'':'opacity:0.4'}">
    <td style="text-align:center"><input type="checkbox" ${p.sel?'checked':''} onchange="catSel(${i},this.checked)"></td>
    <td><input value="${esc(p.name)}" oninput="catUpd(${i},'name',this.value)" style="${ip}"></td>
    <td>${esc(p.unit||'')}</td>
    <td><input type="number" min="0" value="${p.cost}" oninput="catUpd(${i},'cost',+this.value)" style="${ip};text-align:right;font-family:var(--mono)"></td></tr>`).join('');
  const n=_catPicks.filter(p=>p.sel).length;
  const cc=document.getElementById('cat-count'); if(cc)cc.textContent='เลือก '+n+' / '+_catPicks.length+' รายการ';
  const all=document.getElementById('cat-all'); if(all)all.checked=n===_catPicks.length&&n>0;
}
function catSel(i,v){ _catPicks[i].sel=v; renderCatImport(); }
function catUpd(i,k,v){ _catPicks[i][k]=v; }
function catToggleAll(v){ _catPicks.forEach(p=>p.sel=v); renderCatImport(); }
async function confirmCatalogImport(){
  const picks=_catPicks.filter(p=>p.sel && (p.name||'').trim());
  if(!picks.length){ toast('ยังไม่ได้เลือกรายการ','error'); return; }
  toast('กำลังเพิ่มเข้า Catalog...','info');
  try{
    if(typeof loadCatalogData==='function') await loadCatalogData();
    let n=0;
    for(const p of picks){ const c=await createListItem(CONFIG.lists.catalog,{Title:p.name,Unit:p.unit||'',Price:0,Category:editingPO.assetCategory||'Hardware',Description:''}); if(typeof catalogExtra!=='undefined') catalogExtra[c.id]={cost:+p.cost||0,vendorId:String(p.vid||''),pn:'',pdoc:null}; n++; }
    if(typeof saveCatalogExtra==='function') await saveCatalogExtra();
    closeModal('catimport-modal');
    toast('เพิ่ม '+n+' รายการเข้า Catalog แล้ว — ปรับราคาขายที่เมนู Catalog','success');
  }catch(e){ toast('เพิ่มไม่สำเร็จ: '+e.message,'error'); }
}
async function gotoStage(n){ if(!await canEnterPOStage(n)) return; editingPO.stage=n; renderStepper(); renderStageBody(); renderFooter(); }
async function moveStage(d){
  // ตั้งแต่ขั้น 2 เป็นต้นไป ต้องระบุหัวข้ออีเมลก่อนถึงจะไปขั้นถัดไปได้
  if(d>0 && editingPO.stage>=2 && !hasMailSubject()){
    toast('กรุณาระบุหัวข้ออีเมลก่อนไปขั้นตอนถัดไป','error');
    const el=document.getElementById('f-subject'); if(el){ el.style.borderColor='var(--red)'; el.focus(); }
    return;
  }
  const n=Math.max(1,Math.min(8,editingPO.stage+d));
  if(d>0 && !await canEnterPOStage(n)) return;
  editingPO.stage=n; renderStepper(); renderStageBody(); renderFooter(); if(d>0) savePurchase();
}
async function closePurchase(){
  if(!canClosePurchase()){ toast('ต้องกรอกขั้น 6-7-8 ให้ครบทุก Vendor ก่อน','error'); return; }
  editingPO.closed=true; editingPO.stage=8;
  await savePurchase();
  closeModal('po-modal');
  toast('ปิดงานจัดซื้อแล้ว','success');
}

function sd(){ return editingPO.stageData; }
function setSD(key,val){ editingPO.stageData[key]=val; }
function field(label,id,val,type){ return `<div class="form-group"><label>${label}</label><input id="${id}" value="${esc(val||'')}" type="${type||'text'}"></div>`; }

function renderStageBody(){
  const st=editingPO.stage, d=sd();
  const items=(editingPO.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${esc(it.name)}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right;font-family:var(--mono)">${fmt(it.cost)}</td><td style="text-align:right;font-family:var(--mono)">${fmt(it.total)}</td></tr>`).join('');
  const itemsTable=`<div class="card" style="margin-bottom:14px"><table><thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>ต้นทุน/หน่วย</th><th>รวม</th></tr></thead><tbody>${items}</tbody></table></div>`;
  let body='';
  if(st===1){
    const at=editingPO.assetType||'sale';
    body=itemsTable+`<div class="form-grid">
      <div class="form-group"><label>Vendor (จาก SalePro)</label><select id="f-vendor">${vendorOptions(editingPO.vendorId)}</select></div>
      ${field('ต้องการของภายใน','f-reqdate',editingPO.requiredDate,'date')}
      <div class="form-group"><label>ประเภทการซื้อ</label><select id="f-assettype"><option value="sale" ${at==='sale'?'selected':''}>เพื่อขาย (ส่งลูกค้า)</option><option value="asset" ${at==='asset'?'selected':''}>ทรัพย์สินบริษัท (เข้า Asset)</option></select></div>
      ${field('หมวด Asset (ถ้าเป็นทรัพย์สิน)','f-assetcat',editingPO.assetCategory||'')}
      <div class="form-group" style="grid-column:1/-1"><label>หมายเหตุ</label><textarea id="f-note">${esc(editingPO.note||'')}</textarea></div>
    </div><div style="font-size:11px;color:var(--accent2);margin-top:6px">💡 ถ้าเลือก "ทรัพย์สินบริษัท" → ทีม Helpdesk จะดึงไปสร้าง Asset ได้หลังปิดงาน</div><div style="font-size:12px;color:var(--muted);margin-top:8px">งานนี้ส่งมาจาก Sale — ตรวจรายการ/Vendor แล้วกด "ขั้นถัดไป" เพื่อเริ่มขอราคา</div>`;
  } else if(st===2){
    body=renderRFQ();
  } else if(st===3){
    body=renderQuotesStage();
  } else if(st===4){
    body=renderCompareStage();
  } else if(st===5){
    body=renderPOStage();
  } else if(st===6){
    body=renderPayStage();
  } else if(st===7){
    body=renderShipStage();
  } else if(st===8){
    body=renderRecvStage();
  }
  if(st>=PO_LOCK_FROM_STAGE && poStagesLocked()) body=_lockedNotice();   // ล็อกขั้น 5-8 จนกว่าจะรับ PO ลูกค้า
  document.getElementById('pom-stagebody').innerHTML=body;
  if(editingPO.stage===8 && typeof renderFooter==='function') renderFooter();   // อัปเดตปุ่มปิดงานตามความครบ
  if(_poReadonly) applyReadonly();
}
function chk(d,grp,key,val){ return (d[grp]&&d[grp][key]===val)?'selected':''; }
function fileLink(o){ return (o&&o.fileUrl)?`<div style="margin-top:8px">${docThumb(o.fileUrl,o.fileName||'ไฟล์แนบ',{small:true})}</div>`:''; }
// ── Thumbnail + Preview (Google Drive native — ไม่ต้องใช้ token) ──
function _driveId(url){ const s=String(url||''); let m=s.match(/\/d\/([-\w]{10,})/)||s.match(/[?&]id=([-\w]{10,})/); return m?m[1]:''; }
function docExt(name,url){ const s=String(name||url||'').split('?')[0]; const m=s.match(/\.([a-z0-9]+)$/i); return m?m[1].toLowerCase():''; }
function docIsImg(name,url){ return ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(docExt(name,url)); }
function docIsPdf(name,url){ return docExt(name,url)==='pdf'; }
function docIcon(name,url){ const e=docExt(name,url); if(docIsPdf(name,url))return'📄'; if(['doc','docx'].includes(e))return'📝'; if(['xls','xlsx','csv'].includes(e))return'📊'; if(['zip','rar','7z'].includes(e))return'🗜️'; return'📎'; }
function docThumb(url,name,opt){ opt=opt||{}; const sz=opt.small?44:92; const label=esc(name||'ไฟล์');
  const payload=`'${encodeURIComponent(url)}','${encodeURIComponent(name||'')}'`;
  const did=_driveId(url);
  const imgSrc = did ? ('https://drive.google.com/thumbnail?id='+did+'&sz=w'+(sz*2)) : url;
  const isImg = docIsImg(name,url) || !!did;   // Drive: ลองโหลด thumbnail เสมอ (ไม่ใช่รูป → fallback ไอคอน)
  const inner = isImg
    ? `<img class="doc-thumb-lazy" src="${imgSrc}" alt="${label}" loading="lazy" style="width:${sz}px;height:${sz}px;object-fit:cover;display:block;background:var(--accent-soft)" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;width:${sz}px;height:${sz}px;align-items:center;justify-content:center;font-size:${opt.small?20:30}px;background:var(--accent-soft)">${docIcon(name,url)}</div>`
    : `<div style="width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;font-size:${opt.small?22:34}px;background:var(--accent-soft)">${docIcon(name,url)}</div>`;
  if(opt.small) return `<span onclick="openDocPreview(${payload})" title="${label}" style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:var(--card);max-width:230px;vertical-align:middle">${inner}<span style="font-size:11px;padding:0 9px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span></span>`;
  return `<div onclick="openDocPreview(${payload})" title="${label}" style="cursor:pointer;border:1px solid var(--border2);border-radius:10px;overflow:hidden;background:var(--card);width:${sz}px"><div style="overflow:hidden;border-bottom:1px solid var(--border2)">${inner}</div><div style="font-size:11px;padding:5px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div></div>`;
}
function openDocPreview(encUrl,encName){ const url=decodeURIComponent(encUrl), name=decodeURIComponent(encName||'');
  let o=document.getElementById('doc-preview-ov');
  if(!o){ o=document.createElement('div'); o.id='doc-preview-ov'; o.onclick=function(e){ if(e.target===o) closeDocPreview(); }; document.body.appendChild(o); }
  o.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:28px';
  const header=`<div style="display:flex;align-items:center;gap:12px;color:#fff;font-size:13px;max-width:90vw"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name||'ไฟล์แนบ')}</span><a href="${url}" target="_blank" rel="noopener" style="color:#9ec1ff;flex-shrink:0">↗ เปิดแท็บใหม่</a><span onclick="closeDocPreview()" style="cursor:pointer;flex-shrink:0;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.18);font-size:16px">✕</span></div>`;
  const wrap=v=>`<div onclick="event.stopPropagation()" style="position:relative;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:10px">${header}${v}</div>`;
  const did=_driveId(url);
  let viewer;
  if(did){ viewer=`<iframe src="https://drive.google.com/file/d/${did}/preview" style="width:min(92vw,900px);height:84vh;border:none;border-radius:8px;background:#fff" allow="autoplay"></iframe>`; }
  else if(docIsImg(name,url)){ viewer=`<img src="${url}" style="max-width:90vw;max-height:84vh;object-fit:contain;border-radius:8px;background:#fff">`; }
  else if(docIsPdf(name,url)){ viewer=`<iframe src="${url}" style="width:min(92vw,900px);height:84vh;border:none;border-radius:8px;background:#fff"></iframe>`; }
  else { viewer=`<div style="background:var(--card);border-radius:12px;padding:30px 34px;text-align:center;max-width:360px"><div style="font-size:52px;margin-bottom:10px">${docIcon(name,url)}</div><div style="font-size:13px;margin-bottom:16px;word-break:break-word">${esc(name||'ไฟล์')}</div><a href="${url}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none">เปิด / ดาวน์โหลด</a></div>`; }
  o.innerHTML=wrap(viewer);
  document.addEventListener('keydown',_docPreviewEsc);
}
function _docPreviewEsc(e){ if(e.key==='Escape') closeDocPreview(); }
function closeDocPreview(){ const o=document.getElementById('doc-preview-ov'); if(o)o.remove(); document.removeEventListener('keydown',_docPreviewEsc); }
// ── ขั้น 3/4: ใบเสนอราคา Vendor (เมทริกซ์ราคารายชิ้น × Vendor จากขั้น 2) ──
function quotesObj(){ const d=sd(); if(!d.quotes||Array.isArray(d.quotes)) d.quotes={}; return d.quotes; }
function quoteFor(vid){ const o=quotesObj(); vid=String(vid); o[vid]=o[vid]||{}; if(!o[vid].prices||typeof o[vid].prices!=='object')o[vid].prices={}; if(typeof o[vid].note!=='string')o[vid].note=''; return o[vid]; }
function itemsForVendor(vid){ const r=rfqData(); vid=String(vid); return (editingPO.items||[]).map((it,idx)=>({it,idx})).filter(({idx})=>{const t=r.itemVendors[idx]||[];return !t.length||t.includes(vid);}); }
function vendorQuoteTotal(vid){ const q=quoteFor(vid); return itemsForVendor(vid).reduce((s,{it,idx})=>s+(+it.qty||0)*(+q.prices[idx]||0),0); }
function setQuotePrice(vid,idx,val){ quoteFor(vid).prices[idx]=(val===''?'':+val); const el=document.getElementById('qtot-'+vid); if(el)el.textContent=fmt(vendorQuoteTotal(vid)); }
function setQuoteNote(vid,val){ quoteFor(vid).note=val; }
async function attachVendorQuoteFile(vid,input){ try{ const r=await uploadFile(input,'PurchaseDocs','quote'); if(r){ const q=quoteFor(vid); q.fileUrl=r.fileUrl; q.fileName=r.fileName; renderStageBody(); } }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); } }

function renderQuotesStage(){
  const r=rfqData();
  if(!r.vendorIds.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่ได้เลือก Vendor ขอราคา — กลับไปขั้น 2 ก่อน</div>';
  return r.vendorIds.map(vid=>{
    const v=getVendorById(vid), q=quoteFor(vid), items=itemsForVendor(vid);
    const rows=items.length?items.map(({it,idx})=>{
      const h=vendorPriceHistory(vid,it.name);
      const hint=h.length?`<div style="font-size:10px;color:var(--accent2)" title="ราคาที่เคยเสนอ">ราคาเดิม ${fmt(h[0].price)}${h[0].date?' · '+fmtDate(h[0].date):''}</div>`:'';
      return `<tr><td>${idx+1}</td><td>${esc(it.name)} <span style="color:var(--muted)">×${it.qty} ${esc(it.unit||'')}</span>${hint}</td>
      <td style="text-align:right"><input type="number" style="max-width:120px;text-align:right" value="${q.prices[idx]??''}" placeholder="0.00" oninput="setQuotePrice('${vid}',${idx},this.value)"></td>
      <td style="text-align:right;font-family:var(--mono);color:var(--muted)">${fmt((+it.qty||0)*(+q.prices[idx]||0))}</td></tr>`;
    }).join('')
      :'<tr><td colspan=4 style="color:var(--muted);text-align:center;padding:14px">ไม่มีรายการที่ tag ให้เจ้านี้</td></tr>';
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-head">🏢 ${esc(v?v.name:'?')}<span style="margin-left:auto;font-size:12px;color:var(--muted)">รวม <span id="qtot-${vid}" style="color:var(--accent2);font-family:var(--mono)">${fmt(vendorQuoteTotal(vid))}</span></span></div>
      <table><thead><tr><th>#</th><th>รายการ</th><th style="text-align:right">ราคา/หน่วย ที่ได้</th><th style="text-align:right">รวม</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="padding:10px 14px;display:flex;gap:10px;align-items:end">
        <div class="form-group" style="flex:1"><label>หมายเหตุ/เงื่อนไข (เครดิต, ส่งกี่วัน ฯลฯ)</label><input value="${esc(q.note||'')}" oninput="setQuoteNote('${vid}',this.value)"></div>
        <div class="form-group"><label>แนบใบเสนอราคา</label><div style="display:flex;gap:6px;align-items:center"><input type="file" onchange="attachVendorQuoteFile('${vid}',this)">${q.fileUrl?docThumb(q.fileUrl,q.fileName||'ใบเสนอราคา',{small:true}):''}</div></div>
      </div></div>`;
  }).join('') + '<div style="font-size:11px;color:var(--muted)">กรอกราคาที่ได้จากแต่ละ Vendor ให้ครบทุกชิ้น แล้วไปขั้นถัดไปเพื่อเทียบราคา</div>';
}

function vendorItemPrice(vid,idx){ return +quoteFor(vid).prices[idx]||0; }
function setCompareMode(m){ sd().compareMode=m; renderStageBody(); }
function renderCompareStage(){
  const r=rfqData();
  if(!r.vendorIds.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่มีข้อมูลราคา — กลับไปขั้น 2/3</div>';
  const mode=sd().compareMode||'whole';
  const on='background:var(--accent);color:#fff;border-color:var(--accent)';
  const tabs=`<div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-sm" style="${mode==='whole'?on:''}" onclick="setCompareMode('whole')">① เลือกทั้งใบ (Vendor เดียว)</button>
    <button class="btn btn-sm" style="${mode==='item'?on:''}" onclick="setCompareMode('item')">② เลือกรายชิ้น (ราคาดีสุด)</button></div>`;
  return tabs + profitPanel() + (mode==='item' ? renderCompareItem() : renderCompareWhole());
}
// #6 ประวัติราคา Vendor: ราคาที่เจ้านี้เคยเสนอสำหรับสินค้าชื่อเดียวกัน (จากงานก่อนๆ)
function vendorPriceHistory(vid,itemName){
  vid=String(vid); const key=(itemName||'').trim().toLowerCase(); if(!key) return [];
  const out=[];
  getPurchases().forEach(p=>{
    if(editingPO && String(p.id)===String(editingPO.id)) return;   // ข้ามงานปัจจุบัน
    const q=p.stageData&&p.stageData.quotes&&p.stageData.quotes[vid];
    if(!q||!q.prices) return;
    (p.items||[]).forEach((it,idx)=>{ if((it.name||'').trim().toLowerCase()===key){ const pr=+q.prices[idx]||0; if(pr>0) out.push({price:pr,date:p.createdAt||''}); } });
  });
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
// #10 สถิติ Vendor
function vendorStats(vid){
  vid=String(vid); let jobs=0,spend=0,shipTotal=0,shipOnTime=0;
  (typeof getPurchases==='function'?getPurchases():[]).forEach(p=>{
    const s=p.stageData||{};
    const used = String(s.chosenVendor||'')===vid || (s.itemChoice&&Object.values(s.itemChoice).map(String).includes(vid)) || (s.payment&&s.payment.vendors&&s.payment.vendors[vid]);
    if(!used) return;
    jobs++;
    const pay=s.payment&&s.payment.vendors&&s.payment.vendors[vid]; if(pay) spend+=+pay.amount||0;
    const sh=s.shipping&&s.shipping.vendors&&s.shipping.vendors[vid];
    if(sh&&sh.date){ shipTotal++; if(!p.requiredDate||sh.date<=p.requiredDate) shipOnTime++; }
  });
  return {jobs,spend,onTimePct: shipTotal?Math.round(shipOnTime/shipTotal*100):null};
}
function chosenCostTotal(){
  const d=sd();
  if((d.compareMode||'whole')==='item' && d.itemChoice){ return (editingPO.items||[]).reduce((s,it,idx)=>{ const vid=d.itemChoice[idx]; return s+(vid?(+it.qty||0)*vendorItemPrice(vid,idx):0); },0); }
  if(d.chosenVendor) return vendorQuoteTotal(String(d.chosenVendor));
  return +editingPO.total||0;
}
// ราคาขาย (ก่อน VAT) เฉพาะรายการที่ดึงเข้ามาทำในงานจัดซื้อนี้
// จับคู่ editingPO.items กับรายการในใบเสนอราคาด้วยชื่อ แล้วรวม qty*ราคา*(1-ส่วนลดรายชิ้น)
function quoteSellForItems(){
  const qid=String(editingPO.quoteId);
  const lines=(quoteItemsByQuote[qid]||[]).filter(l=>!String(l.Title||'').startsWith('__'));
  if(!lines.length) return null;
  const byName={}; lines.forEach(l=>{ byName[(l.Title||'').trim().toLowerCase()]=l; });
  let sell=0, matched=0;
  (editingPO.items||[]).forEach(it=>{
    const l=byName[(it.name||'').trim().toLowerCase()];
    if(!l) return;
    matched++;
    const price=+l.UnitPrice||0, ldisc=(+l.DiscountPct||0)/100, qty=+l.Quantity||+it.qty||1;
    sell+=qty*price*(1-ldisc);
  });
  return matched?sell:null;
}
// #5 เทียบกำไร: ราคาขายจากใบเสนอราคา SalePro vs ต้นทุนที่เลือก
function profitPanel(){
  const q = (editingPO.quoteId!=null) ? quotesById[String(editingPO.quoteId)] : null;
  if(!q) return '';
  const disc=(+q.DiscountPct||0)/100;
  const itemSell=quoteSellForItems();
  const partial=(itemSell!=null);
  const sell=partial?itemSell:((+q.SubTotal>0)?(+q.SubTotal*(1-disc)):((+q.TotalAmount||0)/1.07));
  const cost=chosenCostTotal();
  const profit=sell-cost, pct=sell>0?(profit/sell*100):0;
  const col=profit>=0?'var(--green)':'var(--red)';
  return `<div class="card" style="padding:10px 14px;margin-bottom:12px;border-color:${col}">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">กำไรขั้นต้น (เทียบใบเสนอราคา)${partial?' · เฉพาะรายการที่ดึงมาทำ':''}</div>
    <div style="display:flex;justify-content:space-between;font-size:12px"><span>ราคาขายก่อน VAT — ${esc(q.Title||'')}${partial?' ('+(editingPO.items||[]).length+' รายการ)':''}</span><span style="font-family:var(--mono)">${fmt(sell)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:12px"><span>ต้นทุนจัดซื้อที่เลือก</span><span style="font-family:var(--mono)">${fmt(cost)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px solid var(--border);margin-top:4px;padding-top:4px;color:${col}"><span>กำไร</span><span style="font-family:var(--mono)">${fmt(profit)}${sell>0?' ('+pct.toFixed(1)+'%)':''}</span></div>
  </div>`;
}
function renderCompareWhole(){
  const r=rfqData(), chosen=String(sd().chosenVendor||'');
  const rowsV=r.vendorIds.map(vid=>({vid,name:getVendorById(vid)?.name||'?',total:vendorQuoteTotal(vid),note:quoteFor(vid).note}));
  const withPrice=rowsV.filter(x=>x.total>0), min=withPrice.length?Math.min(...withPrice.map(x=>x.total)):0;
  const sent=(sd().confirmSent||[]).map(s=>s.email);
  return `<div style="font-size:13px;margin-bottom:10px">เทียบยอดรวมแต่ละ Vendor แล้วเลือกเจ้าเดียวสั่งทั้งใบ (ถูกสุด ✓)</div>
    <div class="card"><table><thead><tr><th>Vendor</th><th style="text-align:right">ยอดรวม</th><th>หมายเหตุ</th><th>เลือก</th></tr></thead><tbody>
    ${rowsV.map(x=>`<tr${chosen===String(x.vid)?' style="background:var(--accent-soft)"':''}>
      <td>${esc(x.name)}${(x.total===min&&min>0)?' <span style="color:var(--green)">✓ ถูกสุด</span>':''}</td>
      <td style="text-align:right;font-family:var(--mono)">${x.total>0?fmt(x.total):'<span style="color:var(--muted)">ยังไม่กรอก</span>'}</td>
      <td style="color:var(--muted);font-size:12px">${esc(x.note||'')}</td>
      <td><input type="radio" name="chosenV" style="width:auto" ${chosen===String(x.vid)?'checked':''} onchange="chooseVendor('${x.vid}')"></td></tr>`).join('')}
    </tbody></table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
      <div style="font-size:11px;color:${sent.length?'var(--green)':'var(--muted)'}">${sent.length?'✓ ยืนยันแล้ว: '+sent.map(esc).join(', '):(chosen?'เลือก: '+esc(getVendorById(chosen)?.name||''):'ยังไม่เลือก')}</div>
      <div style="display:flex;gap:8px"><button class="btn btn-sm" onclick="openTplEditor('confirm')">✏️ ปรับข้อความ</button><button class="btn btn-primary" onclick="confirmPurchaseWhole()">📧 ส่งอีเมลยืนยันการสั่งซื้อ</button></div>
    </div>`;
}
function renderCompareItem(){
  const r=rfqData(), d=sd(); d.itemChoice=d.itemChoice||{};
  const blocks=(editingPO.items||[]).map((it,idx)=>{
    const cands=r.vendorIds.filter(vid=>itemsForVendor(vid).some(x=>x.idx===idx)).map(vid=>({vid,name:getVendorById(vid)?.name||'?',price:vendorItemPrice(vid,idx)}));
    const priced=cands.filter(c=>c.price>0);
    const min=priced.length?Math.min(...priced.map(c=>c.price)):0;
    if(d.itemChoice[idx]==null && priced.length){ d.itemChoice[idx]=String(priced.find(c=>c.price===min).vid); }
    const opts=cands.map(c=>`<label style="display:inline-flex;align-items:center;gap:5px;margin:2px 10px 2px 0;font-size:12px;cursor:pointer">
      <input type="radio" name="ic-${idx}" style="width:auto" ${String(d.itemChoice[idx])===String(c.vid)?'checked':''} ${c.price>0?'':'disabled'} onchange="pickItemVendor(${idx},'${c.vid}')">
      ${esc(c.name)} <span style="font-family:var(--mono);color:${(c.price===min&&min>0)?'var(--green)':'var(--muted)'}">${c.price>0?fmt(c.price)+(c.price===min?' ✓':''):'—'}</span></label>`).join('');
    return `<div style="border-bottom:1px solid var(--border);padding:8px 0"><div style="font-size:13px;font-weight:500">${idx+1}. ${esc(it.name)} <span style="color:var(--muted);font-weight:400">×${it.qty} ${esc(it.unit||'')}</span></div><div style="margin-top:4px">${opts||'<span style="color:var(--muted);font-size:12px">ไม่มี Vendor เสนอราคา</span>'}</div></div>`;
  }).join('');
  // สรุปต่อ Vendor
  const byV={};
  (editingPO.items||[]).forEach((it,idx)=>{ const vid=d.itemChoice[idx]; if(!vid)return; (byV[vid]=byV[vid]||[]).push({it,idx,price:vendorItemPrice(vid,idx)}); });
  const summary=Object.keys(byV).map(vid=>{ const tot=byV[vid].reduce((s,x)=>s+(+x.it.qty||0)*x.price,0); return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span>${esc(getVendorById(vid)?.name||'?')} (${byV[vid].length} รายการ)</span><span style="font-family:var(--mono);color:var(--accent2)">${fmt(tot)}</span></div>`; }).join('');
  const sent=(d.confirmSent||[]).map(s=>s.email);
  return `<div style="font-size:13px;margin-bottom:8px">เลือก Vendor ที่ราคาดีที่สุดในแต่ละรายการ (ค่าเริ่มต้น = ถูกสุด ✓) แล้วตกลงซื้อเฉพาะรายการที่เลือก</div>
    <div class="card" style="padding:6px 14px;margin-bottom:12px">${blocks}</div>
    ${summary?`<div class="card" style="padding:10px 14px;margin-bottom:12px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">สรุปสั่งซื้อต่อ Vendor</div>${summary}</div>`:''}
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:${sent.length?'var(--green)':'var(--muted)'}">${sent.length?'✓ ยืนยันแล้ว: '+sent.map(esc).join(', '):'ยังไม่ยืนยัน'}</div>
      <div style="display:flex;gap:8px"><button class="btn btn-sm" data-ro="keep" onclick="addItemsToCatalog()">➕ เพิ่มเข้า Catalog</button><button class="btn btn-sm" onclick="openTplEditor('confirm')">✏️ ปรับข้อความ</button><button class="btn btn-primary" onclick="confirmPurchaseItems()">📧 ตกลงซื้อ + ส่งอีเมลยืนยัน</button></div>
    </div>`;
}
function pickItemVendor(idx,vid){ const d=sd(); d.itemChoice=d.itemChoice||{}; d.itemChoice[idx]=String(vid); renderStageBody(); }
// เพิ่มรายการที่เลือก (พร้อมราคาทุนที่ได้) เข้า Catalog — ปรับราคาขาย/รายละเอียดทีหลัง
async function addItemsToCatalog(){
  const ic=sd().itemChoice||{};
  const picks=(editingPO.items||[]).map((it,idx)=>({it,idx,vid:ic[idx]})).filter(x=>x.vid);
  if(!picks.length){ toast('ยังไม่ได้เลือกรายการ','error'); return; }
  if(!confirm('เพิ่ม '+picks.length+' รายการเข้า Catalog?\n(ราคาขายตั้งเป็น 0 ก่อน ค่อยปรับที่หน้า Catalog)')) return;
  toast('กำลังเพิ่มเข้า Catalog...','info');
  try{
    if(typeof loadCatalogData==='function') await loadCatalogData();
    let n=0;
    for(const x of picks){
      const cost=vendorItemPrice(x.vid,x.idx);
      const c=await createListItem(CONFIG.lists.catalog,{Title:x.it.name,Unit:x.it.unit||'',Price:0,Category:'Hardware',Description:''});
      if(typeof catalogExtra!=='undefined') catalogExtra[c.id]={cost:cost,vendorId:String(x.vid),pn:'',pdoc:null};
      n++;
    }
    if(typeof saveCatalogExtra==='function') await saveCatalogExtra();
    toast('เพิ่ม '+n+' รายการเข้า Catalog แล้ว — ปรับราคาขาย/รายละเอียดที่เมนู Catalog','success');
  }catch(e){ toast('เพิ่มไม่สำเร็จ: '+e.message,'error'); }
}
function chooseVendor(vid){ vid=String(vid); sd().chosenVendor=vid; const v=getVendorById(vid); editingPO.vendorId=vid; editingPO.vendorName=v?v.name:''; const d=sd(); d.po=Object.assign({},d.po,{total:vendorQuoteTotal(vid)}); renderStageBody(); }

// ── เทมเพลตอีเมล (ผู้ใช้ปรับเองได้ — เก็บใน Settings: MailTemplates) ──
let mailTemplates = {};
const DEFAULT_TPL = {
  rfq:
`เรียน คุณ{contact}

ทาง D On Net สนใจสั่งซื้อสินค้า/บริการ และขอความอนุเคราะห์ใบเสนอราคาตามรายการดังนี้ครับ/ค่ะ

{items}

รบกวนเสนอราคาที่ดีที่สุดกลับมาด้วยนะครับ/คะ{date}
{note}

ขอบคุณมากครับ/ค่ะ
{sender}
{senderEmail}`,
  confirm:
`เรียน คุณ{contact}

ตามที่ได้เสนอราคามา ทาง D On Net ขอยืนยันการสั่งซื้อตามรายการดังนี้ครับ/ค่ะ

{items}

ยอดรวมทั้งสิ้น {total}
รบกวนยืนยันกำหนดส่งและจัดเตรียมเอกสารให้ด้วยนะครับ/คะ

ขอบคุณมากครับ/ค่ะ
{sender}
{senderEmail}`,
  sendback:
`เรียน คุณ{contact}

ทาง D On Net ขอส่งเอกสารที่ลงนามเรียบร้อยแล้วกลับมา ตามรายการที่ตกลงสั่งซื้อครับ/ค่ะ

{items}

รบกวนดำเนินการจัดส่ง/ออกเอกสารตามที่ตกลงด้วยนะครับ/คะ

ขอบคุณมากครับ/ค่ะ
{sender}
{senderEmail}`
};
function getTpl(type){ return (mailTemplates && mailTemplates[type]) || DEFAULT_TPL[type] || ''; }
async function loadMailTemplates(){ try{ const it=(_settingsCache||[]).find(i=>i.Title==='MailTemplates'); mailTemplates=(it&&it.Value)?(JSON.parse(it.Value)||{}):{}; }catch(e){ mailTemplates={}; } }
// แทนที่ placeholder → คืน HTML body
function mailBody(type, ctx){
  let t = esc(getTpl(type));   // กันข้อความผู้ใช้ (escape) — placeholder {x} ไม่มีอักขระพิเศษจึงรอด
  const dateTxt = ctx.date ? (' ภายในวันที่ '+fmtDate(ctx.date)) : '';
  t = t.replace(/\{contact\}/g, esc(ctx.contact||ctx.vendorName||''))
       .replace(/\{vendor\}/g, esc(ctx.vendorName||''))
       .replace(/\{date\}/g, dateTxt)
       .replace(/\{total\}/g, ctx.total!=null?fmt(ctx.total):'')
       .replace(/\{note\}/g, ctx.note?esc(ctx.note):'')
       .replace(/\{sender\}/g, esc(currentUser&&currentUser.displayName||''))
       .replace(/\{senderEmail\}/g, esc(currentUser&&currentUser.email||''));
  const html = t.split('{items}').map(p=>p.replace(/\n/g,'<br>')).join(ctx.itemsHtml||'');
  return '<div style="font-family:Sarabun,sans-serif;font-size:14px;color:#222">'+html+'</div>';
}
function itemsTableHtml(rows, opts){ opts=opts||{};
  const head='<tr style="background:#f3f3f3">'+(opts.cols||['รายการ','จำนวน']).map(c=>'<th style="padding:5px 9px;border:1px solid #ddd">'+c+'</th>').join('')+'</tr>';
  return '<table style="border-collapse:collapse;margin:6px 0">'+head+rows+'</table>';
}
// ── ตัวแก้เทมเพลต ──
let _tplType=null;
function openTplEditor(type){ _tplType=type; const ta=document.getElementById('tpl-text'); if(ta)ta.value=getTpl(type); const tl={rfq:'ขอราคา (RFQ)',confirm:'ยืนยันสั่งซื้อ',sendback:'ส่งกลับ Vendor'}; const h=document.getElementById('tpl-title'); if(h)h.textContent='ปรับข้อความอีเมล — '+(tl[type]||type); openModal('tpl-modal'); }
async function saveTpl(){ if(!_tplType)return; const ta=document.getElementById('tpl-text'); mailTemplates[_tplType]=ta.value; try{ await putSetting('MailTemplates',JSON.stringify(mailTemplates)); closeModal('tpl-modal'); toast('บันทึกข้อความแล้ว','success'); renderStageBody(); }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); } }
function resetTpl(){ if(!_tplType)return; document.getElementById('tpl-text').value=DEFAULT_TPL[_tplType]||''; }

function buildConfirmBody(v,lines,total){
  const rows=lines.map((l,i)=>'<tr><td style="padding:5px 9px;border:1px solid #ddd">'+(i+1)+'</td><td style="padding:5px 9px;border:1px solid #ddd">'+esc(l.name)+'</td><td style="padding:5px 9px;border:1px solid #ddd;text-align:center">'+l.qty+' '+esc(l.unit||'')+'</td><td style="padding:5px 9px;border:1px solid #ddd;text-align:right">'+fmt(l.price)+'</td><td style="padding:5px 9px;border:1px solid #ddd;text-align:right">'+fmt((+l.qty||0)*l.price)+'</td></tr>').join('');
  const itemsHtml=itemsTableHtml(rows,{cols:['#','รายการ','จำนวน','ราคา/หน่วย','รวม']});
  return mailBody('confirm',{vendorName:v.name,contact:v.contact||v.name,total,itemsHtml});
}
async function confirmPurchaseWhole(){
  const vid=String(sd().chosenVendor||''); if(!vid){ toast('เลือก Vendor ก่อน','error'); return; }
  const v=getVendorById(vid); if(!v||!v.email){ toast('Vendor นี้ไม่มีอีเมล','error'); return; }
  const lines=itemsForVendor(vid).map(({it,idx})=>({name:it.name,qty:it.qty,unit:it.unit,price:vendorItemPrice(vid,idx)}));
  const total=lines.reduce((s,l)=>s+(+l.qty||0)*l.price,0);
  await sendConfirm([{v,lines,total}]);
}
async function confirmPurchaseItems(){
  const d=sd(); d.itemChoice=d.itemChoice||{};
  const byV={};
  (editingPO.items||[]).forEach((it,idx)=>{ const vid=d.itemChoice[idx]; if(!vid)return; (byV[vid]=byV[vid]||[]).push({name:it.name,qty:it.qty,unit:it.unit,price:vendorItemPrice(vid,idx)}); });
  const groups=Object.keys(byV).map(vid=>{ const v=getVendorById(vid); const lines=byV[vid]; return {v,lines,total:lines.reduce((s,l)=>s+(+l.qty||0)*l.price,0),vid}; });
  if(!groups.length){ toast('ยังไม่ได้เลือกรายการ','error'); return; }
  await sendConfirm(groups);
}
async function sendConfirm(groups){
  toast('กำลังส่งอีเมลยืนยัน...','info');
  const sent=[], fail=[];
  for(const g of groups){
    if(!g.v||!g.v.email){ fail.push((g.v&&g.v.name||'?')+' (ไม่มีอีเมล)'); continue; }
    if(!g.lines.length) continue;
    try{ await _sendMailGraph(g.v.email,getMailSubject(),buildConfirmBody(g.v,g.lines,g.total)); sent.push({vendorId:String(g.vid||g.v.id||''),email:g.v.email,ts:new Date().toISOString()}); }
    catch(e){ fail.push(g.v.name+': '+e.message); }
  }
  sd().confirmSent=sent;
  await savePurchase(); renderStageBody();
  if(sent.length) toast('ส่งอีเมลยืนยันแล้ว '+sent.length+' เจ้า','success');
  if(fail.length) toast('ส่งไม่สำเร็จ: '+fail.join(' / '),'error');
}
// ── ขั้น 2: RFQ (เลือก Vendor แบบ tag + tag ราย item + ส่งเมลจริง) ──
function rfqData(){ const d=sd(); const r=d.rfq=d.rfq||{}; if(!Array.isArray(r.vendorIds))r.vendorIds=[]; if(!r.itemVendors||typeof r.itemVendors!=='object')r.itemVendors={}; if(typeof r.note!=='string')r.note=''; if(!Array.isArray(r.sent))r.sent=[]; return r; }
function renderRFQ(){
  const r=rfqData();
  if(!vendorsData.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่มี Vendor ในระบบ — ไปเพิ่มที่เมนู <b>🏢 Vendor</b> ก่อน (ต้องมีอีเมลด้วย)</div>';
  const selChips=r.vendorIds.length?r.vendorIds.map(vid=>{ const v=getVendorById(vid); const noMail=!v||!v.email;
    return `<span title="${v?(noMail?'ยังไม่มีอีเมล':esc(v.email)):''}" style="display:inline-flex;align-items:center;gap:6px;margin:0 6px 6px 0;padding:5px 6px 5px 11px;border-radius:14px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent2);font-size:12px">${esc(v?v.name:'?')}${noMail?' ⚠':''}<span onclick="rfqToggleVendor('${vid}')" title="นำออก" style="cursor:pointer;display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;border-radius:50%;background:rgba(0,0,0,.08);font-size:11px">✕</span></span>`; }).join(''):'<span style="font-size:12px;color:var(--muted)">ยังไม่ได้เลือก Vendor — ค้นหาแล้วกดเพิ่มด้านล่าง</span>';
  const cand=r.vendorIds;
  const itemRows=(editingPO.items||[]).map((it,idx)=>{
    const tags=r.itemVendors[idx]||[];
    const chips=cand.length?cand.map(vid=>{const v=getVendorById(vid);const on=tags.includes(String(vid));return `<span onclick="rfqToggleItem(${idx},'${vid}')" style="cursor:pointer;display:inline-block;margin:2px;padding:2px 8px;border-radius:12px;font-size:11px;border:1px solid ${on?'var(--accent)':'var(--border2)'};color:${on?'var(--accent2)':'var(--muted)'}">${on?'✓ ':''}${esc(v?v.name:'?')}</span>`;}).join(''):'<span style="font-size:11px;color:var(--muted)">— เลือก Vendor ด้านบนก่อน</span>';
    return `<tr><td>${idx+1}</td><td>${esc(it.name)} <span style="color:var(--muted)">×${it.qty} ${esc(it.unit||'')}</span></td><td>${chips}</td></tr>`;
  }).join('');
  const noMailWarn=cand.some(id=>{const v=getVendorById(id);return !v||!v.email;});
  return subjectField()+`<div style="font-size:13px;margin-bottom:8px">เลือก Vendor ที่จะขอราคา (ดึงจากหน้า Vendor)</div>
    <div id="rfq-sel-chips" style="margin-bottom:8px">${selChips}</div>
    <div style="position:relative;max-width:360px;margin-bottom:6px">
      <input id="rfq-vsearch" oninput="rfqFilterVendors(this.value)" onfocus="rfqFilterVendors(this.value)" autocomplete="off" placeholder="🔍 ค้นหา Vendor เพื่อเพิ่ม…" style="width:100%;padding:7px 10px;border:1px solid var(--border2);border-radius:8px;font-size:13px;background:var(--card);color:var(--text)">
      <div id="rfq-vresults" style="display:none;position:absolute;z-index:30;left:0;right:0;top:100%;margin-top:2px;max-height:220px;overflow:auto;background:var(--card);border:1px solid var(--border2);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18)"></div>
    </div>
    ${noMailWarn?'<div style="font-size:11px;color:var(--red);margin-bottom:8px">⚠ Vendor ที่มี ⚠ ยังไม่มีอีเมล — เพิ่มอีเมลที่หน้า Vendor ก่อนส่ง</div>':''}
    <div style="font-size:12px;color:var(--muted);margin:10px 0 6px">Tag Vendor ให้แต่ละรายการ (ไม่ tag = ขอทุกเจ้าที่เลือก)</div>
    <div class="card" style="margin-bottom:12px"><table><thead><tr><th>#</th><th>รายการ</th><th>ขอจาก Vendor</th></tr></thead><tbody>${itemRows}</tbody></table></div>
    <div class="form-group" style="margin-bottom:12px"><label>ข้อความเพิ่มเติมในอีเมล</label><textarea id="f-rfqnote">${esc(r.note||'')}</textarea></div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:${(r.sent&&r.sent.length)?'var(--green)':'var(--muted)'}">${(r.sent&&r.sent.length)?'✓ ส่งแล้ว: '+r.sent.map(s=>esc(s.email)).join(', '):'ยังไม่ได้ส่ง'}</div>
      <div style="display:flex;gap:8px"><button class="btn btn-sm" onclick="openTplEditor('rfq')">✏️ ปรับข้อความ</button><button class="btn btn-primary" onclick="sendRFQ()">📧 ส่งอีเมลขอราคา</button></div>
    </div>`;
}
function _rfqCaptureNote(){ const n=document.getElementById('f-rfqnote'); if(n) rfqData().note=n.value; }
function rfqToggleVendor(vid){ _rfqCaptureNote(); const r=rfqData(); vid=String(vid); const i=r.vendorIds.indexOf(vid); if(i>=0)r.vendorIds.splice(i,1); else r.vendorIds.push(vid); renderStageBody(); }
function rfqAddVendor(vid){ _rfqCaptureNote(); const r=rfqData(); vid=String(vid); if(!r.vendorIds.includes(vid)) r.vendorIds.push(vid); renderStageBody(); }
function rfqFilterVendors(q){ const box=document.getElementById('rfq-vresults'); if(!box) return; const r=rfqData();
  q=(q||'').trim().toLowerCase();
  const avail=vendorsData.filter(v=>!r.vendorIds.includes(String(v.id)))
    .filter(v=>!q || (v.name||'').toLowerCase().includes(q) || (v.email||'').toLowerCase().includes(q));
  if(!avail.length){ box.innerHTML='<div style="padding:9px 11px;font-size:12px;color:var(--muted)">'+(vendorsData.length?'ไม่พบ Vendor ที่ตรง':'ยังไม่มี Vendor ในระบบ')+'</div>'; box.style.display='block'; return; }
  box.innerHTML=avail.slice(0,30).map(v=>{ const noMail=!v.email;
    return `<div onclick="rfqAddVendor('${v.id}')" style="padding:8px 11px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border2)" onmouseover="this.style.background='var(--accent-soft)'" onmouseout="this.style.background='transparent'">${esc(v.name)}${noMail?' <span style=\"color:var(--red)\">⚠ ไม่มีอีเมล</span>':' <span style=\"color:var(--muted);font-size:11px\">'+esc(v.email)+'</span>'}</div>`; }).join('');
  box.style.display='block';
}
function rfqToggleItem(idx,vid){ _rfqCaptureNote(); const r=rfqData(); vid=String(vid); r.itemVendors[idx]=r.itemVendors[idx]||[]; const a=r.itemVendors[idx]; const i=a.indexOf(vid); if(i>=0)a.splice(i,1); else a.push(vid); renderStageBody(); }
function buildRFQBody(v,items,note){
  const rows=items.map((it,i)=>'<tr><td style="padding:5px 9px;border:1px solid #ddd">'+(i+1)+'</td><td style="padding:5px 9px;border:1px solid #ddd">'+esc(it.name)+'</td><td style="padding:5px 9px;border:1px solid #ddd;text-align:center">'+it.qty+' '+esc(it.unit||'')+'</td></tr>').join('');
  const itemsHtml=itemsTableHtml(rows,{cols:['#','รายการ','จำนวน']});
  return mailBody('rfq',{vendorName:v.name,contact:v.contact||v.name,date:editingPO.requiredDate,note,itemsHtml});
}
async function sendRFQ(){
  const r=rfqData(); _rfqCaptureNote();
  if(!hasMailSubject()){ toast('กรุณาระบุหัวข้ออีเมลก่อนส่ง','error'); const el=document.getElementById('f-subject'); if(el){ el.style.borderColor='var(--red)'; el.focus(); } return; }
  if(!r.vendorIds.length){ toast('เลือก Vendor อย่างน้อย 1 เจ้า','error'); return; }
  toast('กำลังส่งอีเมล...','info');
  const sent=[], fail=[];
  for(const vid of r.vendorIds){
    const v=getVendorById(vid);
    if(!v||!v.email){ fail.push((v&&v.name||vid)+' (ไม่มีอีเมล)'); continue; }
    const items=(editingPO.items||[]).filter((it,idx)=>{ const t=r.itemVendors[idx]||[]; return !t.length || t.includes(String(vid)); });
    if(!items.length){ continue; }
    try{ await _sendMailGraph(v.email,getMailSubject(),buildRFQBody(v,items,r.note)); sent.push({vendorId:String(vid),email:v.email,ts:new Date().toISOString()}); }
    catch(e){ fail.push(v.name+': '+e.message); }
  }
  r.sent=sent;
  await savePurchase();
  renderStageBody();
  if(sent.length) toast('ส่งอีเมลขอราคาแล้ว '+sent.length+' เจ้า','success');
  if(fail.length) toast('ส่งไม่สำเร็จ: '+fail.join(' / '),'error');
}

// ── ขั้น 5: ออก PO / เซน-ส่งกลับ Vendor (ล้อกับโหมดขั้น 4) ──
let _poAttach = {};   // {vid:{name,b64,mime}} — ไฟล์ที่จะแนบอีเมล (ไม่เก็บลง Settings)
function poVendorList(){ const d=sd(); const mode=d.compareMode||'whole'; if(mode==='item'){ return [...new Set(Object.values(d.itemChoice||{}).map(String))]; } return d.chosenVendor?[String(d.chosenVendor)]:[]; }
function poVendorDocs(vid){ const d=sd(); d.po=d.po||{}; d.po.vendorDocs=d.po.vendorDocs||{}; vid=String(vid); d.po.vendorDocs[vid]=d.po.vendorDocs[vid]||{}; return d.po.vendorDocs[vid]; }
function poItemsForVendor(vid){ const d=sd(); const mode=d.compareMode||'whole'; if(mode==='item'){ const ic=d.itemChoice||{}; return (editingPO.items||[]).map((it,idx)=>({it,idx})).filter(({idx})=>String(ic[idx])===String(vid)); } return itemsForVendor(vid); }
function renderPOStage(){
  const d=sd(); const mode=d.compareMode||'whole';
  const vids=poVendorList();
  if(!vids.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่ได้เลือก Vendor ในขั้น 4 — กลับไปเลือกก่อน</div>';
  const head=`<div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:10px"><div style="font-size:13px">${mode==='item'?'โหมดรายชิ้น: นำเข้า<b>ใบเสนอราคารอบ 2</b> (เฉพาะรายการที่เลือก) → เซน (อัปโหลดไฟล์ที่ลงนาม) → ส่งกลับ Vendor':'โหมดทั้งใบ: นำ<b>ใบเสนอราคาที่แนบไว้ขั้น 3</b> มาเซน (อัปโหลดไฟล์ที่ลงนาม) → ส่งกลับ Vendor'}</div><button class="btn btn-sm" style="flex-shrink:0" onclick="openTplEditor('sendback')">✏️ ปรับข้อความ</button></div>`+subjectField();
  const cards=vids.map(vid=>{
    const v=getVendorById(vid), vd=poVendorDocs(vid);
    const round1=mode==='whole'?quoteFor(vid):null;   // ใบเสนอราคารอบ 1 จากขั้น 3
    const items=poItemsForVendor(vid);
    const itemList=items.map(({it,idx})=>`<li>${esc(it.name)} ×${it.qty} ${esc(it.unit||'')}${mode==='item'?' — '+fmt(vendorItemPrice(vid,idx)):''}</li>`).join('');
    return `<div class="card" style="margin-bottom:14px"><div class="card-head">🏢 ${esc(v?v.name:'?')}${(!v||!v.email)?' <span style="color:var(--red);font-size:11px">⚠ ไม่มีอีเมล</span>':''}</div>
      <div style="padding:12px 14px">
        <div class="form-group" style="margin-bottom:8px"><label>เลขที่ PO</label><div style="display:flex;gap:8px;align-items:center"><input value="${esc(vd.poNo||'')}" oninput="setPONo('${vid}',this.value)" placeholder="PO-2606-001" style="max-width:180px;font-family:var(--mono)"><button class="btn btn-sm" onclick="genPONo('${vid}')">🔢 ออกเลขอัตโนมัติ</button></div></div>
        <ul style="margin:0 0 10px 18px;font-size:12px;color:var(--muted)">${itemList||'<li>—</li>'}</ul>
        ${mode==='whole'
          ? `<div style="font-size:12px;margin-bottom:8px">ใบเสนอราคา (ขั้น 3): ${round1&&round1.fileUrl?docThumb(round1.fileUrl,round1.fileName||'ใบเสนอราคา',{small:true}):'<span style="color:var(--red)">— ไม่ได้แนบในขั้น 3</span>'}</div>`
          : `<div class="form-group" style="margin-bottom:8px"><label>① ใบเสนอราคารอบ 2 (เฉพาะรายการที่เลือก)</label><div style="display:flex;gap:8px;align-items:center"><input type="file" onchange="uploadPODoc('${vid}','round2',this)"><span style="font-size:11px;color:var(--muted)">${vd.round2Url?docThumb(vd.round2Url,vd.round2Name||'รอบ 2',{small:true}):'ยังไม่นำเข้า'}</span></div></div>`}
        <div class="form-group" style="margin-bottom:8px"><label>${mode==='item'?'②':''} ไฟล์ที่ลงนามแล้ว (เซน)</label><div style="display:flex;gap:8px;align-items:center"><input type="file" onchange="uploadPODoc('${vid}','signed',this)"><span style="font-size:11px;color:var(--muted)">${vd.signedUrl?docThumb(vd.signedUrl,vd.signedName||'ไฟล์ลงนาม',{small:true}):'ยังไม่อัปโหลด'}</span></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span style="font-size:11px;color:${vd.sentAt?'var(--green)':'var(--muted)'}">${vd.sentAt?'✓ ส่งกลับแล้ว '+fmtDate(vd.sentAt):'ยังไม่ส่งกลับ'}</span>
          <div style="display:flex;gap:8px"><button class="btn btn-sm" data-ro="keep" onclick="printPO('${vid}')">🖨 พิมพ์ PO</button><button class="btn btn-primary btn-sm" onclick="sendBackVendor('${vid}')">📧 ส่งกลับ Vendor</button></div>
        </div>
      </div></div>`;
  }).join('');
  return head+cards;
}
// ── #4 พิมพ์ใบสั่งซื้อ (PO) ส่ง Vendor ──
let COMPANY = { name:'บริษัท ดี ออน เน็ต จำกัด', nameEn:'D ON NET CO.,LTD.', address:'สำนักงานใหญ่ : เลขที่ 78 หมู่ที่ 11 ตำบลผาเลือด อำเภอท่าปลา จังหวัดอุตรดิตถ์ 53190', taxId:'535569001005', phone:'091-5192945', fax:'-', logo:'', stamp:'', approverSign:'' };
// โหลด/บันทึกตั้งค่าบริษัท (เก็บใน Settings JSON คีย์ POCompany — รูป base64)
function loadPOCompany(){
  try{ const it=(_settingsCache||[]).find(i=>i.Title==='POCompany'); if(it&&it.Value){ const o=JSON.parse(it.Value)||{}; COMPANY=Object.assign(COMPANY,o); } }catch(e){}
}
// รูป 3 ชนิด: logo / stamp (ตราประทับ) / sign (ลายเซนผู้อนุมัติ → COMPANY.approverSign)
const _POIMG={ logo:{key:'logo',ph:'คลิกเพื่ออัปโหลดโลโก้'}, stamp:{key:'stamp',ph:'คลิกเพื่ออัปโหลดตราประทับ'}, sign:{key:'approverSign',ph:'คลิกเพื่ออัปโหลดลายเซน'} };
let _pendingPOImg={};
function _poImgPrev(type){ const m=_POIMG[type]; const p=document.getElementById('co-'+type+'-preview'); if(!p)return; const src=_pendingPOImg[type]||COMPANY[m.key]||''; p.innerHTML = src ? '<img src="'+src+'" style="max-width:100%;max-height:100%;object-fit:contain">' : '<span style="font-size:12px;color:var(--muted)">'+m.ph+'</span>'; }
function previewPOImage(input,type){
  const file=input.files&&input.files[0]; if(!file)return;
  const r=new FileReader(); r.onload=e=>{ _pendingPOImg[type]=e.target.result; _poImgPrev(type); }; r.readAsDataURL(file);
}
function clearPOImage(type){ _pendingPOImg[type]=''; COMPANY[_POIMG[type].key]=''; _poImgPrev(type); }
function renderCompanyForm(){
  const g=(id,v)=>{ const el=document.getElementById(id); if(el)el.value=v==null?'':v; };
  g('co-name',COMPANY.name); g('co-nameen',COMPANY.nameEn); g('co-address',COMPANY.address);
  g('co-phone',COMPANY.phone); g('co-fax',COMPANY.fax); g('co-taxid',COMPANY.taxId);
  _pendingPOImg={}; _poImgPrev('logo'); _poImgPrev('stamp'); _poImgPrev('sign');
}
async function saveCompanySettings(){
  const g=id=>document.getElementById(id)?document.getElementById(id).value.trim():'';
  Object.keys(_POIMG).forEach(t=>{ if(_pendingPOImg[t]) COMPANY[_POIMG[t].key]=_pendingPOImg[t]; });
  COMPANY.name=g('co-name'); COMPANY.nameEn=g('co-nameen'); COMPANY.address=g('co-address');
  COMPANY.phone=g('co-phone'); COMPANY.fax=g('co-fax'); COMPANY.taxId=g('co-taxid');
  try{
    toast('กำลังบันทึก...','info');
    await putSetting('POCompany', JSON.stringify({name:COMPANY.name,nameEn:COMPANY.nameEn,address:COMPANY.address,phone:COMPANY.phone,fax:COMPANY.fax,taxId:COMPANY.taxId,logo:COMPANY.logo||'',stamp:COMPANY.stamp||'',approverSign:COMPANY.approverSign||''}));
    _pendingPOImg={};
    toast('บันทึกตั้งค่าบริษัทสำเร็จ','success');
  }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}
// พรีวิวเอกสารในแอป (modal) — ปุ่มพิมพ์เปิดแท็บใหม่ / ปุ่มปิดครั้งเดียว ไม่กระทบหน้าหลัก
function printViaIframe(html){
  const old=document.getElementById('_docOverlay'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_docOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.62);display:flex;flex-direction:column;align-items:center;padding:12px 0';
  const bar=document.createElement('div');
  bar.style.cssText='width:100%;max-width:900px;display:flex;justify-content:space-between;align-items:center;padding:0 6px 10px;gap:10px';
  bar.innerHTML='<div style="color:#fff;font-size:13px;font-weight:600">พรีวิวเอกสาร</div>';
  const btns=document.createElement('div'); btns.style.cssText='display:flex;gap:8px';
  const printBtn=document.createElement('button'); printBtn.textContent='🖨 พิมพ์ / บันทึก PDF';
  printBtn.style.cssText='padding:8px 18px;background:#17356b;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer';
  const closeBtn=document.createElement('button'); closeBtn.textContent='✕ ปิด';
  closeBtn.style.cssText='padding:8px 16px;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer';
  btns.appendChild(printBtn); btns.appendChild(closeBtn); bar.appendChild(btns); ov.appendChild(bar);
  const f=document.createElement('iframe'); f.id='_printFrame';
  f.style.cssText='width:100%;max-width:900px;flex:1;min-height:0;border:none;border-radius:8px;background:#fff;box-shadow:0 12px 44px rgba(0,0,0,0.45)';
  ov.appendChild(f); document.body.appendChild(ov); f.srcdoc=html;
  function close(){ ov.remove(); document.removeEventListener('keydown',onKey); }
  function onKey(e){ if(e.key==='Escape'){ e.stopPropagation(); close(); } }
  printBtn.onclick=function(){ const w=window.open('','_blank'); if(!w){ if(typeof toast==='function')toast('เบราว์เซอร์บล็อกป๊อปอัป — โปรดอนุญาตแล้วลองใหม่','error'); return; } w.document.open(); w.document.write(html); w.document.close(); setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },500); };
  closeBtn.onclick=close;
  ov.addEventListener('mousedown',function(e){ if(e.target===ov) close(); });
  document.addEventListener('keydown',onKey);
}
// จำนวนเงินเป็นตัวอักษรไทย
function bahtText(amount){
  const num=['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  const unit=['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
  function readInt(s){ s=String(s).replace(/^0+/,''); if(s==='')return ''; const len=s.length;
    if(len>6){ return readInt(s.slice(0,len-6))+'ล้าน'+readInt(s.slice(len-6)); }
    let res=''; for(let i=0;i<len;i++){ const d=+s[i],pos=len-i-1; if(d===0)continue;
      if(pos===0&&d===1&&len>1)res+='เอ็ด'; else if(pos===1&&d===2)res+='ยี่'; else if(pos===1&&d===1)res+=''; else res+=num[d]; res+=unit[pos]; }
    return res; }
  let n=Math.abs(Number(amount)||0); const baht=Math.floor(n); const satang=Math.round((n-baht)*100);
  if(baht===0&&satang===0)return 'ศูนย์บาทถ้วน';
  let t=''; if(baht>0)t+=readInt(String(baht))+'บาท';
  t+=satang>0?readInt(String(satang))+'สตางค์':(baht>0?'ถ้วน':'');
  return (Number(amount)<0?'ลบ':'')+t;
}
// ── จัดหน้า PO: แทรกบรรทัดเปล่า / ขึ้นหน้าใหม่ (เก็บใน vendorDocs.layout) ──
function poLayout(vid){ const vd=poVendorDocs(vid); if(!Array.isArray(vd.layout))vd.layout=[]; return vd.layout; }
function addPORow(vid,after,type){ poLayout(vid).push({id:Date.now()+Math.floor(Math.random()*1000),after:after,type:type}); _poRefresh(vid); if(typeof savePurchase==='function')savePurchase(); }
function delPORow(vid,id){ const vd=poVendorDocs(vid); vd.layout=(vd.layout||[]).filter(m=>String(m.id)!==String(id)); _poRefresh(vid); if(typeof savePurchase==='function')savePurchase(); }
function _poSequence(vid){
  const items=poItemsForVendor(vid); const lay=poLayout(vid);
  const seq=[]; const marks=a=>lay.filter(m=>m.after===a).sort((x,y)=>x.id-y.id).forEach(m=>seq.push({t:m.type,id:m.id}));
  marks(-1); items.forEach((rec,i)=>{ seq.push({t:'item',rec,i}); marks(i); });
  return {items,seq};
}
// ── โหมด Manual: ปรับรายการบน PO เองไม่จำกัด (ยอดรวมท้ายเอกสารคงที่ตามยอดจริง) ──
function poManualRows(vid){ const vd=poVendorDocs(vid); if(!Array.isArray(vd.manualRows))vd.manualRows=[]; return vd.manualRows; }
// ── คอลัมน์ตาราง PO: ซ่อน/แสดง + ปรับความกว้างได้ ──
const PO_COLS=[
  {k:'seq', th:'ลำดับ', w:38},
  {k:'pn', th:'รหัสสินค้า', w:84},
  {k:'name', th:'รายการ', flex:true, always:true},
  {k:'qty', th:'จำนวน', w:60},
  {k:'unit', th:'หน่วยนับ', w:64},
  {k:'price', th:'ราคาต่อหน่วย', w:92},
  {k:'amt', th:'จำนวนเงิน', w:100},
];
function poColCfg(vid){ const vd=poVendorDocs(vid); if(!vd.cols||typeof vd.cols!=='object')vd.cols={}; if(!vd.cols.vis)vd.cols.vis={}; if(!vd.cols.w)vd.cols.w={}; return vd.cols; }
function poVisCols(vid){ const c=poColCfg(vid); return PO_COLS.filter(col=>col.always || c.vis[col.k]!==false); }
function poColW(vid,k){ const c=poColCfg(vid); const def=(PO_COLS.find(x=>x.k===k)||{}).w; return (c.w[k]!=null&&c.w[k]!=='')?+c.w[k]:def; }
function togglePOCol(vid,k,on){ const c=poColCfg(vid); c.vis[k]=!!on; _poRefresh(vid); if(typeof savePurchase==='function')savePurchase(); }
function setPOColWidth(vid,k,val){ const c=poColCfg(vid); c.w[k]=val; const lbl=document.getElementById('po-cw-'+k); if(lbl)lbl.textContent=val+'px'; clearTimeout(_poColWT); _poColWT=setTimeout(function(){ _poRefreshFrame(vid); if(typeof savePurchase==='function')savePurchase(); },250); }
let _poColWT=null;
function poRealSub(vid){ let s=0; poItemsForVendor(vid).forEach(({it,idx})=>{ s+=(+it.qty||0)*vendorItemPrice(vid,idx); }); return s; }
function poManualSum(vid){ return poManualRows(vid).reduce((s,r)=>s+(+r.amt||0),0); }
function poToggleManual(vid,on){
  const vd=poVendorDocs(vid); vd.manual=!!on;
  if(on && (!vd.manualRows||!vd.manualRows.length)){
    vd.manualRows=poItemsForVendor(vid).map(({it,idx})=>{ const price=vendorItemPrice(vid,idx), qty=+it.qty||0;
      return {t:'item', pn:it.pn||it.partNo||it.PartNumber||'', name:it.name||'', desc:it.desc||it.Description||'', qty:qty||'', unit:it.unit||'', price:price||'', amt:(qty*price)||''}; });
  }
  _poRefresh(vid); if(typeof savePurchase==='function')savePurchase();
}
function addPOManualRow(vid,type){
  const row = type==='group' ? {t:'group',name:'หัวข้อกลุ่ม',align:'left'}
            : type==='note'  ? {t:'note',name:'',desc:''}
            : {t:'item',pn:'',name:'',desc:'',qty:'',unit:'',price:'',amt:''};
  poManualRows(vid).push(row); _poRefresh(vid); if(typeof savePurchase==='function')savePurchase();
}
function delPOManualRow(vid,i){ poManualRows(vid).splice(i,1); _poRefresh(vid); if(typeof savePurchase==='function')savePurchase(); }
function movePOManualRow(vid,i,dir){ const a=poManualRows(vid); const j=i+dir; if(j<0||j>=a.length)return; const t=a[i]; a[i]=a[j]; a[j]=t; _poRefresh(vid); if(typeof savePurchase==='function')savePurchase(); }
function setPOManualAlign(vid,i,a){ const rows=poManualRows(vid); if(rows[i])rows[i].align=a; _poRefresh(vid); if(typeof savePurchase==='function')savePurchase(); }
let _poManT=null;
function setPOManual(vid,i,field,val){
  const a=poManualRows(vid); if(a[i])a[i][field]=val;
  if(typeof updatePOManualWarn==='function')updatePOManualWarn(vid);
  clearTimeout(_poManT); _poManT=setTimeout(function(){ _poRefreshFrame(vid); if(typeof savePurchase==='function')savePurchase(); },350);
}
function poManualWarnHtml(vid){
  const real=poRealSub(vid), man=poManualSum(vid), diff=Math.round((man-real)*100)/100;
  if(Math.abs(diff)<0.01) return '<span style="color:#15803d">✓ ผลรวมรายการตรงกับยอดจริง ('+fmt(real)+')</span>';
  return '<span style="color:#b91c1c">⚠ ผลรวมรายการ '+fmt(man)+' ≠ ยอดจริง '+fmt(real)+' (ต่าง '+fmt(diff)+')</span>';
}
function updatePOManualWarn(vid){ const el=document.getElementById('po-man-warn'); if(el)el.innerHTML=poManualWarnHtml(vid); }

// ── นำเข้ารายการจากใบเสนอราคา Vendor (วางจาก Excel/ตาราง) ──
function _poNum(s){ const n=parseFloat(String(s).replace(/[,\s฿]/g,'')); return isNaN(n)?'':n; }
function _poIsNum(s){ s=String(s).trim(); return s!=='' && /^[\d,.\s฿]+$/.test(s) && !isNaN(parseFloat(s.replace(/[,\s฿]/g,''))); }
function parsePOPaste(text){
  const out=[];
  String(text||'').split(/\r?\n/).forEach(function(line){
    if(!line.trim()) return;
    let cells = line.indexOf('\t')>=0 ? line.split('\t') : line.split(/\s{2,}|\s*\|\s*|,(?=\s)/);
    cells = cells.map(function(c){return c.trim();}).filter(function(c,i,a){return !(c===''&&(i===0||i===a.length-1));});
    if(!cells.length) return;
    const joined=cells.join(' ').toLowerCase();
    const hasNum=cells.some(_poIsNum);
    if(!hasNum && /(รายการ|description|จำนวนเงิน|amount|unit\s*price|ราคา|ลำดับ|qty|จำนวน|หน่วย)/.test(joined)) return; // ข้ามแถวหัวตาราง
    if(cells.length>=4 && /^\d+\.?$/.test(cells[0])) cells=cells.slice(1);   // ตัดเลขลำดับนำหน้า
    if(!cells.length) return;
    const name=cells[0]||'';
    const rest=cells.slice(1);
    const nums=[], texts=[];
    rest.forEach(function(c){ if(_poIsNum(c)) nums.push(_poNum(c)); else if(c) texts.push(c); });
    let qty='',unit=texts[0]||'',price='',amt='';
    if(nums.length>=3){ qty=nums[0]; price=nums[nums.length-2]; amt=nums[nums.length-1]; }
    else if(nums.length===2){ price=nums[0]; amt=nums[1]; }
    else if(nums.length===1){ amt=nums[0]; }
    if(name || amt!=='' ) out.push({name:name, desc:'', qty:qty, unit:unit, price:price, amt:amt});
  });
  return out;
}
// ── ดูดรายการจากไฟล์ใบเสนอราคา Vendor ด้วย AI (Claude Vision) ──
var PO_AI_MODEL='claude-sonnet-5';
function getAIKey(){ try{ return localStorage.getItem('po_ai_key')||''; }catch(e){ return ''; } }
function setAIKey(k){ try{ localStorage.setItem('po_ai_key', k||''); }catch(e){} }
function _fileToB64(file){ return new Promise(function(res,rej){ const r=new FileReader(); r.onload=function(e){ res(String(e.target.result).split(',')[1]||''); }; r.onerror=rej; r.readAsDataURL(file); }); }
async function callClaudeExtract(b64, mediaType){
  const key=getAIKey(); if(!key) throw new Error('ยังไม่ได้ใส่ API key');
  const isPdf=/pdf/i.test(mediaType||'');
  const fileBlock = isPdf
    ? { type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 } }
    : { type:'image',    source:{ type:'base64', media_type:(mediaType||'image/png'), data:b64 } };
  const PROMPT='นี่คือใบเสนอราคาของผู้ขาย (vendor quotation). ดึงเฉพาะ "รายการสินค้า/บริการ" ในตาราง ส่งกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น. แต่ละ object มีคีย์: '
    +'name (ชื่อรายการ/รายละเอียด, string), qty (จำนวน เป็นตัวเลข หรือ ""), unit (หน่วยนับ, string), '
    +'price (ราคาต่อหน่วย เป็นตัวเลขไม่มีคอมมา/สกุลเงิน หรือ ""), amt (จำนวนเงินรวมของรายการนั้น เป็นตัวเลข หรือ ""). '
    +'ห้ามรวมแถวหัวตาราง, ส่วนลด, ภาษี VAT, หรือยอดรวมสุทธิ. ตอบเป็น JSON array ล้วน ๆ.';
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{ 'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model:PO_AI_MODEL, max_tokens:4096, messages:[{ role:'user', content:[ fileBlock, { type:'text', text:PROMPT } ] }] })
  });
  if(!r.ok){ let msg=''; try{ msg=(await r.json()).error?.message||''; }catch(e){ msg=await r.text(); } throw new Error('AI '+r.status+': '+(msg||'').slice(0,200)); }
  const data=await r.json();
  let t=(data.content||[]).map(function(c){return c.text||'';}).join('').trim();
  const m=t.match(/\[[\s\S]*\]/); if(m)t=m[0];
  let arr; try{ arr=JSON.parse(t); }catch(e){ throw new Error('อ่านผลลัพธ์ AI ไม่สำเร็จ'); }
  if(!Array.isArray(arr)) throw new Error('ผลลัพธ์ไม่ใช่รายการ');
  const num=v=>{ if(v===''||v==null)return ''; const n=parseFloat(String(v).replace(/[,\s฿]/g,'')); return isNaN(n)?'':n; };
  return arr.map(function(r){ return { name:String(r.name||r.description||''), desc:'', qty:num(r.qty!=null?r.qty:r.quantity), unit:String(r.unit||''), price:num(r.price!=null?r.price:r.unitPrice), amt:num(r.amt!=null?r.amt:(r.amount!=null?r.amount:r.total)) }; })
            .filter(function(x){ return x.name || x.amt!==''; });
}
function openPOAIImport(vid){
  const old=document.getElementById('_poAI'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_poAI';
  ov.style.cssText='position:fixed;inset:0;z-index:100002;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:10px;width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#17356b">🤖 ดูดรายการจากใบเสนอราคา Vendor (AI)</div>'
    +'<div style="padding:12px 16px;overflow:auto">'
    +'<div style="font-size:12px;color:#334155;font-weight:600;margin-bottom:4px">Anthropic API key</div>'
    +'<input id="_aiKey" type="password" value="'+esc(getAIKey())+'" placeholder="sk-ant-..." style="width:100%;font-size:12px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:4px">'
    +'<div style="font-size:10.5px;color:#b45309;margin-bottom:10px">⚠ key เก็บในเบราว์เซอร์นี้ และส่งตรงไป Anthropic — อย่าใช้ในเครื่องสาธารณะ</div>'
    +'<div style="font-size:12px;color:#334155;font-weight:600;margin-bottom:4px">ไฟล์ใบเสนอราคา (PDF หรือ รูปภาพ)</div>'
    +'<input id="_aiFile" type="file" accept=".pdf,image/*" style="width:100%;font-size:12px;margin-bottom:10px">'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px"><input type="checkbox" id="_aiAppend"> เพิ่มต่อท้ายรายการเดิม (ไม่ติ๊ก = แทนที่)</label>'
    +'<div id="_aiStatus" style="font-size:12px;color:#64748b;min-height:18px"></div>'
    +'</div>'
    +'<div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px">'
    +'<button id="_aiCancel" style="padding:7px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">ยกเลิก</button>'
    +'<button id="_aiOk" style="padding:7px 16px;border:none;background:#17356b;color:#fff;border-radius:6px;cursor:pointer">ดูดข้อมูล</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  const close=function(){ ov.remove(); };
  document.getElementById('_aiCancel').onclick=close;
  ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
  document.getElementById('_aiOk').onclick=async function(){
    const key=document.getElementById('_aiKey').value.trim(); setAIKey(key);
    const f=document.getElementById('_aiFile').files[0];
    const st=document.getElementById('_aiStatus');
    if(!key){ st.innerHTML='<span style="color:#b91c1c">กรุณาใส่ API key</span>'; return; }
    if(!f){ st.innerHTML='<span style="color:#b91c1c">กรุณาเลือกไฟล์</span>'; return; }
    st.innerHTML='⏳ กำลังอ่านไฟล์และวิเคราะห์ด้วย AI...';
    const okBtn=document.getElementById('_aiOk'); okBtn.disabled=true; okBtn.style.opacity='0.6';
    try{
      const b64=await _fileToB64(f);
      const mt=f.type|| (/\.pdf$/i.test(f.name)?'application/pdf':'image/png');
      const rows=await callClaudeExtract(b64, mt);
      if(!rows.length){ st.innerHTML='<span style="color:#b91c1c">ไม่พบรายการในไฟล์</span>'; okBtn.disabled=false; okBtn.style.opacity='1'; return; }
      const vd=poVendorDocs(vid); vd.manual=true;
      vd.manualRows = document.getElementById('_aiAppend').checked ? poManualRows(vid).concat(rows) : rows;
      close(); _poRefresh(vid); if(typeof savePurchase==='function')savePurchase();
      toast('ดูดข้อมูลสำเร็จ '+rows.length+' รายการ','success');
    }catch(e){ st.innerHTML='<span style="color:#b91c1c">ไม่สำเร็จ: '+esc(e.message)+'</span>'; okBtn.disabled=false; okBtn.style.opacity='1'; }
  };
}
function openPOPasteImport(vid){
  const old=document.getElementById('_poPaste'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_poPaste';
  ov.style.cssText='position:fixed;inset:0;z-index:100002;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:10px;width:560px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#17356b">📋 วางจากใบเสนอราคา Vendor</div>'
    +'<div style="padding:12px 16px;overflow:auto">'
    +'<div style="font-size:12px;color:#64748b;margin-bottom:8px">คัดลอกตารางรายการจากใบเสนอราคา (Excel / PDF / Word) แล้ววางด้านล่าง<br>คอลัมน์ที่รองรับ: <b>รายการ · จำนวน · หน่วย · ราคา/หน่วย · จำนวนเงิน</b> (ระบบเดาคอลัมน์ให้ ปรับแก้ภายหลังได้)</div>'
    +'<textarea id="_poPasteTxt" placeholder="วางที่นี่ (Ctrl+V)..." style="width:100%;min-height:200px;font-size:12px;font-family:monospace;border:1px solid #cbd5e1;border-radius:6px;padding:8px;line-height:1.5"></textarea>'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:10px"><input type="checkbox" id="_poPasteAppend"> เพิ่มต่อท้ายรายการเดิม (ไม่ติ๊ก = แทนที่ทั้งหมด)</label>'
    +'</div>'
    +'<div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px">'
    +'<button id="_poPasteCancel" style="padding:7px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">ยกเลิก</button>'
    +'<button id="_poPasteOk" style="padding:7px 16px;border:none;background:#17356b;color:#fff;border-radius:6px;cursor:pointer">แปลง & ใส่</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  const txt=document.getElementById('_poPasteTxt'); if(txt)txt.focus();
  document.getElementById('_poPasteCancel').onclick=function(){ ov.remove(); };
  ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
  document.getElementById('_poPasteOk').onclick=function(){
    const parsed=parsePOPaste(document.getElementById('_poPasteTxt').value);
    if(!parsed.length){ toast('ไม่พบรายการจากข้อความที่วาง','error'); return; }
    const vd=poVendorDocs(vid); vd.manual=true;
    const append=document.getElementById('_poPasteAppend').checked;
    vd.manualRows = append ? poManualRows(vid).concat(parsed) : parsed;
    ov.remove();
    _poRefresh(vid); if(typeof savePurchase==='function')savePurchase();
    toast('นำเข้า '+parsed.length+' รายการแล้ว','success');
  };
}

// สร้าง HTML ใบสั่งซื้อ (หลายหน้า, footer ยึดล่าง, เลขหน้า)
function buildPOHtml(vid){
  const v=getVendorById(vid)||{name:'-'}; const vd=poVendorDocs(vid);
  const NAVY='#17356b';
  const fmt2=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const cB='border-right:1px solid '+NAVY+'55;';
  const manual=!!vd.manual;
  let sub=0; poItemsForVendor(vid).forEach(({it,idx})=>{ sub+=(+it.qty||0)*vendorItemPrice(vid,idx); });   // ยอดจริงเสมอ (จากดีล)
  let seq;
  if(manual){
    const mrows=poManualRows(vid), lay=poLayout(vid);
    seq=[]; const marks=a=>lay.filter(m=>m.after===a).sort((x,y)=>x.id-y.id).forEach(m=>seq.push({t:m.type,id:m.id}));
    marks(-1); mrows.forEach((row,i)=>{ seq.push({t:'mitem',row,i}); marks(i); });
  } else {
    seq=_poSequence(vid).seq;
  }
  const disc=+(editingPO&&editingPO.poDiscount)||0, after=sub-disc, vat=after*0.07, grand=after+vat;
  const terms=(typeof quoteFor==='function'?(quoteFor(vid).note||''):'')||'';
  const reqDate=editingPO&&editingPO.requiredDate?fmtDate(editingPO.requiredDate):'-';
  const docDate=fmtDate(vd.poDate||new Date());   // วันที่เอกสาร (กำหนดเองในพรีวิว)
  const note=(vd.printNote!=null?vd.printNote:((editingPO&&editingPO.note)||''));
  // คอลัมน์ที่แสดง (toggle/ปรับความกว้างได้จากพรีวิว)
  const cols=poVisCols(vid), nc=cols.length;
  const rowCells=(d)=> cols.map((col,ci)=>{ const bd=(ci===nc-1)?'':cB;
    if(col.k==='name') return '<td style="padding:5px 10px;word-wrap:break-word;overflow-wrap:break-word;'+bd+'"><div style="font-weight:600">'+esc(d.name||'')+'</div>'+(d.desc?'<div style="font-size:10px;color:#555;margin-top:2px;white-space:pre-line;line-height:1.5">'+esc(d.desc)+'</div>':'')+'</td>';
    if(col.k==='pn') return '<td style="padding:5px 8px;text-align:center;font-family:Tahoma,sans-serif;font-size:10px;color:#444;word-wrap:break-word;overflow-wrap:break-word;'+bd+'">'+esc(d.pn||'')+'</td>';
    if(col.k==='seq') return '<td style="padding:5px 6px;text-align:center;'+bd+'">'+esc(d.seq!=null?String(d.seq):'')+'</td>';
    if(col.k==='qty') return '<td style="padding:5px 8px;text-align:center;'+bd+'">'+esc(d.qty!=null?String(d.qty):'')+'</td>';
    if(col.k==='unit') return '<td style="padding:5px 8px;text-align:center;'+bd+'">'+esc(d.unit||'')+'</td>';
    if(col.k==='price') return '<td style="padding:5px 10px;text-align:right;'+bd+'">'+((d.price!==''&&d.price!=null)?fmt2(+d.price||0):'')+'</td>';
    if(col.k==='amt') return '<td style="padding:5px 10px;text-align:right;'+bd+'">'+((d.amt!==''&&d.amt!=null)?fmt2(+d.amt||0):'')+'</td>';
    return '<td style="'+bd+'"></td>'; }).join('');
  const itemRow=(rec,i)=>{ const it=rec.it, price=vendorItemPrice(vid,rec.idx), amt=(+it.qty||0)*price;
    return '<tr style="vertical-align:top">'+rowCells({seq:i+1,pn:it.pn||it.partNo||it.PartNumber||'',name:it.name||'-',desc:it.desc||it.Description||'',qty:(it.qty||1),unit:it.unit||'',price:price,amt:amt})+'</tr>'; };
  let _mno=0;   // นับลำดับเฉพาะแถวรายการ (group/note ไม่กินเลข)
  const manualRow=(row)=>{ const t=row.t||'item';
    if(t==='group'){ const al=row.align==='center'?'center':(row.align==='right'?'right':'left');
      return '<tr><td colspan="'+nc+'" style="padding:6px 10px;font-weight:700;color:'+NAVY+';background:'+NAVY+'0d;text-align:'+al+'">'+esc(row.name||'')+'</td></tr>'; }
    if(t==='note'){ return '<tr><td colspan="'+nc+'" style="padding:5px 10px;white-space:pre-line;line-height:1.5;color:#333">'+(row.name?'<b>'+esc(row.name)+'</b> ':'')+esc(row.desc||'')+'</td></tr>'; }
    _mno++; const amt=(row.amt!==''&&row.amt!=null)?(+row.amt||0):'';
    return '<tr style="vertical-align:top">'+rowCells({seq:_mno,pn:row.pn||'',name:row.name||'',desc:row.desc||'',qty:(row.qty!=null?row.qty:''),unit:row.unit||'',price:((row.price!==''&&row.price!=null)?row.price:''),amt:amt})+'</tr>'; };
  const blankRow='<tr>'+cols.map((col,ci)=>'<td style="'+(ci===0?'padding:9px 6px;':'')+((ci===nc-1)?'':cB)+'">'+(ci===0?'&nbsp;':'')+'</td>').join('')+'</tr>';
  // แถวยืดเต็มพื้นที่ (height:100%) เส้นคอลัมน์ต่อเนื่องถึงล่าง → ตารางแตะช่องหมายเหตุ
  const fillerRow='<tr style="height:100%">'+cols.map((col,ci)=>'<td style="'+((ci===nc-1)?'':cB)+'">'+(ci===0?'&nbsp;':'')+'</td>').join('')+'</tr>';
  const infoRow=(th,val)=>'<div style="padding:3px 9px;border-top:1px solid '+NAVY+'55"><span style="font-weight:600;font-size:11px">'+th+' :</span> <span style="font-size:11px">'+esc(val||'-')+'</span></div>';
  const totRow=(label,val,strong)=>'<tr>'
    +'<td style="background:'+NAVY+';color:#fff;padding:'+(strong?'6':'5')+'px 10px;font-size:11px'+(strong?';font-weight:700':'')+'">'+label+'</td>'
    +'<td style="border:1px solid '+NAVY+';padding:'+(strong?'6':'5')+'px 10px;text-align:right;min-width:120px'+(strong?';font-weight:700;font-size:14px':'')+'">'+val+'</td></tr>';
  const HEADER='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">'
    +'<div style="display:flex;align-items:flex-start;gap:12px">'
    +(COMPANY.logo?'<img src="'+COMPANY.logo+'" style="max-height:80px;max-width:110px;object-fit:contain"/>':'')
    +'<div>'
    +'<div style="font-family:Tahoma,sans-serif;font-size:20px;font-weight:700;color:'+NAVY+';line-height:1.1">'+esc(COMPANY.name)+'</div>'
    +'<div style="font-family:Tahoma,sans-serif;font-size:14px;font-weight:700;color:'+NAVY+';line-height:1.1">'+esc(COMPANY.nameEn||'')+'</div>'
    +'<div style="font-size:12px;color:#222;margin-top:3px">'+esc(COMPANY.address)+'</div>'
    +'<div style="font-size:12px;color:#222;margin-top:1px"><b>TEL.</b> '+esc(COMPANY.phone)+' &nbsp; <b>FAX.</b> '+esc(COMPANY.fax||COMPANY.phone)+'</div>'
    +'<div style="font-size:11px;color:#1a1a2e;margin-top:1px">เลขประจำตัวผู้เสียภาษีอากร '+esc(COMPANY.taxId)+' (สำนักงานใหญ่)</div>'
    +'</div></div>'
    +'<div style="text-align:right;flex-shrink:0">'
    +'<div style="display:inline-block;text-align:center">'
    +'<div style="background:'+NAVY+';color:#fff;border-radius:8px;padding:8px 18px"><div style="font-size:16px;font-weight:700">ใบสั่งซื้อ</div><div style="font-size:9px;letter-spacing:0.08em">PURCHASE ORDER</div></div>'
    +'<div style="font-size:11px;color:#888;margin-top:4px">ต้นฉบับ</div>'
    +'</div></div></div>'
    +'<div style="display:flex;justify-content:flex-end;gap:24px;margin:4px 0 10px;font-size:11px;text-align:center">'
    +'<div><b>เลขที่เอกสาร</b><br><span style="font-family:Tahoma;font-size:15px;font-weight:700;color:'+NAVY+'">'+esc(vd.poNo||'(ยังไม่ออกเลข)')+'</span></div>'
    +'<div><b>วันที่เอกสาร</b><br><span style="font-size:14px;font-weight:700">'+docDate+'</span></div></div>';
  const VENDOR='<div style="display:flex;gap:10px;margin-bottom:8px;align-items:stretch">'
    +'<div style="flex:1.4;border:1px solid '+NAVY+';border-radius:8px;padding:8px 10px">'
    +'<div><span style="font-weight:700;font-size:11px">ชื่อผู้ขาย :</span> <span style="font-weight:600">'+esc(v.name||(editingPO&&editingPO.vendorName)||'-')+'</span></div>'
    +(v.contact?'<div style="margin-top:3px;font-size:11px"><b>ผู้ติดต่อ :</b> '+esc(v.contact)+'</div>':'')
    +(v.address?'<div style="margin-top:3px;font-size:11px"><b>ที่อยู่ :</b> '+esc(v.address)+'</div>':'')
    +((v.phone||v.email)?'<div style="margin-top:3px;font-size:11px">'+(v.phone?'<b>โทร :</b> '+esc(v.phone):'')+(v.phone&&v.email?' &nbsp; ':'')+(v.email?'<b>อีเมล :</b> '+esc(v.email):'')+'</div>':'')
    +'</div>'
    +'<div style="flex:1;border:1px solid '+NAVY+';border-radius:8px;overflow:hidden">'
    +'<div style="padding:3px 9px"><span style="font-weight:600;font-size:11px">วันที่ต้องการ :</span> <span style="font-size:11px">'+reqDate+'</span></div>'
    +infoRow('เงื่อนไข', terms)
    +infoRow('จำนวนวันผลิต', (vd.leadDays!=null&&vd.leadDays!=='')?(vd.leadDays+' วัน'):'-')
    +'</div></div>';
  const tableHead='<thead><tr style="background:'+NAVY+';color:#fff;font-size:11px">'
    +cols.map((col,ci)=>'<th style="padding:6px 8px;'+(col.flex?'text-align:center;':'width:'+poColW(vid,col.k)+'px;')+((ci===nc-1)?'':'border-right:1px solid #fff5;')+'">'+col.th+'</th>').join('')
    +'</tr></thead>';
  const FOOTER='<div style="display:flex;gap:10px;margin-top:0;align-items:stretch">'
    +'<div style="flex:1;border:1px solid '+NAVY+';border-radius:8px;padding:8px 10px;font-size:11px;min-height:96px;display:flex;flex-direction:column">'
    +'<div style="font-weight:600;margin-bottom:3px">หมายเหตุ</div>'
    +'<div style="white-space:pre-line;line-height:1.6;color:#333">'+esc(note||'-')+'</div>'
    +'<div style="margin-top:auto;border-top:1px solid '+NAVY+'55;padding-top:5px"><b>จำนวนเงิน (ตัวอักษร) :</b> '+esc(bahtText(grand))+'</div>'
    +'</div>'
    +'<table style="border-collapse:collapse;font-size:12px;flex-shrink:0">'
    +totRow('จำนวนเงิน',fmt2(sub))+totRow('ส่วนลด',fmt2(disc))+totRow('จำนวนเงินหลังหักส่วนลด',fmt2(after))+totRow('ภาษีมูลค่าเพิ่ม 7%',fmt2(vat))+totRow('จำนวนเงินทั้งสิ้น',fmt2(grand),true)
    +'</table></div>'
    +'<div style="border:1px solid '+NAVY+'55;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:10px;color:#444;line-height:1.7">'
    +'<div style="font-weight:600;color:'+NAVY+'">เงื่อนไข</div>'
    +'1. โปรดระบุเลขที่ใบสั่งซื้อ ลงในใบเสร็จรับเงิน/ใบส่งของ/ใบกำกับภาษี ทุกครั้ง<br>'
    +'2. การรับเงินและการวางบิล กรุณาแนบใบสั่งซื้อ/ใบเสร็จรับเงิน/ใบกำกับภาษี ประกอบทุกครั้ง<br>'
    +'3. บริษัทฯ รับวางบิลทุกวันที่ 5 ของเดือน และจ่ายเช็คทุกวันที่ 25 ของเดือน'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:24px;text-align:center;font-size:11px">'
    +'<div><div style="height:54px"></div><div style="border-top:1px dotted #999;padding-top:6px;color:#555">ผู้สั่งซื้อ<br>วันที่ ......./......./.......</div></div>'
    +'<div style="position:relative">'
    +(COMPANY.approverSign?'<div style="height:54px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px"><img src="'+COMPANY.approverSign+'" style="max-height:46px;max-width:150px;object-fit:contain"></div>':'<div style="height:54px"></div>')
    +'<div style="border-top:1px dotted #999;padding-top:6px;color:#555">ผู้มีอำนาจอนุมัติ<br>วันที่ ......./......./.......</div>'
    +(COMPANY.stamp?(function(){ var sw=+vd.stampW||132, sr=+vd.stampRot||0, sx=+vd.stampX||0, sy=+vd.stampY||0;
        return '<img src="'+COMPANY.stamp+'" style="position:absolute;left:50%;top:50%;transform:translate(calc(-50% + '+sx+'px), calc(-50% + '+sy+'px)) rotate('+sr+'deg);width:'+sw+'px;height:auto;opacity:0.9;pointer-events:none">'; })():'')   // ตราประทับวงกลมโปร่งใส — ปรับขนาด/หมุน/เลื่อนได้จากพรีวิว
    +'</div>'
    +'</div>';
  // แบ่งหน้าตาม token 'break'
  const pages=[[]]; seq.forEach(tk=>{ if(tk.t==='break')pages.push([]); else pages[pages.length-1].push(tk); });
  const nP=pages.length;
  const pagesHtml=pages.map((toks,pi)=>{
    const isLast=pi===nP-1;
    const body=toks.map(tk=> tk.t==='item'?itemRow(tk.rec,tk.i):(tk.t==='mitem'?manualRow(tk.row):(tk.t==='blank'?blankRow:''))).join('');
    const label=nP>1?'<div style="text-align:right;color:#888;font-size:10px;margin-top:5px">หน้า '+(pi+1)+'/'+nP+'</div>':'';
    // ตารางยืดเต็มพื้นที่อัตโนมัติ (filler) เส้นคอลัมน์+กรอบครบ แตะช่องหมายเหตุ; footer เฉพาะหน้าสุดท้าย
    return '<div class="po-page">'+HEADER+(pi===0?VENDOR:'')
      +'<div style="flex:1;display:flex;flex-direction:column;border:1px solid '+NAVY+';border-radius:8px;overflow:hidden">'
      +'<table style="width:100%;flex:1;border-collapse:collapse;table-layout:fixed">'+tableHead+'<tbody>'+body+fillerRow+'</tbody></table>'
      +'</div>'
      +(isLast?FOOTER:'')+label+'</div>';
  }).join('');
  const _clean=s=>String(s||'').replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'').trim();
  const fileName=[vd.poNo, (editingPO&&editingPO.client), (editingPO&&editingPO.quoteTitle)].map(_clean).filter(Boolean).join('_')||'ใบสั่งซื้อ';
  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>'+esc(fileName)+'</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Sarabun,sans-serif;font-size:12px;color:#1a1a2e}'
    +'.po-page{padding:5mm;min-height:287mm;display:flex;flex-direction:column;page-break-after:always;background:#fff}'
    +'.po-page:last-child{page-break-after:auto}thead{display:table-header-group}tr{page-break-inside:avoid}'
    +'@media screen{body{background:#e5e7eb}.po-page{width:210mm;max-width:100%;margin:0 auto 10px;box-shadow:0 2px 14px rgba(0,0,0,.18)}}'
    +'@media print{@page{size:A4;margin:0}button{display:none!important}.po-page{box-shadow:none;margin:0}}'
    +'</style></head><body>'+pagesHtml+'</body></html>';
}
// พรีวิว PO ในแอป + เครื่องมือจัดหน้า (แทรกบรรทัด/ขึ้นหน้า) + ปุ่มพิมพ์เปิดแท็บใหม่
let _poEditVid=null, _poNoteT=null;
function _poRefresh(vid){
  if(String(_poEditVid)!==String(vid))return;
  const ed=document.getElementById('_poEditor'); if(ed)ed.innerHTML=renderPOEditor(vid);
  _poRefreshFrame(vid);
}
function _poRefreshFrame(vid){
  if(String(_poEditVid)!==String(vid))return;
  const f=document.getElementById('_poFrame'); if(f)f.srcdoc=buildPOHtml(vid);
}
function setPOPrintNote(vid,val){
  poVendorDocs(vid).printNote=val;
  clearTimeout(_poNoteT);
  _poNoteT=setTimeout(function(){ _poRefreshFrame(vid); if(typeof savePurchase==='function')savePurchase(); },350);
}
function setPODate(vid,val){ poVendorDocs(vid).poDate=val||''; _poRefreshFrame(vid); if(typeof savePurchase==='function')savePurchase(); }
function setPOLeadDays(vid,val){ poVendorDocs(vid).leadDays=val; clearTimeout(_poNoteT); _poNoteT=setTimeout(function(){ _poRefreshFrame(vid); if(typeof savePurchase==='function')savePurchase(); },350); }
let _poStampT=null;
function setPOStamp(vid,field,val){
  poVendorDocs(vid)['stamp'+field]=+val;
  var lbl=document.getElementById('po-stamp-'+field+'-v'); if(lbl)lbl.textContent=val+(field==='Rot'?'°':'px');
  clearTimeout(_poStampT); _poStampT=setTimeout(function(){ _poRefreshFrame(vid); if(typeof savePurchase==='function')savePurchase(); },180);
}
function renderPOEditor(vid){
  const lay=poLayout(vid);
  const vd=poVendorDocs(vid);
  const _manual=!!vd.manual;
  const brkItems = _manual ? poManualRows(vid).map(r=>({name:r.name||'-'})) : _poSequence(vid).items.map(x=>({name:x.it.name}));
  const curNote=(vd.printNote!=null?vd.printNote:((editingPO&&editingPO.note)||''));
  const marksAfter=a=>lay.filter(m=>m.after===a&&m.type==='break').sort((x,y)=>x.id-y.id).map(m=>'<span style="display:inline-block;background:#fde68a;border-radius:4px;padding:1px 7px;margin:2px 4px 2px 0;font-size:11px">⤵ ขึ้นหน้าใหม่ <a href="#" onclick="delPORow(\''+vid+'\','+m.id+');return false" style="color:#b91c1c;text-decoration:none">✕</a></span>').join('');
  const brkBtn=a=>'<button onclick="addPORow(\''+vid+'\','+a+',\'break\')" style="font-size:10px;padding:2px 7px;border:1px dashed #d97706;background:none;color:#b45309;border-radius:4px;cursor:pointer">+ ขึ้นหน้าใหม่</button>';
  const _poDate=vd.poDate||new Date().toISOString().slice(0,10);
  let h='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px">วันที่เอกสาร</div>';
  h+='<input type="date" value="'+esc(_poDate)+'" onchange="setPODate(\''+vid+'\',this.value)" style="width:100%;font-size:12px;margin-bottom:12px">';
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px">หมายเหตุ (พิมพ์เพิ่มได้)</div>';
  h+='<textarea oninput="setPOPrintNote(\''+vid+'\',this.value)" placeholder="พิมพ์หมายเหตุ..." style="width:100%;min-height:70px;font-size:12px;line-height:1.5;margin-bottom:12px">'+esc(curNote)+'</textarea>';
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px">จำนวนวันผลิต</div>';
  h+='<input type="number" min="0" value="'+esc(vd.leadDays!=null?vd.leadDays:'')+'" oninput="setPOLeadDays(\''+vid+'\',this.value)" placeholder="เช่น 7" style="width:100%;font-size:12px;margin-bottom:12px">';
  // ── คอลัมน์ตาราง: ซ่อน/แสดง + ความกว้าง ──
  h+='<div style="border-top:1px solid #e2e8f0;margin:6px 0 8px"></div>';
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px">คอลัมน์ตาราง (ซ่อน/แสดง · ปรับความกว้าง)</div>';
  h+=PO_COLS.map(function(col){
    const vis = col.always || poColCfg(vid).vis[col.k]!==false;
    const chk = col.always
      ? '<span style="display:inline-block;width:13px"></span>'
      : '<input type="checkbox" '+(vis?'checked':'')+' onchange="togglePOCol(\''+vid+'\',\''+col.k+'\',this.checked)" style="margin:0">';
    let row='<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">'
      +'<label style="display:flex;align-items:center;gap:6px;min-width:94px;font-size:11px;color:#334155;cursor:'+(col.always?'default':'pointer')+'">'+chk+' '+col.th+(col.always?' <span style="color:#94a3b8">(คงที่)</span>':'')+'</label>';
    if(col.flex){ row+='<span style="font-size:10px;color:#94a3b8">ยืดอัตโนมัติ</span>'; }
    else { const w=poColW(vid,col.k);
      row+='<input type="range" min="30" max="200" value="'+w+'" oninput="setPOColWidth(\''+vid+'\',\''+col.k+'\',this.value)" '+(vis?'':'disabled')+' style="flex:1;min-width:0">'
         +'<span id="po-cw-'+col.k+'" style="font-size:10px;font-family:monospace;color:#64748b;min-width:34px;text-align:right">'+w+'px</span>'; }
    return row+'</div>';
  }).join('');
  h+='<div style="font-size:10px;color:#94a3b8;margin-bottom:12px">* คอลัมน์ "รายการ" จะยืดเต็มพื้นที่ที่เหลือเสมอ</div>';
  // ── ปรับรายการเอง (Manual) ──
  h+='<div style="border-top:1px solid #e2e8f0;margin:6px 0 10px"></div>';
  h+='<label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;cursor:pointer"><input type="checkbox" '+(_manual?'checked':'')+' onchange="poToggleManual(\''+vid+'\',this.checked)"> ✎ ปรับรายการเอง (Manual)</label>';
  if(_manual){
    const rows=poManualRows(vid);
    h+='<div style="font-size:10.5px;color:#64748b;margin-bottom:6px">แก้ได้ทุกช่อง ไม่จำกัดบรรทัด · ยอดรวมท้ายเอกสารคงที่ตามยอดจริง</div>';
    h+='<button onclick="openPOAIImport(\''+vid+'\')" style="width:100%;font-size:12px;padding:7px;border:none;background:#17356b;color:#fff;border-radius:6px;cursor:pointer;margin-bottom:6px;font-weight:600">🤖 ดูดจากไฟล์ใบเสนอราคา (AI · PDF/รูป)</button>';
    h+='<button onclick="openPOPasteImport(\''+vid+'\')" style="width:100%;font-size:12px;padding:6px;border:1px solid #2563a8;background:#eff6ff;color:#1d4ed8;border-radius:6px;cursor:pointer;margin-bottom:8px">📋 วางจากตาราง (Excel) แบบเดิม</button>';
    h+='<div id="po-man-warn" style="font-size:11px;margin-bottom:8px">'+poManualWarnHtml(vid)+'</div>';
    const n=rows.length;
    const moveBtns=function(i){ return '<button onclick="movePOManualRow(\''+vid+'\','+i+',-1)" title="ย้ายขึ้น" '+(i===0?'disabled':'')+' style="border:none;background:none;cursor:pointer;color:'+(i===0?'#cbd5e1':'#64748b')+';font-size:12px;padding:0 1px">▲</button>'
      +'<button onclick="movePOManualRow(\''+vid+'\','+i+',1)" title="ย้ายลง" '+(i===n-1?'disabled':'')+' style="border:none;background:none;cursor:pointer;color:'+(i===n-1?'#cbd5e1':'#64748b')+';font-size:12px;padding:0 1px">▼</button>'; };
    const delBtn=function(i){ return '<button onclick="delPOManualRow(\''+vid+'\','+i+')" title="ลบแถว" style="border:none;background:none;color:#b91c1c;cursor:pointer;font-size:13px;padding:0 2px">✕</button>'; };
    h+=rows.map(function(r,i){ const t=r.t||'item';
      if(t==='group'){ const al=r.align||'left'; const ab=function(a,lab){ return '<button onclick="setPOManualAlign(\''+vid+'\','+i+',\''+a+'\')" title="จัด'+lab+'" style="border:none;background:'+(al===a?'#dbeafe':'none')+';color:'+(al===a?'#1d4ed8':'#94a3b8')+';cursor:pointer;font-size:11px;font-weight:700;padding:1px 5px;border-radius:3px">'+lab+'</button>'; };
        return '<div style="border:1px solid #c7d2fe;background:#eef2ff;border-radius:6px;padding:6px;margin-bottom:6px">'
          +'<div style="display:flex;gap:4px;align-items:center"><span style="font-size:10px;color:#6366f1;font-weight:700">▦ กลุ่ม</span>'+ab('left','L')+ab('center','C')+ab('right','R')
          +'<span style="margin-left:auto">'+moveBtns(i)+delBtn(i)+'</span></div>'
          +'<input value="'+esc(r.name||'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'name\',this.value)" placeholder="หัวข้อกลุ่ม" style="width:100%;margin-top:4px;font-size:11px;font-weight:600;padding:3px 5px">'
          +'</div>'; }
      if(t==='note'){ return '<div style="border:1px dashed #cbd5e1;background:#f8fafc;border-radius:6px;padding:6px;margin-bottom:6px">'
          +'<div style="display:flex;gap:4px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700">📝 หมายเหตุ</span><span style="margin-left:auto">'+moveBtns(i)+delBtn(i)+'</span></div>'
          +'<input value="'+esc(r.name||'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'name\',this.value)" placeholder="หัวข้อ (ไม่บังคับ)" style="width:100%;margin-top:4px;font-size:11px;font-weight:600;padding:3px 5px">'
          +'<textarea oninput="setPOManual(\''+vid+'\','+i+',\'desc\',this.value)" placeholder="ข้อความ..." style="width:100%;margin-top:4px;min-height:44px;font-size:11px;line-height:1.5;padding:3px 5px">'+esc(r.desc||'')+'</textarea>'
          +'</div>'; }
      // item
      return '<div style="border:1px solid #e2e8f0;border-radius:6px;padding:6px;margin-bottom:6px">'
      +'<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px"><span style="font-size:10px;color:#94a3b8;min-width:14px">'+(i+1)+'.</span>'
      +'<input value="'+esc(r.name||'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'name\',this.value)" placeholder="รายการ" style="flex:1;min-width:0;font-size:11px;padding:3px 5px">'
      +moveBtns(i)+delBtn(i)+'</div>'
      +'<input value="'+esc(r.pn||'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'pn\',this.value)" placeholder="รหัสสินค้า / Part No. (ถ้ามี)" style="width:100%;margin-bottom:4px;font-size:10.5px;padding:3px 5px;font-family:monospace">'
      +'<textarea oninput="setPOManual(\''+vid+'\','+i+',\'desc\',this.value)" placeholder="รายละเอียดเพิ่มเติม (Detail)..." style="width:100%;margin-bottom:4px;min-height:34px;font-size:10.5px;line-height:1.5;padding:3px 5px;color:#475569">'+esc(r.desc||'')+'</textarea>'
      +'<div style="display:flex;gap:4px">'
      +'<input value="'+esc(r.qty!=null?r.qty:'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'qty\',this.value)" placeholder="จำนวน" style="width:46px;font-size:11px;padding:3px 4px;text-align:center">'
      +'<input value="'+esc(r.unit||'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'unit\',this.value)" placeholder="หน่วย" style="width:50px;font-size:11px;padding:3px 4px;text-align:center">'
      +'<input value="'+esc(r.price!=null?r.price:'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'price\',this.value)" placeholder="ราคา/หน่วย" style="flex:1;min-width:0;font-size:11px;padding:3px 4px;text-align:right">'
      +'<input value="'+esc(r.amt!=null?r.amt:'')+'" oninput="setPOManual(\''+vid+'\','+i+',\'amt\',this.value)" placeholder="จำนวนเงิน" style="flex:1;min-width:0;font-size:11px;padding:3px 4px;text-align:right">'
      +'</div></div>'; }).join('');
    h+='<div style="display:flex;gap:4px;margin-bottom:12px">'
      +'<button onclick="addPOManualRow(\''+vid+'\',\'item\')" style="flex:1;font-size:11px;padding:6px 4px;border:1px dashed #2563a8;background:none;color:#2563a8;border-radius:6px;cursor:pointer">+ รายการ</button>'
      +'<button onclick="addPOManualRow(\''+vid+'\',\'group\')" style="flex:1;font-size:11px;padding:6px 4px;border:1px dashed #6366f1;background:none;color:#4f46e5;border-radius:6px;cursor:pointer">+ หัวข้อกลุ่ม</button>'
      +'<button onclick="addPOManualRow(\''+vid+'\',\'note\')" style="flex:1;font-size:11px;padding:6px 4px;border:1px dashed #94a3b8;background:none;color:#475569;border-radius:6px;cursor:pointer">+ หมายเหตุ</button>'
      +'</div>';
  }
  if(COMPANY.stamp){
    const sw=+vd.stampW||132, sr=+vd.stampRot||0, sx=+vd.stampX||0, sy=+vd.stampY||0;
    const sl=(f,lab,min,max,val,unit)=>'<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#475569"><span>'+lab+'</span><span id="po-stamp-'+f+'-v" style="font-family:monospace">'+val+unit+'</span></div><input type="range" min="'+min+'" max="'+max+'" value="'+val+'" oninput="setPOStamp(\''+vid+'\',\''+f+'\',this.value)" style="width:100%"></div>';
    h+='<div style="font-size:12px;font-weight:600;color:#334155;margin:2px 0 6px">ตราประทับ (ปรับขนาด/หมุน/เลื่อน)</div>';
    h+=sl('W','ขนาด',60,280,sw,'px')+sl('Rot','หมุน',-180,180,sr,'°')+sl('X','เลื่อน ↔',-150,150,sx,'px')+sl('Y','เลื่อน ↕',-150,150,sy,'px');
    h+='<div style="border-bottom:1px solid #e2e8f0;margin:10px 0"></div>';
  }
  h+='<div style="font-size:11px;color:#475569;margin-bottom:6px">ตารางเติมเต็มหน้าอัตโนมัติ — แทรก "ขึ้นหน้าใหม่" ได้หลังรายการที่ต้องการ</div>';
  h+='<div style="margin-bottom:4px">'+marksAfter(-1)+' '+brkBtn(-1)+'</div>';
  h+=brkItems.map((rec,i)=>'<div style="border-top:1px solid #e2e8f0;padding:4px 0"><div style="font-size:12px"><b>'+(i+1)+'.</b> '+esc((rec.name||'-')).slice(0,60)+'</div><div style="margin-top:2px">'+marksAfter(i)+' '+brkBtn(i)+'</div></div>').join('');
  return h;
}
function printPO(vid){   // เปิดพรีวิว + เครื่องมือจัดหน้า
  _poEditVid=vid;
  const old=document.getElementById('_docOverlay'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_docOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.62);display:flex;flex-direction:column;padding:10px 12px;gap:8px';
  const bar=document.createElement('div'); bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px';
  bar.innerHTML='<div style="color:#fff;font-size:13px;font-weight:600">พรีวิว / จัดหน้าใบสั่งซื้อ</div>';
  const btns=document.createElement('div'); btns.style.cssText='display:flex;gap:8px';
  const printBtn=document.createElement('button'); printBtn.textContent='🖨 พิมพ์ / บันทึก PDF'; printBtn.style.cssText='padding:8px 18px;background:#17356b;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer';
  const closeBtn=document.createElement('button'); closeBtn.textContent='✕ ปิด'; closeBtn.style.cssText='padding:8px 16px;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer';
  btns.appendChild(printBtn); btns.appendChild(closeBtn); bar.appendChild(btns); ov.appendChild(bar);
  const wrap=document.createElement('div'); wrap.style.cssText='flex:1;min-height:0;display:flex;gap:10px';
  const ed=document.createElement('div'); ed.id='_poEditor'; ed.style.cssText='width:340px;flex-shrink:0;background:#fff;border-radius:8px;padding:12px;overflow:auto';
  ed.innerHTML=renderPOEditor(vid);
  const f=document.createElement('iframe'); f.id='_poFrame'; f.style.cssText='flex:1;min-width:0;border:none;border-radius:8px;background:#fff;box-shadow:0 12px 44px rgba(0,0,0,0.45)'; f.srcdoc=buildPOHtml(vid);
  wrap.appendChild(ed); wrap.appendChild(f); ov.appendChild(wrap);
  document.body.appendChild(ov);
  function close(){ ov.remove(); _poEditVid=null; document.removeEventListener('keydown',onKey); }
  function onKey(e){ if(e.key==='Escape'){ e.stopPropagation(); close(); } }
  printBtn.onclick=function(){ const w=window.open('','_blank'); if(!w){ if(typeof toast==='function')toast('เบราว์เซอร์บล็อกป๊อปอัป — โปรดอนุญาตแล้วลองใหม่','error'); return; } w.document.open(); w.document.write(buildPOHtml(vid)); w.document.close(); setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },500); };
  closeBtn.onclick=close;
  document.addEventListener('keydown',onKey);
}
function setPONo(vid,val){ poVendorDocs(vid).poNo=val; }
async function genPONo(vid){
  try{
    const it=_settingsCache.find(i=>i.Title==='POCounter');
    let n=1; try{ n=(JSON.parse(it?.Value||'{}').last||0)+1; }catch(e){ n=1; }
    const now=new Date();
    const no='PO'+now.getFullYear()+String(n).padStart(3,'0');   // PO + ปีเต็ม + เลขรัน 3 หลัก เช่น PO2026001
    await putSetting('POCounter', JSON.stringify({last:n}));
    poVendorDocs(vid).poNo=no; renderStageBody();
    toast('ออกเลข PO: '+no,'success');
  }catch(e){ toast('ออกเลขไม่สำเร็จ: '+e.message,'error'); }
}
async function uploadPODoc(vid,kind,input){
  try{ const r=await uploadFile(input,'PurchaseDocs','po_'+kind); if(!r)return;
    const vd=poVendorDocs(vid);
    if(kind==='round2'){ vd.round2Url=r.fileUrl; vd.round2Name=r.fileName; }
    else { vd.signedUrl=r.fileUrl; vd.signedName=r.fileName; _poAttach[String(vid)]={name:r.fileName,b64:r.b64,mime:r.mime}; }
    renderStageBody();
  }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); }
}
async function sendBackVendor(vid){
  vid=String(vid); const v=getVendorById(vid); const vd=poVendorDocs(vid);
  if(!v||!v.email){ toast('Vendor นี้ไม่มีอีเมล','error'); return; }
  const att=_poAttach[vid]; const docUrl=vd.signedUrl||vd.round2Url;
  if(!att && !docUrl){ toast('อัปโหลดไฟล์ที่ลงนามก่อน','error'); return; }
  toast('กำลังส่งกลับ Vendor...','info');
  const items=poItemsForVendor(vid);
  const rows=items.map(({it,idx})=>'<tr><td style="padding:5px 9px;border:1px solid #ddd">'+esc(it.name)+'</td><td style="padding:5px 9px;border:1px solid #ddd;text-align:center">'+it.qty+' '+esc(it.unit||'')+'</td></tr>').join('');
  let itemsHtml=itemsTableHtml(rows,{cols:['รายการ','จำนวน']});
  itemsHtml += (!att&&docUrl)?'<p>เอกสาร: <a href="'+docUrl+'">'+esc(vd.signedName||vd.round2Name||'เปิดเอกสาร')+'</a></p>':'<p style="color:#666">(แนบไฟล์ที่ลงนามมาในอีเมลนี้)</p>';
  const body=mailBody('sendback',{vendorName:v.name,contact:v.contact||v.name,itemsHtml});
  try{
    await _sendMailGraph(v.email,getMailSubject(),body, att?[{name:att.name,contentType:att.mime,contentBytes:att.b64}]:null);
    vd.sentAt=new Date().toISOString();
    await savePurchase(); renderStageBody();
    toast('ส่งกลับ Vendor แล้ว','success');
  }catch(e){ toast('ส่งไม่สำเร็จ: '+e.message,'error'); }
}

// ── ขั้น 6: จ่ายเงิน (per-vendor ล้อขั้น 4/5 + เอกสารไม่จำกัด ตั้งชื่อเองได้) ──
function payFor(vid){ const d=sd(); d.payment=d.payment||{}; d.payment.vendors=d.payment.vendors||{}; vid=String(vid); const p=d.payment.vendors[vid]=d.payment.vendors[vid]||{}; if(!Array.isArray(p.docs))p.docs=[]; if(!p.method)p.method='เงินโอน'; return p; }
function renderPayStage(){
  const vids=poVendorList();
  if(!vids.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่ได้เลือก Vendor ในขั้น 4</div>';
  return '<div style="font-size:13px;margin-bottom:10px">บันทึกการจ่ายเงินแต่ละ Vendor + แนบหลักฐาน/เอกสารอื่นได้ไม่จำกัด (ตั้งชื่อเอกสารเองได้)</div>'+
  vids.map(vid=>{ const v=getVendorById(vid), p=payFor(vid);
    const docs=p.docs.map(dc=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <input placeholder="ชื่อเอกสาร เช่น ใบเสร็จ, ใบกำกับภาษี" value="${esc(dc.label||'')}" oninput="updatePayDocLabel('${vid}','${dc.id}',this.value)" style="max-width:220px">
        <input type="file" onchange="attachPayDocFile('${vid}','${dc.id}',this)">
        ${dc.url?docThumb(dc.url,dc.name||'ไฟล์',{small:true}):''}
        <button class="btn btn-sm" onclick="removePayDoc('${vid}','${dc.id}')" style="color:var(--red)">✕</button></div>`).join('');
    const amt=+p.amount||0, whtPct=+p.whtPct||0, whtAmt=+(amt*whtPct/100).toFixed(2), net=+(amt-whtAmt).toFixed(2);
    const due=payDueDate(p);
    return `<div class="card" style="margin-bottom:14px"><div class="card-head">🏢 ${esc(v?v.name:'?')}</div>
      <div style="padding:12px 14px">
        <div class="form-grid">
          <div class="form-group"><label>เลขที่ใบแจ้งหนี้ Vendor (INV)</label><div style="display:flex;gap:6px;align-items:center"><input value="${esc(p.invNo||'')}" placeholder="เลขที่บิล" oninput="payInput('${vid}','invNo',this.value)" style="max-width:140px"><input type="file" onchange="attachPayInv('${vid}',this)">${p.invUrl?docThumb(p.invUrl,p.invName||'ใบแจ้งหนี้',{small:true}):''}</div></div>
          <div class="form-group"><label>วันรับวางบิล (เริ่มนับเครดิต)</label><input type="date" value="${p.termStart||''}" oninput="payTermChange('${vid}','termStart',this.value)"></div>
          <div class="form-group"><label>เทอมเครดิต (วัน)</label><input type="number" min="0" value="${p.termDays||''}" placeholder="เช่น 30" oninput="payTermChange('${vid}','termDays',this.value)"></div>
          <div class="form-group"><label>ครบกำหนดจ่าย</label><input value="${due?fmtDate(due):'—'}" readonly style="opacity:0.8;background:var(--surface)"></div>
          <div class="form-group"><label>จำนวนเงิน (ก่อนหัก)</label><input type="number" value="${p.amount||''}" oninput="payInput('${vid}','amount',this.value)"></div>
          <div class="form-group"><label>หัก ณ ที่จ่าย (%)</label><div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap"><input type="number" min="0" max="100" step="0.5" value="${p.whtPct||''}" placeholder="0" oninput="payInput('${vid}','whtPct',this.value)" style="max-width:70px"><button class="btn btn-sm" onclick="payInput('${vid}','whtPct',1);renderStageBody()" title="ค่าขนส่ง/เช่า 1%">1%</button><button class="btn btn-sm" onclick="payInput('${vid}','whtPct',3);renderStageBody()" title="ค่าบริการ 3%">3%</button><button class="btn btn-sm" onclick="payInput('${vid}','whtPct',7);renderStageBody()" title="7%">7%</button></div></div>
          <div class="form-group" style="grid-column:1/-1"><div style="background:var(--surface2);border-radius:8px;padding:8px 12px;font-size:12px;display:flex;gap:18px;flex-wrap:wrap"><span>หัก ณ ที่จ่าย: <b style="font-family:var(--mono)">${fmt(whtAmt)}</b></span><span>ยอดจ่ายสุทธิ: <b style="font-family:var(--mono);color:var(--accent2)">${fmt(net)}</b></span></div></div>
          <div class="form-group"><label>วันที่จ่ายจริง</label><input type="date" value="${p.date||''}" oninput="payInput('${vid}','date',this.value)"></div>
          <div class="form-group"><label>วิธีจ่าย</label><select onchange="payInput('${vid}','method',this.value)">${['เงินโอน','เงินสด','เช็ค','เครดิต'].map(m=>`<option ${p.method===m?'selected':''}>${m}</option>`).join('')}</select></div>
          <div class="form-group"><label>หลักฐานการจ่าย (สลิป)</label><div style="display:flex;gap:6px;align-items:center"><input type="file" onchange="attachPaySlip('${vid}',this)">${p.slipUrl?docThumb(p.slipUrl,p.slipName||'สลิป',{small:true}):''}</div></div>
          <div class="form-group"><label>หนังสือรับรองหัก ณ ที่จ่าย</label><div style="display:flex;gap:6px;align-items:center"><input type="file" onchange="attachPayWht('${vid}',this)">${p.whtUrl?docThumb(p.whtUrl,p.whtName||'หัก ณ ที่จ่าย',{small:true}):''}</div></div>
          <div class="form-group" style="grid-column:1/-1"><label>🔔 แจ้งเตือนวันจ่าย (ตั้งอัตโนมัติจากวันครบกำหนด แก้ได้)</label><input type="date" value="${p.remindDate||''}" oninput="payInput('${vid}','remindDate',this.value)"></div>
        </div>
        <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px"><div style="font-size:11px;color:var(--muted);margin-bottom:6px">เอกสารอื่น (เพิ่มได้ไม่จำกัด)</div>${docs||''}<button class="btn btn-sm" onclick="addPayDoc('${vid}')">+ เพิ่มเอกสาร</button></div>
      </div></div>`;
  }).join('');
}
function payInput(vid,f,val){ const p=payFor(vid); p[f]=((f==='amount'||f==='whtPct')?(val===''?'':+val):val); }
function _addDays(ds,n){ if(!ds)return''; const d=new Date(ds+'T00:00:00'); if(isNaN(d))return''; d.setDate(d.getDate()+(+n||0)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function payDueDate(p){ if(!p||!p.termStart||!(+p.termDays))return''; return _addDays(p.termStart,+p.termDays); }
function payTermChange(vid,f,val){ const p=payFor(vid); p[f]=(f==='termDays'?(val===''?'':+val):val); const due=payDueDate(p); if(due) p.remindDate=due; renderStageBody(); }
async function attachPayInv(vid,input){ try{ const r=await uploadFile(input,'PurchaseDocs','vendorinv'); if(r){ const p=payFor(vid); p.invUrl=r.fileUrl; p.invName=r.fileName; renderStageBody(); } }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); } }
async function attachPayWht(vid,input){ try{ const r=await uploadFile(input,'PurchaseDocs','wht'); if(r){ const p=payFor(vid); p.whtUrl=r.fileUrl; p.whtName=r.fileName; renderStageBody(); } }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); } }
async function attachPaySlip(vid,input){ try{ const r=await uploadFile(input,'PurchaseDocs','payslip'); if(r){ const p=payFor(vid); p.slipUrl=r.fileUrl; p.slipName=r.fileName; renderStageBody(); } }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); } }
function addPayDoc(vid){ payFor(vid).docs.push({id:'d'+Date.now(),label:'',url:'',name:''}); renderStageBody(); }
function updatePayDocLabel(vid,id,val){ const dc=payFor(vid).docs.find(x=>x.id===id); if(dc)dc.label=val; }
async function attachPayDocFile(vid,id,input){ try{ const r=await uploadFile(input,'PurchaseDocs','paydoc'); if(r){ const dc=payFor(vid).docs.find(x=>x.id===id); if(dc){dc.url=r.fileUrl;dc.name=r.fileName;} renderStageBody(); } }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); } }
function removePayDoc(vid,id){ const p=payFor(vid); p.docs=p.docs.filter(x=>x.id!==id); renderStageBody(); }

// ── ขั้น 7: ยืนยันส่ง (per-vendor + แจ้งเตือนวันส่ง/นัดส่ง + เอกสารยืดหยุ่น) ──
function shipFor(vid){ const d=sd(); d.shipping=d.shipping||{}; d.shipping.vendors=d.shipping.vendors||{}; vid=String(vid); const p=d.shipping.vendors[vid]=d.shipping.vendors[vid]||{}; if(!Array.isArray(p.docs))p.docs=[]; return p; }
// ── ขั้น 8: รับของครบ (per-vendor + เอกสารยืดหยุ่น) ──
function recvFor(vid){ const d=sd(); d.receive=d.receive||{}; d.receive.vendors=d.receive.vendors||{}; vid=String(vid); const p=d.receive.vendors[vid]=d.receive.vendors[vid]||{}; if(!Array.isArray(p.docs))p.docs=[]; if(!p.status)p.status='รับครบ'; return p; }
// docs ทั่วไปต่อ stage (grp='ship'|'recv')
function stageDocsRow(grp,vid,dc){ return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
    <input placeholder="ชื่อเอกสาร" value="${esc(dc.label||'')}" oninput="updateStageDocLabel('${grp}','${vid}','${dc.id}',this.value)" style="max-width:220px">
    <input type="file" onchange="attachStageDocFile('${grp}','${vid}','${dc.id}',this)">
    ${dc.url?docThumb(dc.url,dc.name||'ไฟล์',{small:true}):''}
    <button class="btn btn-sm" onclick="removeStageDoc('${grp}','${vid}','${dc.id}')" style="color:var(--red)">✕</button></div>`; }
function _grpFor(grp,vid){ return grp==='ship'?shipFor(vid):recvFor(vid); }
function addStageDoc(grp,vid){ _grpFor(grp,vid).docs.push({id:'d'+Date.now(),label:'',url:'',name:''}); renderStageBody(); }
function updateStageDocLabel(grp,vid,id,val){ const dc=_grpFor(grp,vid).docs.find(x=>x.id===id); if(dc)dc.label=val; }
async function attachStageDocFile(grp,vid,id,input){ try{ const r=await uploadFile(input,'PurchaseDocs',grp); if(r){ const dc=_grpFor(grp,vid).docs.find(x=>x.id===id); if(dc){dc.url=r.fileUrl;dc.name=r.fileName;} renderStageBody(); } }catch(e){ alert('อัปโหลดไม่สำเร็จ: '+e.message); } }
function removeStageDoc(grp,vid,id){ const g=_grpFor(grp,vid); g.docs=g.docs.filter(x=>x.id!==id); renderStageBody(); }
function shipInput(vid,f,val){ shipFor(vid)[f]=val; }
function recvInput(vid,f,val){ recvFor(vid)[f]=val; }
function recvQtySet(vid,idx,val){ const p=recvFor(vid); p.recvQty=p.recvQty||{}; p.recvQty[idx]=(val===''?'':+val);
  const its=poItemsForVendor(vid); const done=its.length>0 && its.every(({it,idx})=>(+p.recvQty[idx]||0)>=(+it.qty||0)); p.status=done?'รับครบ':'รับบางส่วน';
  renderStageBody();
}

function renderShipStage(){
  const vids=poVendorList();
  if(!vids.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่ได้เลือก Vendor ในขั้น 4</div>';
  return '<div style="font-size:13px;margin-bottom:10px">ยืนยันการจัดส่งแต่ละ Vendor + ตั้งแจ้งเตือนวันส่ง/นัดส่ง</div>'+
  vids.map(vid=>{ const v=getVendorById(vid), p=shipFor(vid);
    return `<div class="card" style="margin-bottom:14px"><div class="card-head">🏢 ${esc(v?v.name:'?')}</div>
      <div style="padding:12px 14px"><div class="form-grid">
        <div class="form-group"><label>วันที่ส่ง/นัดส่ง</label><input type="date" value="${p.date||''}" oninput="shipInput('${vid}','date',this.value)"></div>
        <div class="form-group"><label>🔔 แจ้งเตือนวันส่ง/นัดส่ง</label><input type="date" value="${p.remindDate||''}" oninput="shipInput('${vid}','remindDate',this.value)"></div>
        <div class="form-group"><label>เลขพัสดุ/Tracking</label><input value="${esc(p.tracking||'')}" oninput="shipInput('${vid}','tracking',this.value)"></div>
        <div class="form-group"><label>หมายเหตุการส่ง</label><input value="${esc(p.note||'')}" oninput="shipInput('${vid}','note',this.value)"></div>
      </div>
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px"><div style="font-size:11px;color:var(--muted);margin-bottom:6px">เอกสารส่งของ (เพิ่มได้ไม่จำกัด)</div>${p.docs.map(dc=>stageDocsRow('ship',vid,dc)).join('')}<button class="btn btn-sm" onclick="addStageDoc('ship','${vid}')">+ เพิ่มเอกสาร</button></div>
      </div></div>`;
  }).join('');
}
function renderRecvStage(){
  const vids=poVendorList();
  if(!vids.length) return '<div style="font-size:13px;color:var(--muted);padding:10px">ยังไม่ได้เลือก Vendor ในขั้น 4</div>';
  return '<div style="font-size:13px;margin-bottom:10px">ตรวจรับสินค้าแต่ละ Vendor — กรอกจำนวนที่รับจริง (รับบางส่วนได้) ครบแล้วปิดงาน</div>'+
  vids.map(vid=>{ const v=getVendorById(vid), p=recvFor(vid); p.recvQty=p.recvQty||{};
    const its=poItemsForVendor(vid);
    let allDone=its.length>0;
    const itemRows=its.map(({it,idx})=>{ const ord=+it.qty||0; const got=(p.recvQty[idx]==null?'':+p.recvQty[idx]); const out=ord-(+got||0); if(out>0)allDone=false;
      return `<tr><td>${esc(it.name)}</td><td style="text-align:center">${ord} ${esc(it.unit||'')}</td><td style="text-align:center"><input type="number" min="0" max="${ord}" value="${got}" placeholder="${ord}" oninput="recvQtySet('${vid}',${idx},this.value)" style="max-width:70px;text-align:center;background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:3px 5px;color:var(--text)"></td><td style="text-align:center;color:${out>0?'var(--amber)':'var(--green)'}">${out>0?'ขาด '+out:'✓ ครบ'}</td></tr>`;
    }).join('');
    return `<div class="card" style="margin-bottom:14px"><div class="card-head">🏢 ${esc(v?v.name:'?')}<span style="margin-left:auto;font-size:11px;color:${allDone?'var(--green)':'var(--amber)'}">${allDone?'✓ รับครบ':'⏳ รับบางส่วน'}</span></div>
      <div style="padding:12px 14px">
      <table style="margin-bottom:10px"><thead><tr><th>รายการ</th><th style="text-align:center">สั่ง</th><th style="text-align:center">รับจริง</th><th style="text-align:center">คงเหลือ</th></tr></thead><tbody>${itemRows||'<tr><td colspan=4 style="text-align:center;color:var(--muted);padding:10px">—</td></tr>'}</tbody></table>
      <div class="form-grid">
        <div class="form-group"><label>วันที่รับของ</label><input type="date" value="${p.date||''}" oninput="recvInput('${vid}','date',this.value)"></div>
        <div class="form-group"><label>หมายเหตุ/QC</label><input value="${esc(p.note||'')}" oninput="recvInput('${vid}','note',this.value)"></div>
      </div>
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px"><div style="font-size:11px;color:var(--muted);margin-bottom:6px">เอกสารรับของ (ใบรับของ/QC ฯลฯ — เพิ่มได้ไม่จำกัด)</div>${p.docs.map(dc=>stageDocsRow('recv',vid,dc)).join('')}<button class="btn btn-sm" onclick="addStageDoc('recv','${vid}')">+ เพิ่มเอกสาร</button></div>
      </div></div>`;
  }).join('');
}

async function uploadFile(input,folder,prefix){
  const f=input.files&&input.files[0]; if(!f) return null;
  const b64=await fileToBase64(f); const data=String(b64).split(',')[1]||'';
  const res=await _uploadFileGraph(folder,prefix+'_'+Date.now()+'_'+f.name,f.type||'application/octet-stream',data);
  return {fileUrl:res.fileUrl,fileName:f.name,b64:data,mime:f.type||'application/octet-stream'};
}
// หัวข้ออีเมลร่วมทั้งงาน (ทุกขั้นใช้ตัวเดียวกัน → client จัดเป็น thread เดียว)
// เก็บหัวข้ออีเมลใน stageData (ถูกบันทึกจริงตอน savePurchase) — migrate จาก editingPO.mailSubject เดิมถ้ามี
function getMailSubject(){ if(!editingPO) return ''; const d=sd(); if(!d.mailSubject && editingPO.mailSubject) d.mailSubject=editingPO.mailSubject; return d.mailSubject || ''; }
function setMailSubject(v){ if(editingPO) sd().mailSubject=v; }
function hasMailSubject(){ return !!(editingPO && (sd().mailSubject||editingPO.mailSubject||'').trim()); }
function subjectField(){ return `<div class="form-group" style="margin-bottom:12px"><label>หัวข้ออีเมล (ใช้ร่วมทุกขั้นตอน — ส่งใน thread เดียวกัน) <span style="color:var(--red)">*จำเป็น</span></label><input id="f-subject" value="${esc(getMailSubject())}" oninput="setMailSubject(this.value)" placeholder="เช่น [จัดซื้อ] ${esc(editingPO?.quoteTitle||'')} (${esc(editingPO?.client||'')})" style="${hasMailSubject()?'':'border-color:var(--amber)'}"></div>`; }
function fileToBase64(file){ return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);}); }
async function attachStageFile(grp,input){
  const sEl=document.getElementById('f-'+grp+'-status'); if(sEl)sEl.textContent='กำลังอัปโหลด...';
  try{ const r=await uploadFile(input,'PurchaseDocs',grp); if(r){ const d=sd(); d[grp]=Object.assign({},d[grp],r); if(sEl)sEl.textContent='✓ แนบแล้ว'; } }
  catch(e){ if(sEl)sEl.textContent=''; alert('อัปโหลดไม่สำเร็จ: '+e.message); }
}
// อ่านค่าจากฟอร์มขั้นปัจจุบันเข้า stageData ก่อนบันทึก
function collectStage(){
  const st=editingPO.stage, d=sd();
  const v=id=>{const e=document.getElementById(id);return e?e.value:undefined;};
  if(st===1){ editingPO.vendorId=v('f-vendor')||''; const ven=getVendorById(editingPO.vendorId); editingPO.vendorName=ven?ven.name:editingPO.vendorName; editingPO.requiredDate=v('f-reqdate')||editingPO.requiredDate; editingPO.note=v('f-note')||''; editingPO.assetType=v('f-assettype')||'sale'; editingPO.assetCategory=v('f-assetcat')||''; }
  else if(st===2){ if(typeof _rfqCaptureNote==='function') _rfqCaptureNote(); }   // vendor tags/note เก็บใน d.rfq แล้ว
  else if(st===5){ /* เอกสาร/ส่งกลับ เก็บใน d.po.vendorDocs โดยตรงแล้ว */ }
  else if(st===6){ /* จ่ายเงิน per-vendor เก็บใน d.payment.vendors โดยตรงแล้ว */ }
  else if(st===7){ /* per-vendor เก็บใน d.shipping.vendors โดยตรงแล้ว */ }
  else if(st===8){ /* per-vendor เก็บใน d.receive.vendors โดยตรงแล้ว */ }
}

// เผยแพร่ราคาต้นทุนรายชิ้น (ที่จัดซื้อได้) → PurchaseItemCost_<quoteId> ให้ SalePro อ่าน
async function publishItemCosts(){
  if(!editingPO || editingPO.quoteId==null || editingPO.quoteId==='') return;
  const d=sd(), r=rfqData();
  let map={}; try{ map=JSON.parse(_getSettingVal('PurchaseItemCost_'+editingPO.quoteId)||'{}')||{}; }catch(e){ map={}; }
  (editingPO.items||[]).forEach((it,idx)=>{
    let cost=0;
    if((d.compareMode||'whole')==='item' && d.itemChoice && d.itemChoice[idx]) cost=vendorItemPrice(d.itemChoice[idx],idx);
    else if(d.chosenVendor) cost=vendorItemPrice(String(d.chosenVendor),idx);
    if(!cost){ const ps=(r.vendorIds||[]).map(vid=>vendorItemPrice(vid,idx)).filter(p=>p>0); if(ps.length) cost=Math.min(...ps); }
    const key=(it.name||'').trim().toLowerCase();
    if(key && cost>0) map[key]={name:it.name, cost, poId:editingPO.id, ts:new Date().toISOString()};
  });
  await putSetting('PurchaseItemCost_'+editingPO.quoteId, JSON.stringify(map));
}
async function savePurchase(){
  if(!editingPO)return;
  collectStage();
  editingPO.history=editingPO.history||[];
  editingPO.history.push({ts:new Date().toISOString(),stage:editingPO.stage,by:currentUser?.displayName||currentUser?.email||''});
  try{
    await putSetting('Purchase_'+editingPO.id, JSON.stringify({stage:editingPO.stage,closed:!!editingPO.closed,assetType:editingPO.assetType||'sale',assetCategory:editingPO.assetCategory||'',stageData:editingPO.stageData,history:editingPO.history.slice(-50)}));
    // ส่ง progress ย่อให้ SalePro อ่าน (อิง quoteId)
    if(editingPO.quoteId!=null){ await putSetting('PurchaseStatus_'+editingPO.quoteId, JSON.stringify({stage:editingPO.stage,text:SALE_PROGRESS[editingPO.stage]||'',vendorName:editingPO.vendorName||'',updatedAt:new Date().toISOString()})); }
    // ส่งราคาต้นทุนรายชิ้น (ที่จัดซื้อได้) กลับให้ SalePro โชว์อัตโนมัติ
    try{ await publishItemCosts(); }catch(e){ console.warn('publishItemCosts',e.message); }
    purchaseExt[String(editingPO.id)]={stage:editingPO.stage,closed:!!editingPO.closed,assetType:editingPO.assetType||'sale',assetCategory:editingPO.assetCategory||'',stageData:editingPO.stageData,history:editingPO.history};
    renderDash(); renderPurchases();
    toast('บันทึกแล้ว','success');
  }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}

async function putSetting(key,value){
  // เขียนลงลิสต์ ProcurementData เสมอ (ข้อมูลจัดซื้อ)
  const L=CONFIG.lists.procurement;
  const ex=_settingsCache.find(i=>i.Title===key);
  if(ex && ex._srcList===L){ await updateListItem(L,ex.id,{Value:value}); ex.Value=value; }
  else if(ex){ /* ค่าเก่ายังอยู่ที่ Settings → สร้างใหม่ในลิสต์จัดซื้อ (ย้าย) */ const c=await createListItem(L,{Title:key,Value:value}); ex.id=c.id; ex.Value=value; ex._srcList=L; }
  else{ const c=await createListItem(L,{Title:key,Value:value}); _settingsCache.push({id:c.id,Title:key,Value:value,_srcList:L}); }
}

// ===== ธีมสี (ต่อผู้ใช้/เครื่อง) =====
const THEME_PRESETS=[
  {name:'ส้ม (ค่าเริ่มต้น)',c:'#d97706'},{name:'ฟ้า',c:'#2563eb'},{name:'เขียวมรกต',c:'#059669'},
  {name:'ม่วง',c:'#7c3aed'},{name:'ชมพู',c:'#db2777'},{name:'แดง',c:'#dc2626'},
  {name:'เทอร์ควอยซ์',c:'#0d9488'},{name:'คราม',c:'#4f46e5'},{name:'เหลืองอำพัน',c:'#ca8a04'}
];
const THEME_DEFAULT='#d97706';
function _lighten(hex,amt){ // amt 0..1 ผสมขาว
  hex=String(hex).replace('#',''); if(hex.length!==6) return hex;
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  const mix=v=>Math.round(v+(255-v)*amt);
  const h=v=>mix(v).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}
function applyAccent(color){
  if(!color) return;
  const root=document.documentElement.style;
  root.setProperty('--accent',color);
  root.setProperty('--accent2',_lighten(color,0.18));
  const hex=String(color).replace('#','');
  if(hex.length===6){ const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16); root.setProperty('--accent-soft',`rgba(${r},${g},${b},0.13)`); }
}
function setAccent(color){ applyAccent(color); try{ localStorage.setItem('pp_accent',color); }catch(e){}
  const hx=document.getElementById('theme-custom-hex'); if(hx) hx.textContent=color.toUpperCase();
  const ci=document.getElementById('theme-custom'); if(ci) ci.value=color;
  _markActiveSwatch(color);
}
function resetAccent(){ setAccent(THEME_DEFAULT); }
// โหมดพื้นหลัง
const THEME_MODES={
  dark:{name:'🌙 เข้ม', vars:{'--bg':'#0e1117','--surface':'#161b22','--surface2':'#1c232d','--border':'#262d38','--border2':'#333c49','--text':'#e6edf3','--muted':'#8b949e'}},
  midnight:{name:'🌑 ดำสนิท', vars:{'--bg':'#000000','--surface':'#0c0c0e','--surface2':'#151518','--border':'#26262c','--border2':'#34343c','--text':'#eaeaf0','--muted':'#8a8a94'}},
  light:{name:'☀️ สว่าง', vars:{'--bg':'#f6f8fa','--surface':'#ffffff','--surface2':'#eef1f4','--border':'#d8dee4','--border2':'#cdd5dd','--text':'#1f2328','--muted':'#656d76'}}
};
const MODE_DEFAULT='dark';
function applyMode(mode){
  const m=THEME_MODES[mode]||THEME_MODES[MODE_DEFAULT];
  const root=document.documentElement.style;
  Object.entries(m.vars).forEach(([k,v])=>root.setProperty(k,v));
}
function setMode(mode){ applyMode(mode); try{ localStorage.setItem('pp_mode',mode); }catch(e){} _markActiveMode(mode); }
function _savedMode(){ try{ return localStorage.getItem('pp_mode')||MODE_DEFAULT; }catch(e){ return MODE_DEFAULT; } }
function _markActiveMode(mode){
  document.querySelectorAll('#theme-modes .modebtn').forEach(el=>{
    const on=el.dataset.m===mode;
    el.style.borderColor=on?'var(--accent)':'var(--border2)';
    el.style.color=on?'var(--accent2)':'var(--muted)';
    el.style.background=on?'var(--accent-soft)':'transparent';
  });
}
function _savedAccent(){ try{ return localStorage.getItem('pp_accent')||THEME_DEFAULT; }catch(e){ return THEME_DEFAULT; } }
function _markActiveSwatch(color){
  document.querySelectorAll('#theme-swatches .sw').forEach(el=>{
    el.style.outline = (el.dataset.c||'').toLowerCase()===String(color).toLowerCase() ? '2px solid var(--text)' : 'none';
  });
}
function openThemePicker(){
  const cur=_savedAccent();
  const mwrap=document.getElementById('theme-modes');
  if(mwrap) mwrap.innerHTML=Object.entries(THEME_MODES).map(([k,m])=>`<button class="btn btn-sm modebtn" data-m="${k}" onclick="setMode('${k}')">${m.name}</button>`).join('');
  _markActiveMode(_savedMode());
  const wrap=document.getElementById('theme-swatches');
  if(wrap) wrap.innerHTML=THEME_PRESETS.map(p=>`<div class="sw" data-c="${p.c}" title="${p.name}" onclick="setAccent('${p.c}')" style="width:34px;height:34px;border-radius:9px;background:${p.c};cursor:pointer;border:1px solid var(--border2)"></div>`).join('');
  const ci=document.getElementById('theme-custom'); if(ci) ci.value=cur;
  const hx=document.getElementById('theme-custom-hex'); if(hx) hx.textContent=cur.toUpperCase();
  _markActiveSwatch(cur);
  openModal('theme-modal');
}

// boot
applyMode(_savedMode());
applyAccent(_savedAccent());
window.addEventListener('DOMContentLoaded',()=>{ tryRestoreSession(); });
