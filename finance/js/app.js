// ============================================================
// Finance — ควบคุมรายรับรายจ่าย + เบิกจ่ายผ่านการอนุมัติ
// DB: Google Sheet (ร่วมกับ SalePro/PurchasePro/Tech)
// ============================================================
const fmt = n => '฿' + Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt0 = n => Number(n||0).toLocaleString('th-TH',{maximumFractionDigits:0});
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg,type){ const w=document.getElementById('toasts'); if(!w)return; const e=document.createElement('div'); e.className='toast '+(type||'info'); e.textContent=msg; w.appendChild(e); setTimeout(()=>e.remove(),3500); }
function _today(){ return new Date().toISOString().slice(0,10); }

// ── state ──
let finTx = [], finReq = [], finCat = [], impIncome = [], impExpense = [];
let _period = AppStorage.getItem('fin_period') || 'month';
let _view = 'dash';
let _ledgerFilter = { type:'all', source:'all', q:'' };
let _reqFilter = 'all';

// ── Drive preview ──
function _driveId(u){ const s=String(u||''); const m=s.match(/\/d\/([-\w]{10,})/)||s.match(/[?&]id=([-\w]{10,})/); return m?m[1]:''; }
function _driveThumb(u){ const id=_driveId(u); return id?('https://drive.google.com/thumbnail?id='+id+'&sz=w200'):u; }
function docChip(url,name){ if(!url) return ''; const label=esc(name||'เอกสาร');
  return `<span onclick="openDocPreview('${encodeURIComponent(url)}','${encodeURIComponent(name||'')}')" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--accent2);border:1px solid var(--border);border-radius:6px;padding:2px 8px">📎 ${label}</span>`; }
function openDocPreview(encUrl,encName){ const url=decodeURIComponent(encUrl), name=decodeURIComponent(encName||''); const did=_driveId(url);
  let o=document.getElementById('doc-ov'); if(!o){ o=document.createElement('div'); o.id='doc-ov'; o.onclick=e=>{ if(e.target===o)o.remove(); }; document.body.appendChild(o); }
  o.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:28px';
  const viewer = did ? `<iframe src="https://drive.google.com/file/d/${did}/preview" style="width:min(92vw,900px);height:84vh;border:none;border-radius:8px;background:#fff"></iframe>`
    : `<div style="background:var(--card);border-radius:12px;padding:30px;text-align:center"><div style="font-size:48px">📄</div><div style="margin:12px 0">${esc(name||'เอกสาร')}</div><a href="${url}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none">เปิด / ดาวน์โหลด</a></div>`;
  o.innerHTML=`<div onclick="event.stopPropagation()" style="display:flex;flex-direction:column;gap:10px;align-items:center;max-width:95vw"><div style="color:#fff;font-size:13px;display:flex;gap:12px;align-items:center"><span>${esc(name||'เอกสาร')}</span><a href="${url}" target="_blank" rel="noopener" style="color:#9ec1ff">↗ แท็บใหม่</a><span onclick="document.getElementById('doc-ov').remove()" style="cursor:pointer;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.18)">✕</span></div>${viewer}</div>`;
}

// ── upload helper ──
async function uploadDoc(input){ const f=input.files&&input.files[0]; if(!f) return null;
  const b64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]||''); r.onerror=rej; r.readAsDataURL(f); });
  const d=await apiPost('uploadFile','_',null,{folder:'FinanceDocs',fileName:Date.now()+'_'+f.name,mimeType:f.type||'application/octet-stream',base64Data:b64});
  return { url:(d&&d.fileUrl)||'', name:f.name };
}

// ── login flow ──
async function afterLogin(){
  document.getElementById('user-name').textContent = currentUser.displayName||currentUser.email;
  document.getElementById('user-avatar').textContent = (currentUser.displayName||'U')[0].toUpperCase();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-screen').style.display='flex';
  await loadAll();
  await loadUserRoles();
  document.getElementById('role-badge').innerHTML = isApproverUser()
    ? '<span style="background:rgba(251,191,36,.2);color:var(--amber);padding:1px 7px;border-radius:10px;font-size:10px">ผู้อนุมัติ</span>'
    : '<span style="background:rgba(79,142,247,.15);color:var(--accent2);padding:1px 7px;border-radius:10px;font-size:10px">ผู้ใช้</span>';
  go(_view);
}

