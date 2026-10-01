// ============================================================
// BELOW-COST GUARD + APPROVAL — ยาม "ลดต่ำกว่าทุน" + ขออนุมัติ
// - เตือนรายการที่ราคาขายหลังลด < ต้นทุน
// - ตั้งผู้อนุมัติที่หน้า Admin (Settings: BelowCostApprovers)
// - ขออนุมัติ → ส่งเมล → ผู้อนุมัติเปิดลิงก์ ?bcapprove=<id> → กด Approve
// - คำขอเก็บใน Settings: BelowCostReq_<quoteId> = {status, items, requestedBy, ...}
// ============================================================

let _lastSavedQuoteId = null;

function isBelowCost(it) {
  if (!it || it.type !== 'item') return false;
  const cost = +it.cost || 0;
  if (cost <= 0) return false;
  if (typeof isNumeric === 'function' && !isNumeric(it.price)) return false;
  const eff = (typeof priceNum === 'function' ? priceNum(it) : (+it.price||0)) * (1 - (+it.disc||0)/100);
  return eff < cost - 0.001;
}
function belowCostItems() { return (quoteItems||[]).filter(isBelowCost); }

// ── ผู้อนุมัติขายต่ำกว่าทุน (Settings: BelowCostApprovers = "a@x,b@y") ──
let belowCostApprovers = '';
function getBelowCostApprovers() {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'BelowCostApprovers');
    return it && it.Value ? it.Value : '';
  } catch(e) { return ''; }
}
async function saveBelowCostApprovers() {
  const value = (document.getElementById('bc-approvers')?.value || '').trim();
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const ex = items.find(i => i.Title === 'BelowCostApprovers');
    if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
    else { const c = await createListItem(CONFIG.lists.settings, { Title: 'BelowCostApprovers', Value: value }); if (_settingsCache) _settingsCache.push({ id:c.id, Title:'BelowCostApprovers', Value:value }); }
    belowCostApprovers = value;
    toast('บันทึกผู้อนุมัติขายต่ำกว่าทุนแล้ว', 'success');
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}
function renderBelowCostApproverSetting() {
  const el = document.getElementById('bc-approvers');
  if (el) el.value = getBelowCostApprovers();
}
function parseEmails(raw) { return String(raw||'').split(/[,;\n]+/).map(s=>s.trim()).filter(s=>s.includes('@')); }

// ── คำขออนุมัติรายใบ (Settings: BelowCostReq_<id>) ──
function getBelowCostReq(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'BelowCostReq_' + quoteId);
    if (it && it.Value) return JSON.parse(it.Value);
  } catch(e) {}
  return null;
}
async function putBelowCostReq(quoteId, obj) {
  const value = JSON.stringify(obj);
  const items = _settingsCache || await getListItems(CONFIG.lists.settings);
  const ex = items.find(i => i.Title === 'BelowCostReq_' + quoteId);
  if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
  else { const c = await createListItem(CONFIG.lists.settings, { Title: 'BelowCostReq_' + quoteId, Value: value }); if (_settingsCache) _settingsCache.push({ id:c.id, Title:'BelowCostReq_'+quoteId, Value:value }); }
}