// ── data ──
async function loadAll(){
  try{
    finTx  = await getListItems(CONFIG.lists.financeTx).catch(()=>[]);
    finReq = await getListItems(CONFIG.lists.financeReq).catch(()=>[]);
    finCat = await getListItems(CONFIG.lists.financeCat).catch(()=>[]);
    // รายรับจาก SalePro (Payments)
    const pays = await getListItems(CONFIG.lists.payments).catch(()=>[]);
    impIncome = (pays||[]).filter(p=>+p.AmountPaid>0).map(p=>({
      date:(p.PaymentDate||'').slice(0,10), type:'income', category:'รายรับจากการขาย',
      amount:+p.AmountPaid||0, party:p.ClientName||('ใบเสนอราคา '+(p.QuoteID||'')), method:p.PaymentMethod||'',
      note:p.Note||p.Reference||'', docUrl:p.SlipURL||'', docName:'สลิป', source:'SalePro'
    }));
    // รายจ่ายจาก PurchasePro (Procurement → Purchase_<id> JSON → payment.vendors)
    impExpense = [];
    try{
      const proc = await getListItems(CONFIG.lists.procurement).catch(()=>[]);
      const venItem = proc.find(i=>i.Title==='Vendors'); let vendors=[];
      try{ vendors = venItem&&venItem.Value?JSON.parse(venItem.Value):[]; }catch(e){}
      const vName = id => { const v=vendors.find(x=>String(x.id)===String(id)); return v?v.name:'Vendor'; };
      proc.forEach(row=>{ if(!(row.Title||'').startsWith('Purchase_'))return;
        let ext={}; try{ ext=JSON.parse(row.Value||'{}'); }catch(e){ return; }
        const vs=(ext.stageData&&ext.stageData.payment&&ext.stageData.payment.vendors)||{};
        Object.keys(vs).forEach(vid=>{ const p=vs[vid]; const amt=+p.amount||0; if(amt<=0)return;
          const wht=+(amt*(+p.whtPct||0)/100); const net=+(amt-wht).toFixed(2);
          impExpense.push({ date:(p.date||'').slice(0,10), type:'expense', category:'ค่าซื้อสินค้า/วัตถุดิบ',
            amount:net, party:vName(vid), method:p.method||'', note:(p.invNo?'INV '+p.invNo:'')+(ext.quoteTitle?' · '+ext.quoteTitle:''),
            docUrl:p.slipUrl||p.invUrl||'', docName:'หลักฐานจ่าย', source:'PurchasePro' });
        });
      });
    }catch(e){ console.warn('load purchasepro expense',e.message); }
  }catch(e){ toast('โหลดข้อมูลไม่สำเร็จ: '+e.message,'error'); }
}
function catNames(kind){ const fromSheet=finCat.filter(c=>(c.Kind||'')===kind).map(c=>c.Name).filter(Boolean);
  return fromSheet.length?fromSheet:(DEFAULT_CATEGORIES[kind]||[]); }

// รวมทุกแหล่งเป็น ledger เดียว
function allEntries(){
  const manual = finTx.map(t=>({ _id:t._id||t.id, date:(t.Date||'').slice(0,10), type:t.TxType||'expense', category:t.Category||'', amount:+t.Amount||0, party:t.Party||'', method:t.Method||'', note:t.Note||'', docUrl:t.DocURL||'', docName:t.DocName||'', source:'Manual', editable:true }));
  const reqPaid = finReq.filter(r=>r.Status==='Paid').map(r=>({ date:(r.PaidDate||r.ApprovedAt||r.Date||'').slice(0,10), type:'expense', category:r.Category||'เบิกจ่าย', amount:+r.Amount||0, party:r.Requester||'', method:r.PaidMethod||'', note:'ใบเบิก '+(r.ReqNo||'')+(r.Reason?' · '+r.Reason:''), docUrl:r.DocURL||'', docName:r.DocName||'', source:'เบิกจ่าย' }));
  return manual.concat(reqPaid, impIncome, impExpense).filter(e=>e.date);
}
function periodRange(){
  const now=new Date(); let start=null;
  if(_period==='month') start=new Date(now.getFullYear(),now.getMonth(),1);
  else if(_period==='year') start=new Date(now.getFullYear(),0,1);
  return start?start.toISOString().slice(0,10):null;
}
function inPeriod(e){ const s=periodRange(); return !s || e.date>=s; }

// ── nav ──
function go(v){ _view=v;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.v===v));
  const el=document.getElementById('view');
  if(v==='dash') el.innerHTML=renderDash();
  else if(v==='ledger') el.innerHTML=renderLedger();
  else if(v==='req') el.innerHTML=renderReq();
  else if(v==='cat') el.innerHTML=renderCat();
  else if(v==='report') el.innerHTML=renderReport();
  if(v==='dash') setTimeout(drawCharts,30);
}

// ── Dashboard ──
function periodLabel(){ return _period==='month'?'เดือนนี้':_period==='year'?'ปีนี้':'ทั้งหมด'; }
function renderDash(){
  const ents=allEntries().filter(inPeriod);
  const inc=ents.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const exp=ents.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
  const net=inc-exp;
  const pending=finReq.filter(r=>r.Status==='Pending').length;
  const periodBtns=['month','year','all'].map(p=>`<button class="chip ${_period===p?'active':''}" onclick="setPeriod('${p}')">${p==='month'?'เดือนนี้':p==='year'?'ปีนี้':'ทั้งหมด'}</button>`).join('');
  return `<div class="page-head"><h2>ภาพรวมการเงิน <span style="font-size:13px;color:var(--muted);font-weight:400">· ${periodLabel()}</span></h2><div class="chips">${periodBtns}</div></div>
    <div class="cards">
      <div class="card stat"><div class="stat-l">รายรับ</div><div class="stat-v" style="color:var(--green)">${fmt(inc)}</div></div>
      <div class="card stat"><div class="stat-l">รายจ่าย</div><div class="stat-v" style="color:var(--red)">${fmt(exp)}</div></div>
      <div class="card stat"><div class="stat-l">คงเหลือสุทธิ</div><div class="stat-v" style="color:${net>=0?'var(--accent2)':'var(--red)'}">${fmt(net)}</div></div>
      <div class="card stat"><div class="stat-l">ใบขอเบิกรออนุมัติ</div><div class="stat-v" style="color:var(--amber)">${pending} <span style="font-size:13px;color:var(--muted)">ใบ</span></div></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-h">รายจ่ายตามหมวดหมู่</div><div id="donut"></div></div>
      <div class="card"><div class="card-h">รายรับ-รายจ่าย รายเดือน</div><div id="bars"></div></div>
    </div>`;
}
function setPeriod(p){ _period=p; AppStorage.setItem('fin_period',p); go('dash'); }
function drawCharts(){
  const ents=allEntries().filter(inPeriod);
  // donut: expense by category
  const byCat={}; ents.filter(e=>e.type==='expense').forEach(e=>{ byCat[e.category||'อื่น ๆ']=(byCat[e.category||'อื่น ๆ']||0)+e.amount; });
  const pairs=Object.entries(byCat).sort((a,b)=>b[1]-a[1]); const total=pairs.reduce((s,p)=>s+p[1],0);
  const dEl=document.getElementById('donut'); if(dEl){
    if(!total){ dEl.innerHTML='<div class="empty">ยังไม่มีรายจ่าย</div>'; }
    else{ const colors=['#4f8ef7','#34d399','#fbbf24','#f87171','#a78bfa','#f472b6','#2dd4bf','#fb923c','#94a3b8'];
      let acc=0; const R=52,C=66,sw=22; const circ=2*Math.PI*R;
      const segs=pairs.map((p,i)=>{ const frac=p[1]/total; const dash=frac*circ; const off=circ-acc*circ; acc+=frac;
        return `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="${sw}" stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${off}" transform="rotate(-90 ${C} ${C})"/>`; }).join('');
      const legend=pairs.map((p,i)=>`<div class="lg"><span class="dot" style="background:${colors[i%colors.length]}"></span><span class="lg-n">${esc(p[0])}</span><span class="lg-v">${fmt0(p[1])} (${Math.round(p[1]/total*100)}%)</span></div>`).join('');
      dEl.innerHTML=`<div class="donut-wrap"><svg width="132" height="132" viewBox="0 0 132 132">${segs}<text x="66" y="62" text-anchor="middle" font-size="11" fill="var(--muted)">รวม</text><text x="66" y="78" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">${fmt0(total)}</text></svg><div class="legend">${legend}</div></div>`;
    }
  }
  // bars: monthly income vs expense (last 6 buckets within data)
  const mInc={}, mExp={};
  ents.forEach(e=>{ const m=(e.date||'').slice(0,7); if(!m)return; if(e.type==='income')mInc[m]=(mInc[m]||0)+e.amount; else mExp[m]=(mExp[m]||0)+e.amount; });
  const months=[...new Set([...Object.keys(mInc),...Object.keys(mExp)])].sort().slice(-6);
  const bEl=document.getElementById('bars'); if(bEl){
    if(!months.length){ bEl.innerHTML='<div class="empty">ยังไม่มีข้อมูล</div>'; }
    else{ const max=Math.max(1,...months.map(m=>Math.max(mInc[m]||0,mExp[m]||0)));
      bEl.innerHTML='<div class="bars">'+months.map(m=>{ const ih=Math.round((mInc[m]||0)/max*120), eh=Math.round((mExp[m]||0)/max*120);
        return `<div class="bar-col"><div class="bar-pair"><div class="bar bi" style="height:${ih}px" title="รับ ${fmt(mInc[m]||0)}"></div><div class="bar be" style="height:${eh}px" title="จ่าย ${fmt(mExp[m]||0)}"></div></div><div class="bar-x">${m.slice(5)}/${m.slice(2,4)}</div></div>`; }).join('')+'</div>'
        +'<div class="bars-legend"><span><span class="dot" style="background:var(--green)"></span>รายรับ</span><span><span class="dot" style="background:var(--red)"></span>รายจ่าย</span></div>';
    }
  }
}