// ── Banner ในหน้าแก้ไขใบเสนอราคา ──
function renderBelowCostBanner() {
  const box = document.getElementById('belowcost-banner');
  if (!box) return;
  const bc = belowCostItems();
  if (!bc.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const req = editingQuoteId ? getBelowCostReq(editingQuoteId) : null;
  let statusHtml = '';
  if (req && req.status === 'approved') statusHtml = `<span style="color:var(--green);font-weight:600">✓ อนุมัติแล้ว โดย ${escHtml(req.approvedBy||'')}</span>`;
  else if (req && req.status === 'pending') statusHtml = `<span style="color:var(--amber)">⏳ รออนุมัติ (ส่งเมลแล้ว ${escHtml(req.requestedAt||'')})</span>`;
  else if (req && req.status === 'rejected') statusHtml = `<span style="color:var(--red)">✕ ไม่อนุมัติ${req.reason?(' — '+escHtml(req.reason)):''}</span>`;
  const list = bc.map(i => `• ${escHtml(i.name||'(ไม่มีชื่อ)')} — ขาย ${fmt((priceNum(i))*(1-(+i.disc||0)/100))} / ทุน ${fmt(+i.cost||0)}`).join('<br>');
  box.style.display = 'block';
  box.innerHTML = `
    <div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.35);border-radius:8px;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;color:var(--red)">⚠ มี ${bc.length} รายการขายต่ำกว่าทุน — ลดเพิ่มไม่ได้ ต้องขออนุมัติก่อนขายราคานี้</span>
        <span style="margin-left:auto;font-size:12px">${statusHtml}</span>
        ${(!req || req.status!=='approved') ? `<button class="btn btn-sm btn-warn" onclick="requestBelowCostApproval()">📧 ขออนุมัติขายต่ำกว่าทุน</button>` : ''}
      </div>
      <div style="font-size:11px;color:#c98;margin-top:6px;line-height:1.6">${list}</div>
    </div>`;
}

async function requestBelowCostApproval() {
  const approvers = parseEmails(getBelowCostApprovers());
  if (!approvers.length) { toast('ยังไม่ได้ตั้งผู้อนุมัติขายต่ำกว่าทุน (ตั้งที่หน้า Approve Settings)', 'error'); return; }
  const bc = belowCostItems();
  if (!bc.length) { toast('ไม่มีรายการต่ำกว่าทุน', 'info'); return; }
  // ต้องบันทึกใบก่อน เพื่อให้มี quoteId ใช้อ้างอิง
  if (!editingQuoteId) {
    toast('กำลังบันทึก Draft ก่อนขออนุมัติ...', 'info');
    await saveQuote('Draft');               // saveQuote เคลียร์ editingQuoteId หลังเสร็จ → ใช้ค่าที่เก็บไว้
  }
  const qid = editingQuoteId || _lastSavedQuoteId;
  if (!qid) { toast('ไม่พบใบเสนอราคา (บันทึกก่อน)', 'error'); return; }
  const q = quotesData.find(x => String(x.id) === String(qid)) || {};
  const today = new Date().toISOString().split('T')[0];
  const reqObj = {
    status: 'pending', quoteTitle: q.Title || '', client: q.ClientName || '',
    requestedBy: currentUser?.displayName || currentUser?.email || '',
    requestedByEmail: currentUser?.email || '', requestedAt: today,
    items: bc.map(i => ({ name:i.name, sell:(priceNum(i))*(1-(+i.disc||0)/100), cost:+i.cost||0 }))
  };
  try {
    await putBelowCostReq(qid, reqObj);
    const link = location.origin + location.pathname + '?bcapprove=' + encodeURIComponent(qid);
    const subj = '[SalePro] ขออนุมัติขายต่ำกว่าทุน — ' + (q.Title||'') + ' (' + (q.ClientName||'') + ')';
    const body = 'มีคำขออนุมัติขายต่ำกว่าทุน\n────────────────────────\n'
      + 'ใบเสนอราคา: ' + (q.Title||'') + '\nลูกค้า: ' + (q.ClientName||'')
      + '\nผู้ขอ: ' + reqObj.requestedBy + '\n\nรายการที่ต่ำกว่าทุน:\n'
      + reqObj.items.map((x,i)=> (i+1)+'. '+x.name+' — ขาย '+fmt(x.sell)+' / ทุน '+fmt(x.cost)+' (ขาดทุน '+fmt(x.cost-x.sell)+')').join('\n')
      + '\n────────────────────────\nกดอนุมัติ/ปฏิเสธที่ลิงก์ (ต้อง Login):\n' + link;
    for (const to of approvers) { try { await _sendMailGraph(to, subj, body); } catch(e) { console.warn('bc mail fail', to, e.message); } }
    toast('ส่งคำขออนุมัติไปยัง ' + approvers.join(', ') + ' แล้ว', 'success');
    renderBelowCostBanner();
  } catch(e) { toast('ขออนุมัติไม่สำเร็จ: ' + e.message, 'error'); }
}

// ── ฝั่งผู้อนุมัติ: เปิดจากลิงก์ ?bcapprove=<id> ──
async function handleBelowCostCallback() {
  const params = new URLSearchParams(location.search);
  const id = params.get('bcapprove');
  if (!id) return;
  // ล้าง query กัน reload ซ้ำ
  history.replaceState(null, '', location.pathname);
  openBelowCostApproveModal(id);
}
function openBelowCostApproveModal(id) {
  const req = getBelowCostReq(id);
  const box = document.getElementById('bc-approve-body');
  if (!box) return;
  if (!req) { box.innerHTML = '<div style="color:var(--muted)">ไม่พบคำขอ (อาจถูกแก้ไข/ลบ)</div>'; openModal('belowcost-modal'); return; }
  document.getElementById('bc-approve-modal-id').value = id;
  const done = req.status !== 'pending';
  box.innerHTML = `
    <div style="font-size:13px;line-height:1.9">
      <div><b>ใบเสนอราคา:</b> ${escHtml(req.quoteTitle||'')}</div>
      <div><b>ลูกค้า:</b> ${escHtml(req.client||'')}</div>
      <div><b>ผู้ขอ:</b> ${escHtml(req.requestedBy||'')} <span style="color:var(--muted)">(${escHtml(req.requestedAt||'')})</span></div>
    </div>
    <div style="margin-top:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:rgba(255,255,255,0.03);color:var(--muted)"><th style="text-align:left;padding:6px 10px">รายการ</th><th style="text-align:right;padding:6px 10px">ขาย</th><th style="text-align:right;padding:6px 10px">ทุน</th><th style="text-align:right;padding:6px 10px">ขาดทุน</th></tr></thead>
        <tbody>${(req.items||[]).map(x=>`<tr><td style="padding:6px 10px;border-top:1px solid var(--border)">${escHtml(x.name||'')}</td><td style="padding:6px 10px;text-align:right;border-top:1px solid var(--border);font-family:var(--mono)">${fmt(x.sell)}</td><td style="padding:6px 10px;text-align:right;border-top:1px solid var(--border);font-family:var(--mono)">${fmt(x.cost)}</td><td style="padding:6px 10px;text-align:right;border-top:1px solid var(--border);font-family:var(--mono);color:var(--red)">${fmt((x.cost||0)-(x.sell||0))}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${done ? `<div style="margin-top:10px;font-weight:600;color:${req.status==='approved'?'var(--green)':'var(--red)'}">${req.status==='approved'?'✓ อนุมัติแล้ว':'✕ ไม่อนุมัติ'} โดย ${escHtml(req.approvedBy||req.decidedBy||'')}</div>` : ''}`;
  // ปุ่ม Approve/Reject แสดงเฉพาะ pending + เป็นผู้อนุมัติ/admin
  const canDecide = !done && (userRoles.isAdmin || userRoles.isApprover || parseEmails(getBelowCostApprovers()).map(e=>e.toLowerCase()).includes((currentUser?.email||'').toLowerCase()));
  document.getElementById('bc-approve-actions').style.display = canDecide ? 'flex' : 'none';
  openModal('belowcost-modal');
}
async function decideBelowCost(approved) {
  const id = document.getElementById('bc-approve-modal-id').value;
  const req = getBelowCostReq(id);
  if (!req) return;
  let reason = '';
  if (!approved) { reason = prompt('เหตุผลที่ไม่อนุมัติ (ถ้ามี):') || ''; }
  req.status = approved ? 'approved' : 'rejected';
  req.approvedBy = currentUser?.displayName || currentUser?.email || '';
  req.decidedAt = new Date().toISOString().split('T')[0];
  if (reason) req.reason = reason;
  try {
    await putBelowCostReq(id, req);
    // แจ้งกลับผู้ขอ
    if (req.requestedByEmail) {
      const subj = '[SalePro] ' + (approved?'อนุมัติ':'ไม่อนุมัติ') + 'การขายต่ำกว่าทุน — ' + (req.quoteTitle||'');
      const body = 'ผลการพิจารณาขายต่ำกว่าทุน: ' + (approved?'อนุมัติ ✓':'ไม่อนุมัติ ✕')
        + '\nใบเสนอราคา: ' + (req.quoteTitle||'') + '\nโดย: ' + req.approvedBy + (reason?('\nเหตุผล: '+reason):'') ;
      try { await _sendMailGraph(req.requestedByEmail, subj, body); } catch(e) {}
    }
    toast(approved ? 'อนุมัติแล้ว' : 'บันทึกการไม่อนุมัติแล้ว', 'success');
    closeModal('belowcost-modal');
    if (String(editingQuoteId) === String(id)) renderBelowCostBanner();
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}