// ── Ledger ──
function renderLedger(){
  let ents=allEntries().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const f=_ledgerFilter;
  if(f.type!=='all') ents=ents.filter(e=>e.type===f.type);
  if(f.source!=='all') ents=ents.filter(e=>e.source===f.source);
  if(f.q){ const q=f.q.toLowerCase(); ents=ents.filter(e=>(e.party+' '+e.category+' '+e.note).toLowerCase().includes(q)); }
  const srcBadge=s=>{ const c={Manual:'#94a3b8',SalePro:'#4f8ef7',PurchasePro:'#2dd4bf','เบิกจ่าย':'#a78bfa'}[s]||'#94a3b8'; return `<span style="font-size:10px;background:${c}22;color:${c};padding:1px 6px;border-radius:8px">${s}</span>`; };
  const rows=ents.length?ents.map(e=>`<tr>
    <td>${fmtDate(e.date)}</td>
    <td>${e.type==='income'?'<span style="color:var(--green)">▲ รับ</span>':'<span style="color:var(--red)">▼ จ่าย</span>'}</td>
    <td>${esc(e.category)}</td>
    <td>${esc(e.party)}<div style="font-size:10px;color:var(--muted)">${esc(e.note)}</div></td>
    <td style="text-align:right;font-family:var(--mono);color:${e.type==='income'?'var(--green)':'var(--red)'}">${e.type==='income'?'+':'-'}${fmt0(e.amount)}</td>
    <td>${srcBadge(e.source)}</td>
    <td>${docChip(e.docUrl,e.docName)}</td>
    <td style="text-align:right">${e.editable?`<button class="ic" onclick="editTx('${e._id}')" title="แก้ไข">✏️</button><button class="ic" onclick="delTx('${e._id}')" title="ลบ" style="color:var(--red)">✕</button>`:''}</td>
  </tr>`).join(''):'<tr><td colspan="8" class="empty">ไม่มีรายการ</td></tr>';
  const srcOpts=['all','Manual','SalePro','PurchasePro','เบิกจ่าย'].map(s=>`<option value="${s}" ${f.source===s?'selected':''}>${s==='all'?'ทุกแหล่ง':s}</option>`).join('');
  return `<div class="page-head"><h2>รายการรับ-จ่าย</h2>
    <div style="display:flex;gap:8px"><button class="btn btn-sm" onclick="openTx('income')" style="border-color:var(--green);color:var(--green)">+ รายรับ</button><button class="btn btn-primary btn-sm" onclick="openTx('expense')">+ รายจ่าย</button></div></div>
    <div class="toolbar">
      <select onchange="_ledgerFilter.type=this.value;go('ledger')"><option value="all">ทุกประเภท</option><option value="income" ${f.type==='income'?'selected':''}>รายรับ</option><option value="expense" ${f.type==='expense'?'selected':''}>รายจ่าย</option></select>
      <select onchange="_ledgerFilter.source=this.value;go('ledger')">${srcOpts}</select>
      <input placeholder="🔍 ค้นหา..." value="${esc(f.q)}" oninput="_ledgerFilter.q=this.value" onkeydown="if(event.key==='Enter')go('ledger')">
    </div>
    <div class="card"><table class="tbl"><thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวดหมู่</th><th>รายละเอียด</th><th style="text-align:right">จำนวนเงิน</th><th>แหล่ง</th><th>เอกสาร</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ── Tx modal ──
let _editTxId=null, _txDoc=null;
function openTx(type,row){ _editTxId=row?row._id:null; _txDoc=row?{url:row.docUrl,name:row.docName}:null;
  const cats=catNames(type);
  const r=row||{};
  modal(`${_editTxId?'แก้ไข':'เพิ่ม'}${type==='income'?'รายรับ':'รายจ่าย'}`,`
    <input type="hidden" id="tx-type" value="${type}">
    <div class="fg"><label>วันที่</label><input type="date" id="tx-date" value="${r.date||_today()}"></div>
    <div class="fg"><label>หมวดหมู่</label><select id="tx-cat">${cats.map(c=>`<option ${r.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="fg"><label>จำนวนเงิน (บาท)</label><input type="number" id="tx-amt" step="0.01" value="${r.amount||''}" placeholder="0.00"></div>
    <div class="fg"><label>${type==='income'?'ผู้จ่าย/ลูกค้า':'ผู้รับ/ผู้ขาย'}</label><input id="tx-party" value="${esc(r.party||'')}"></div>
    <div class="fg"><label>วิธีชำระ</label><select id="tx-method">${['เงินโอน','เงินสด','เช็ค','บัตรเครดิต','อื่น ๆ'].map(m=>`<option ${r.method===m?'selected':''}>${m}</option>`).join('')}</select></div>
    <div class="fg"><label>หมายเหตุ</label><input id="tx-note" value="${esc(r.note||'')}"></div>
    <div class="fg"><label>เอกสารแนบ</label><input type="file" id="tx-file" onchange="_txUpload(this)"><span id="tx-doc">${_txDoc&&_txDoc.url?docChip(_txDoc.url,_txDoc.name):''}</span></div>
  `,`<button class="btn btn-primary" onclick="saveTx()">บันทึก</button>`);
}
function editTx(id){ const t=finTx.find(x=>String(x._id||x.id)===String(id)); if(!t)return; openTx(t.TxType||'expense',{_id:t._id||t.id,date:(t.Date||'').slice(0,10),category:t.Category,amount:+t.Amount||0,party:t.Party,method:t.Method,note:t.Note,docUrl:t.DocURL,docName:t.DocName}); }
async function _txUpload(input){ const el=document.getElementById('tx-doc'); if(el)el.textContent='⏳...'; try{ _txDoc=await uploadDoc(input); if(el)el.innerHTML=_txDoc?docChip(_txDoc.url,_txDoc.name):''; }catch(e){ if(el)el.textContent='อัปโหลดไม่สำเร็จ'; } }
async function saveTx(){
  const type=document.getElementById('tx-type').value;
  const amt=+document.getElementById('tx-amt').value||0; if(amt<=0){ toast('กรอกจำนวนเงิน','error'); return; }
  const fields={ Date:document.getElementById('tx-date').value, TxType:type, Category:document.getElementById('tx-cat').value,
    Amount:String(amt), Method:document.getElementById('tx-method').value, Party:document.getElementById('tx-party').value,
    Note:document.getElementById('tx-note').value, DocURL:_txDoc?_txDoc.url:'', DocName:_txDoc?_txDoc.name:'', CreatedBy:currentUser.email };
  try{ closeModal();
    if(_editTxId){ await updateListItem(CONFIG.lists.financeTx,_editTxId,fields); const i=finTx.findIndex(x=>String(x._id||x.id)===String(_editTxId)); if(i>=0)finTx[i]=Object.assign(finTx[i],fields); }
    else { const it=await createListItem(CONFIG.lists.financeTx,fields); finTx.push(it); }
    toast('บันทึกแล้ว','success'); go('ledger');
  }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}
async function delTx(id){ if(!confirm('ลบรายการนี้?'))return; try{ await deleteListItem(CONFIG.lists.financeTx,id); finTx=finTx.filter(x=>String(x._id||x.id)!==String(id)); toast('ลบแล้ว','success'); go('ledger'); }catch(e){ toast('ลบไม่สำเร็จ','error'); } }

// ── Expense Requests (ใบขอเบิก) ──
function _nextReqNo(){ const y=new Date().getFullYear(); const n=finReq.filter(r=>(r.ReqNo||'').indexOf('REQ'+y)===0).length+1; return 'REQ'+y+String(n).padStart(3,'0'); }
function reqStatusBadge(s){ const m={Pending:['รออนุมัติ','var(--amber)'],Approved:['อนุมัติแล้ว','var(--accent2)'],Rejected:['ปฏิเสธ','var(--red)'],Paid:['จ่ายแล้ว','var(--green)']}; const x=m[s]||['—','var(--muted)']; return `<span style="font-size:11px;background:${x[1]}22;color:${x[1]};padding:2px 8px;border-radius:10px">${x[0]}</span>`; }
function renderReq(){
  let rs=finReq.slice().sort((a,b)=>(b.ReqNo||'').localeCompare(a.ReqNo||''));
  if(_reqFilter!=='all') rs=rs.filter(r=>r.Status===_reqFilter);
  const tabs=['all','Pending','Approved','Paid','Rejected'].map(s=>`<button class="chip ${_reqFilter===s?'active':''}" onclick="_reqFilter='${s}';go('req')">${s==='all'?'ทั้งหมด':reqStatusBadge(s).replace(/<[^>]+>/g,'')}</button>`).join('');
  const rows=rs.length?rs.map(r=>{ const canApprove=isApproverUser()&&r.Status==='Pending'; const canPay=isApproverUser()&&r.Status==='Approved';
    return `<tr>
      <td><b>${esc(r.ReqNo||'')}</b><div style="font-size:10px;color:var(--muted)">${fmtDate(r.Date)}</div></td>
      <td>${esc(r.Requester||'')}</td>
      <td>${esc(r.Category||'')}<div style="font-size:10px;color:var(--muted)">${esc(r.Reason||'')}</div></td>
      <td style="text-align:right;font-family:var(--mono)">${fmt0(+r.Amount||0)}</td>
      <td>${reqStatusBadge(r.Status)}${r.ApproveNote?`<div style="font-size:10px;color:var(--muted)">${esc(r.ApproveNote)}</div>`:''}</td>
      <td>${docChip(r.DocURL,r.DocName)}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="ic" onclick="viewReq('${r._id||r.id}')" title="ดู">👁</button>
        ${canApprove?`<button class="btn btn-sm" style="border-color:var(--green);color:var(--green)" onclick="approveReq('${r._id||r.id}',true)">อนุมัติ</button><button class="btn btn-sm" style="border-color:var(--red);color:var(--red)" onclick="approveReq('${r._id||r.id}',false)">ปฏิเสธ</button>`:''}
        ${canPay?`<button class="btn btn-primary btn-sm" onclick="payReq('${r._id||r.id}')">บันทึกจ่าย</button>`:''}
      </td></tr>`; }).join(''):'<tr><td colspan="7" class="empty">ไม่มีใบขอเบิก</td></tr>';
  return `<div class="page-head"><h2>ใบขอเบิก / เบิกจ่าย</h2><button class="btn btn-primary btn-sm" onclick="openReq()">+ สร้างใบขอเบิก</button></div>
    <div class="chips">${tabs}</div>
    <div class="card"><table class="tbl"><thead><tr><th>เลขที่</th><th>ผู้ขอ</th><th>หมวด/เหตุผล</th><th style="text-align:right">จำนวน</th><th>สถานะ</th><th>เอกสาร</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
let _reqDoc=null;
function openReq(){ _reqDoc=null; const cats=catNames('expense');
  modal('สร้างใบขอเบิก',`
    <div class="fg"><label>วันที่</label><input type="date" id="rq-date" value="${_today()}"></div>
    <div class="fg"><label>หมวดหมู่</label><select id="rq-cat">${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
    <div class="fg"><label>จำนวนเงิน (บาท)</label><input type="number" id="rq-amt" step="0.01" placeholder="0.00"></div>
    <div class="fg"><label>เหตุผล/รายละเอียดการเบิก</label><textarea id="rq-reason" rows="3" placeholder="เช่น ค่าเดินทางไปติดตั้งงานลูกค้า..."></textarea></div>
    <div class="fg"><label>เอกสาร/ใบเสร็จแนบ</label><input type="file" id="rq-file" onchange="_rqUpload(this)"><span id="rq-doc"></span></div>
  `,`<button class="btn btn-primary" onclick="saveReq()">ส่งขออนุมัติ</button>`);
}
async function _rqUpload(input){ const el=document.getElementById('rq-doc'); if(el)el.textContent='⏳...'; try{ _reqDoc=await uploadDoc(input); if(el)el.innerHTML=_reqDoc?docChip(_reqDoc.url,_reqDoc.name):''; }catch(e){ if(el)el.textContent='อัปโหลดไม่สำเร็จ'; } }
async function saveReq(){
  const amt=+document.getElementById('rq-amt').value||0; if(amt<=0){ toast('กรอกจำนวนเงิน','error'); return; }
  const reason=document.getElementById('rq-reason').value.trim(); if(!reason){ toast('กรอกเหตุผลการเบิก','error'); return; }
  const fields={ ReqNo:_nextReqNo(), Date:document.getElementById('rq-date').value, Requester:currentUser.displayName||currentUser.email, RequesterEmail:currentUser.email,
    Category:document.getElementById('rq-cat').value, Amount:String(amt), Reason:reason, DocURL:_reqDoc?_reqDoc.url:'', DocName:_reqDoc?_reqDoc.name:'', Status:'Pending' };
  try{ closeModal(); const it=await createListItem(CONFIG.lists.financeReq,fields); finReq.push(it); toast('ส่งใบขอเบิกแล้ว รออนุมัติ','success'); go('req'); }catch(e){ toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}
async function approveReq(id,ok){ const r=finReq.find(x=>String(x._id||x.id)===String(id)); if(!r)return;
  let note=''; if(!ok){ note=prompt('เหตุผลที่ปฏิเสธ:')||''; if(note===null)return; }
  const fields={ Status:ok?'Approved':'Rejected', Approver:currentUser.displayName||currentUser.email, ApproveNote:note, ApprovedAt:_today() };
  try{ await updateListItem(CONFIG.lists.financeReq,id,fields); Object.assign(r,fields); toast(ok?'อนุมัติแล้ว':'ปฏิเสธแล้ว','success'); go('req'); }catch(e){ toast('ไม่สำเร็จ: '+e.message,'error'); }
}
function payReq(id){ const r=finReq.find(x=>String(x._id||x.id)===String(id)); if(!r)return;
  modal('บันทึกการจ่ายเงิน — '+(r.ReqNo||''),`
    <div style="font-size:13px;margin-bottom:8px">จำนวน <b>${fmt(+r.Amount||0)}</b> · ${esc(r.Category||'')}</div>
    <div class="fg"><label>วันที่จ่าย</label><input type="date" id="pr-date" value="${_today()}"></div>
    <div class="fg"><label>วิธีจ่าย</label><select id="pr-method">${['เงินโอน','เงินสด','เช็ค','บัตรเครดิต'].map(m=>`<option>${m}</option>`).join('')}</select></div>
  `,`<button class="btn btn-primary" onclick="doPayReq('${id}')">ยืนยันจ่ายแล้ว</button>`);
}
async function doPayReq(id){ const r=finReq.find(x=>String(x._id||x.id)===String(id)); if(!r)return;
  const fields={ Status:'Paid', PaidDate:document.getElementById('pr-date').value, PaidMethod:document.getElementById('pr-method').value };
  try{ closeModal(); await updateListItem(CONFIG.lists.financeReq,id,fields); Object.assign(r,fields); toast('บันทึกจ่ายแล้ว','success'); go('req'); }catch(e){ toast('ไม่สำเร็จ: '+e.message,'error'); }
}
function viewReq(id){ const r=finReq.find(x=>String(x._id||x.id)===String(id)); if(!r)return;
  modal('ใบขอเบิก '+(r.ReqNo||''),`
    <div class="rv"><span>วันที่</span><b>${fmtDate(r.Date)}</b></div>
    <div class="rv"><span>ผู้ขอเบิก</span><b>${esc(r.Requester||'')}</b></div>
    <div class="rv"><span>หมวดหมู่</span><b>${esc(r.Category||'')}</b></div>
    <div class="rv"><span>จำนวนเงิน</span><b style="color:var(--red)">${fmt(+r.Amount||0)}</b></div>
    <div class="rv"><span>เหตุผล</span><b style="text-align:right;max-width:60%">${esc(r.Reason||'')}</b></div>
    <div class="rv"><span>สถานะ</span><b>${reqStatusBadge(r.Status)}</b></div>
    ${r.Approver?`<div class="rv"><span>ผู้อนุมัติ</span><b>${esc(r.Approver)} (${fmtDate(r.ApprovedAt)})</b></div>`:''}
    ${r.ApproveNote?`<div class="rv"><span>หมายเหตุอนุมัติ</span><b>${esc(r.ApproveNote)}</b></div>`:''}
    ${r.Status==='Paid'?`<div class="rv"><span>จ่ายเมื่อ</span><b>${fmtDate(r.PaidDate)} · ${esc(r.PaidMethod||'')}</b></div>`:''}
    ${r.DocURL?`<div style="margin-top:10px">${docChip(r.DocURL,r.DocName||'เอกสารแนบ')}</div>`:''}
  `,'');
}

// ── Categories ──
function renderCat(){
  const mk=kind=>{ const list=finCat.filter(c=>(c.Kind||'')===kind); const names=list.length?list:(DEFAULT_CATEGORIES[kind]||[]).map(n=>({Name:n,_seed:true}));
    return names.map(c=>`<div class="cat-row"><span>${esc(c.Name)}</span>${(isAdminUser()&&!c._seed)?`<button class="ic" style="color:var(--red)" onclick="delCat('${c._id||c.id}')">✕</button>`:(c._seed?'<span style="font-size:10px;color:var(--muted)">ค่าเริ่มต้น</span>':'')}</div>`).join(''); };
  const addBtn=kind=>isAdminUser()?`<div style="display:flex;gap:6px;margin-top:8px"><input id="newcat-${kind}" placeholder="เพิ่มหมวด..." style="flex:1"><button class="btn btn-sm" onclick="addCat('${kind}')">+ เพิ่ม</button></div>`:'';
  return `<div class="page-head"><h2>หมวดหมู่</h2></div>
    <div class="grid2">
      <div class="card"><div class="card-h" style="color:var(--green)">หมวดรายรับ</div>${mk('income')}${addBtn('income')}</div>
      <div class="card"><div class="card-h" style="color:var(--red)">หมวดรายจ่าย</div>${mk('expense')}${addBtn('expense')}</div>
    </div>
    ${!isAdminUser()?'<div style="font-size:12px;color:var(--muted);margin-top:10px">* เฉพาะผู้ดูแลระบบจึงแก้ไขหมวดหมู่ได้</div>':''}`;
}
async function addCat(kind){ const inp=document.getElementById('newcat-'+kind); const name=(inp.value||'').trim(); if(!name)return;
  try{ const it=await createListItem(CONFIG.lists.financeCat,{Name:name,Kind:kind}); finCat.push(it); toast('เพิ่มหมวดแล้ว','success'); go('cat'); }catch(e){ toast('ไม่สำเร็จ: '+e.message,'error'); } }
async function delCat(id){ if(!confirm('ลบหมวดนี้?'))return; try{ await deleteListItem(CONFIG.lists.financeCat,id); finCat=finCat.filter(c=>String(c._id||c.id)!==String(id)); go('cat'); }catch(e){ toast('ไม่สำเร็จ','error'); } }

// ── Reports ──
function renderReport(){
  const ents=allEntries().filter(inPeriod);
  const sum=(type)=>{ const by={}; ents.filter(e=>e.type===type).forEach(e=>{ by[e.category||'อื่น ๆ']=(by[e.category||'อื่น ๆ']||0)+e.amount; }); return Object.entries(by).sort((a,b)=>b[1]-a[1]); };
  const inc=sum('income'), exp=sum('expense'); const ti=inc.reduce((s,p)=>s+p[1],0), te=exp.reduce((s,p)=>s+p[1],0);
  const tbl=(pairs,tot,color)=>pairs.length?pairs.map(p=>`<tr><td>${esc(p[0])}</td><td style="text-align:right;font-family:var(--mono)">${fmt0(p[1])}</td><td style="text-align:right;color:var(--muted)">${tot?Math.round(p[1]/tot*100):0}%</td></tr>`).join(''):'<tr><td colspan="3" class="empty">—</td></tr>';
  const periodBtns=['month','year','all'].map(p=>`<button class="chip ${_period===p?'active':''}" onclick="setPeriodR('${p}')">${p==='month'?'เดือนนี้':p==='year'?'ปีนี้':'ทั้งหมด'}</button>`).join('');
  return `<div class="page-head"><h2>รายงานสรุป (P&L) <span style="font-size:13px;color:var(--muted);font-weight:400">· ${periodLabel()}</span></h2>
    <div style="display:flex;gap:8px;align-items:center"><div class="chips">${periodBtns}</div><button class="btn btn-sm" onclick="exportCSV()">⬇ CSV</button></div></div>
    <div class="grid2">
      <div class="card"><div class="card-h" style="color:var(--green)">รายรับตามหมวด · รวม ${fmt(ti)}</div><table class="tbl"><tbody>${tbl(inc,ti)}</tbody></table></div>
      <div class="card"><div class="card-h" style="color:var(--red)">รายจ่ายตามหมวด · รวม ${fmt(te)}</div><table class="tbl"><tbody>${tbl(exp,te)}</tbody></table></div>
    </div>
    <div class="card" style="margin-top:14px;text-align:center;padding:16px"><span style="color:var(--muted)">กำไร/ขาดทุนสุทธิ</span> <span style="font-size:22px;font-weight:700;color:${ti-te>=0?'var(--accent2)':'var(--red)'};margin-left:10px">${fmt(ti-te)}</span></div>`;
}
function setPeriodR(p){ _period=p; AppStorage.setItem('fin_period',p); go('report'); }
function exportCSV(){
  const ents=allEntries().filter(inPeriod).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const head=['วันที่','ประเภท','หมวดหมู่','รายละเอียด','จำนวนเงิน','วิธีชำระ','แหล่ง'];
  const rows=ents.map(e=>[e.date,e.type==='income'?'รายรับ':'รายจ่าย',e.category,(e.party+' '+e.note).trim(),e.amount,e.method,e.source]);
  const csv='﻿'+[head].concat(rows).map(r=>r.map(c=>`"${String(c==null?'':c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='finance_'+_period+'_'+_today()+'.csv'; a.click();
}

// ── modal helpers ──
function modal(title,body,footer){ let o=document.getElementById('modal-ov'); if(!o){ o=document.createElement('div'); o.id='modal-ov'; o.onclick=e=>{ if(e.target===o)closeModal(); }; document.body.appendChild(o); }
  o.style.cssText='position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px';
  o.innerHTML=`<div onclick="event.stopPropagation()" class="modal"><div class="modal-h">${esc(title)}<span onclick="closeModal()" style="cursor:pointer;color:var(--muted)">✕</span></div><div class="modal-b">${body}</div><div class="modal-f">${footer||''}</div></div>`;
}
function closeModal(){ const o=document.getElementById('modal-ov'); if(o)o.remove(); }
