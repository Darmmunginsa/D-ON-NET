// ============================================================
// DRAG & DROP — ITEMS REORDER
// ============================================================
let dragSrcId = null;

function itemDragStart(e, id) {
  dragSrcId = id;
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}
function itemDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('#items-body tr').forEach(r => r.style.borderTop = '');
  e.currentTarget.style.borderTop = '2px solid var(--accent)';
}
function itemDrop(e, targetId) {
  e.preventDefault();
  document.querySelectorAll('#items-body tr').forEach(r => r.style.borderTop = '');
  if (dragSrcId === targetId) return;
  const srcIdx = quoteItems.findIndex(i => i.id === dragSrcId);
  const tgtIdx = quoteItems.findIndex(i => i.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const [moved] = quoteItems.splice(srcIdx, 1);
  quoteItems.splice(tgtIdx, 0, moved);
  renderItems();
}
function itemDragEnd(e) {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('#items-body tr').forEach(r => r.style.borderTop = '');
}

// ============================================================
// SALE TRACKER — HELPERS
// ============================================================
const _dsCache = new Map();  // memoize JSON.parse of DealStatus (heavy on big payloads)
function parseDealStatus(raw) {
  const def = { closed: false, notes: [], docs: [], closedAt: null };
  if (!raw) return def;
  let parsed = _dsCache.get(raw);
  if (parsed === undefined) {
    try { parsed = JSON.parse(raw); } catch(e) { parsed = null; }
    _dsCache.set(raw, parsed);
  }
  if (!parsed) return def;
  // return fresh object + cloned arrays so callers can't mutate the cache
  return { ...def, ...parsed,
    notes: [...(parsed.notes || [])],
    docs: [...(parsed.docs || [])],
    techJobs: [...(parsed.techJobs || [])],
    expenses: [...(parsed.expenses || [])] };
}
function serializeDealStatus(obj) { return JSON.stringify(obj); }

// เก็บ DealStatus ใน Settings list (ไม่แก้ quotation item → ไม่ trigger Power Automate ขออนุมัติ)
function getStoredDealStatus(quoteId) {
  try {
    const items = _settingsCache || [];
    const it = items.find(i => i.Title === 'DealStatus_' + quoteId);
    return it && it.Value ? it.Value : '';
  } catch(e) { return ''; }
}
async function putStoredDealStatus(quoteId, value) {
  await putSettingValue('DealStatus_' + quoteId, value);
}

// เก็บค่า key/value ใน Settings list (ไม่สร้างคอลัมน์ใหม่บน Quotations)
function getSettingValue(key) {
  try {
    const it = (_settingsCache || []).find(i => i.Title === key);
    return it && it.Value ? it.Value : '';
  } catch(e) { return ''; }
}
async function putSettingValue(key, value) {
  const items = _settingsCache || await getListItems(CONFIG.lists.settings);
  const ex = items.find(i => i.Title === key);
  if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
  else {
    const c = await createListItem(CONFIG.lists.settings, { Title: key, Value: value });
    if (_settingsCache) _settingsCache.push({ id: c.id, Title: key, Value: value });
  }
}

// ============================================================
// FOLLOW-UP / RENEWAL REMINDER — ตั้งติดตามใบเสนอราคา (เช่น ต่อสัญญา)
// เก็บใน stDealData.followUp = { date, subject, note, emails[], sentAt }
// แจ้งเตือน: ตรวจตอน sync — ถ้าถึงกำหนดและยังไม่ส่ง → ส่งเมลหาผู้เกี่ยวข้อง
// ============================================================
function openFollowUpModal() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const fu = stDealData.followUp || null;
  document.getElementById('fu-date').value = fu?.date || '';
  document.getElementById('fu-subject').value = fu?.subject || 'ครบกำหนดต่อสัญญา';
  document.getElementById('fu-note').value = fu?.note || '';
  document.getElementById('fu-emails').value = (fu?.emails || [q.SaleEmail || currentUser?.email || '']).join(', ');
  document.getElementById('fu-remove-btn').style.display = fu ? '' : 'none';
  const st = document.getElementById('fu-status');
  st.textContent = fu?.sentAt ? '✅ ส่งแจ้งเตือนไปแล้วเมื่อ ' + formatDateTime(fu.sentAt) : (fu ? '⏳ รอถึงกำหนด — ระบบจะส่งเมลอัตโนมัติเมื่อมีคนเปิดแอปหลังถึงวันนัด' : '');
  openModal('followup-modal');
}
function parseFuEmails(raw) {
  return String(raw||'').split(/[,;\n]+/).map(s=>s.trim()).filter(s=>s.includes('@'));
}
async function saveFollowUp() {
  const date = document.getElementById('fu-date').value;
  if (!date) { toast('กรุณาระบุวันที่แจ้งเตือน', 'error'); return; }
  const emails = parseFuEmails(document.getElementById('fu-emails').value);
  if (!emails.length) { toast('กรุณาระบุ Email ผู้เกี่ยวข้องอย่างน้อย 1 คน', 'error'); return; }
  const subject = document.getElementById('fu-subject').value;
  const note = document.getElementById('fu-note').value.trim();
  stDealData.followUp = { date, subject, note, emails, sentAt: null, setBy: currentUser?.displayName||currentUser?.email||'' };
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({ id: Date.now(), user: currentUser?.displayName||'User', text: '🔔 ตั้งการติดตาม ['+subject+'] วันที่ '+date+' → '+emails.join(', '), ts: new Date().toISOString(), type: 'reminder' });
  await saveSTDealData();
  updateFollowUpBtn();
  renderSTTimeline();
  closeModal('followup-modal');
  toast('บันทึกการติดตามแล้ว — จะแจ้งเตือนวันที่ ' + date, 'success');
}
async function removeFollowUp() {
  if (!confirm('ลบการติดตามนี้?')) return;
  delete stDealData.followUp;
  await saveSTDealData();
  updateFollowUpBtn();
  closeModal('followup-modal');
  toast('ลบการติดตามแล้ว', 'success');
}
function updateFollowUpBtn() {
  const btn = document.getElementById('st-followup-btn');
  const label = document.getElementById('st-followup-label');
  if (!btn || !label) return;
  const fu = stDealData.followUp;
  if (fu && fu.date) {
    label.textContent = fu.sentAt ? 'แจ้งแล้ว ' + fu.date : 'ติดตาม ' + fu.date;
    btn.style.borderColor = fu.sentAt ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.45)';
    btn.style.color = fu.sentAt ? 'var(--green)' : 'var(--amber)';
  } else {
    label.textContent = 'ตั้งติดตาม';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}
// ตรวจการติดตามที่ถึงกำหนด — เรียกหลัง sync (ครั้งเดียวต่อ session)
let _fuChecked = false;
async function checkFollowUpsDue() {
  if (_fuChecked || !currentUser) return;
  _fuChecked = true;
  const today = new Date().toISOString().split('T')[0];
  let sent = 0;
  for (const q of quotesData) {
    try {
      const ds = parseDealStatus(q.DealStatus);
      const fu = ds.followUp;
      if (!fu || fu.sentAt || !fu.date || fu.date > today) continue;
      const subject = '[SalePro] 🔔 ' + (fu.subject||'แจ้งเตือนติดตาม') + ' — ' + (q.Title||'') + ' (' + (q.ClientName||'') + ')';
      const body = 'แจ้งเตือนการติดตามใบเสนอราคา\n────────────────────────\n'
        + 'ใบเสนอราคา: ' + (q.Title||'') + '\nลูกค้า: ' + (q.ClientName||'') + '\nมูลค่า: ' + fmt(q.TotalAmount||0)
        + '\nกำหนดติดตาม: ' + fu.date + '\nเรื่อง: ' + (fu.subject||'')
        + (fu.note ? '\nบันทึก: ' + fu.note : '')
        + '\nตั้งโดย: ' + (fu.setBy||'') + '\n────────────────────────\nระบบ SalePro';
      for (const to of (fu.emails||[])) {
        try { await _sendMailGraph(to, subject, body); } catch(e) { console.warn('FU mail to '+to+' failed:', e.message); }
      }
      fu.sentAt = new Date().toISOString();
      ds.notes = ds.notes || [];
      ds.notes.push({ id: Date.now(), user: 'ระบบ', text: '🔔 ส่งแจ้งเตือนติดตาม ['+(fu.subject||'')+'] → '+(fu.emails||[]).join(', '), ts: fu.sentAt, type: 'reminder' });
      const val = serializeDealStatus(ds);
      await putStoredDealStatus(q.id, val);
      q.DealStatus = val;
      sent++;
    } catch(e) { console.warn('checkFollowUpsDue:', e.message); }
  }
  if (sent) toast('🔔 ส่งแจ้งเตือนติดตาม ' + sent + ' รายการแล้ว', 'success');
}

let stQuoteId = null;
let stDealData = { closed: false, notes: [], docs: [], closedAt: null };
let stCurrentSlipFile = null;
let stPendingDocs = [];
let paymentsCache = null; // cache payments ใน memory ลด API calls



function switchSTTab(tab, el) {
  ['timeline','docs','payment','procurement','custpo','tech','expense','expiry'].forEach(t => {
    const panel = document.getElementById('st-tab-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.st-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.style.borderBottomColor = isActive ? 'var(--accent)' : 'transparent';
    btn.style.color = isActive ? 'var(--accent2)' : 'var(--muted)';
  });
  if (tab === 'procurement') initProcurementTab();
  if (tab === 'tech') renderTechJobList();
  if (tab === 'custpo') renderCustPOTab();
  if (tab === 'expense') renderExpenseTab();
  if (tab === 'expiry') renderExpiryTab();
}

// ============================================================
// SALE TRACKER — แจ้งเตือนวันหมดอายุ/ต่ออายุ (อุปกรณ์/License/Warranty) รายสินค้า
// เก็บใน stDealData.expiries = [{id,type,name,serial,startDate,expiryDate,qty,note,emails[],remindDays,remindSentAt,renewed,renewedAt}]
// ============================================================
const EXPIRY_TYPES = ['อุปกรณ์','License','Warranty','สัญญาบริการ','อื่นๆ'];
function _stExpiries() { if (!Array.isArray(stDealData.expiries)) stDealData.expiries = []; return stDealData.expiries; }
// สถานะอายุ: คืน {days, label, color}  (days = เหลือกี่วัน ติดลบ=เลยกำหนด)
function expiryStatus(expiryDate, renewed) {
  if (renewed) return { days: null, label: '✓ ต่ออายุแล้ว', color: 'var(--green)' };
  if (!expiryDate) return { days: null, label: 'ยังไม่กำหนด', color: 'var(--muted)' };
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(expiryDate + 'T00:00:00');
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { days, label: 'หมดอายุแล้ว ' + Math.abs(days) + ' วัน', color: 'var(--red)' };
  if (days === 0) return { days, label: 'หมดอายุวันนี้', color: 'var(--red)' };
  if (days <= 30) return { days, label: 'ใกล้หมด เหลือ ' + days + ' วัน', color: 'var(--amber)' };
  if (days <= 90) return { days, label: 'เหลือ ' + days + ' วัน', color: '#fbbf24' };
  return { days, label: 'เหลือ ' + days + ' วัน', color: 'var(--green)' };
}
function renderExpiryTab() {
  const host = document.getElementById('st-expiry-list'); if (!host) return;
  const list = _stExpiries();
  const isReadOnly = !!stDealData.closed;
  const typeOpts = (cur) => EXPIRY_TYPES.map(t => '<option ' + (cur===t?'selected':'') + '>' + t + '</option>').join('');
  const rows = list.map(function(e) {
    const st = expiryStatus(e.expiryDate, e.renewed);
    return '<div style="border:1px solid var(--border);border-radius:9px;background:var(--surface2);padding:10px 12px;margin-bottom:9px">'
      + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">'
      + '<select onchange="updateExpiry(\'' + e.id + '\',\'type\',this.value)" style="font-size:12px;max-width:130px">' + typeOpts(e.type) + '</select>'
      + '<input value="' + escHtml(e.name||'') + '" oninput="updateExpiry(\'' + e.id + '\',\'name\',this.value)" placeholder="ชื่อสินค้า/รุ่น" style="flex:1;min-width:0;font-size:12px">'
      + '<span style="font-size:11px;color:' + st.color + ';white-space:nowrap;font-weight:600">● ' + st.label + '</span>'
      + '<button onclick="removeExpiry(\'' + e.id + '\')" title="ลบ" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px">✕</button>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<label style="font-size:11px;color:var(--muted)">Serial <input value="' + escHtml(e.serial||'') + '" oninput="updateExpiry(\'' + e.id + '\',\'serial\',this.value)" placeholder="S/N" style="font-size:11px;max-width:120px;margin-left:3px"></label>'
      + '<label style="font-size:11px;color:var(--muted)">จำนวน <input type="number" min="0" value="' + (e.qty!=null?e.qty:'') + '" oninput="updateExpiry(\'' + e.id + '\',\'qty\',this.value)" style="font-size:11px;max-width:60px;margin-left:3px"></label>'
      + '<label style="font-size:11px;color:var(--muted)">วันเริ่ม <input type="date" value="' + (e.startDate||'') + '" onchange="updateExpiry(\'' + e.id + '\',\'startDate\',this.value)" style="font-size:11px;margin-left:3px"></label>'
      + '<label style="font-size:11px;color:var(--text);font-weight:600">หมดอายุ <input type="date" value="' + (e.expiryDate||'') + '" onchange="updateExpiry(\'' + e.id + '\',\'expiryDate\',this.value)" style="font-size:11px;margin-left:3px"></label>'
      + '<span style="font-size:11px;color:var(--muted)">อายุ: <button class="btn btn-sm" onclick="setExpiryDuration(\'' + e.id + '\',1,\'y\')" style="font-size:10px;padding:2px 6px">+1ปี</button><button class="btn btn-sm" onclick="setExpiryDuration(\'' + e.id + '\',3,\'y\')" style="font-size:10px;padding:2px 6px">+3ปี</button><button class="btn btn-sm" onclick="setExpiryDuration(\'' + e.id + '\',5,\'y\')" style="font-size:10px;padding:2px 6px">+5ปี</button> หรือ <input type="number" min="0" placeholder="จำนวน" id="exdur-' + e.id + '" style="font-size:11px;max-width:60px"><select id="exunit-' + e.id + '" style="font-size:11px"><option value="d">วัน</option><option value="m">เดือน</option><option value="y" selected>ปี</option></select><button class="btn btn-sm" onclick="setExpiryDurationInput(\'' + e.id + '\')" style="font-size:10px;padding:2px 6px">คำนวณ</button></span>'
      + '<label style="font-size:11px;color:var(--muted)">เตือนล่วงหน้า <input type="number" min="0" value="' + (e.remindDays!=null?e.remindDays:30) + '" oninput="updateExpiry(\'' + e.id + '\',\'remindDays\',this.value)" style="font-size:11px;max-width:54px;margin-left:3px"> วัน</label>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">'
      + '<label style="font-size:11px;color:var(--muted);flex:1;min-width:160px">แจ้งเตือนถึงอีเมล <input value="' + escHtml((e.emails||[]).join(', ')) + '" oninput="updateExpiryEmails(\'' + e.id + '\',this.value)" placeholder="a@x.com, b@y.com" style="font-size:11px;width:100%;margin-top:2px"></label>'
      + '<input value="' + escHtml(e.note||'') + '" oninput="updateExpiry(\'' + e.id + '\',\'note\',this.value)" placeholder="หมายเหตุ" style="font-size:11px;flex:1;min-width:140px">'
      + (e.renewed
          ? '<button class="btn btn-sm" onclick="updateExpiry(\'' + e.id + '\',\'renewed\',false)" style="font-size:11px">ยกเลิกต่ออายุ</button>'
          : '<button class="btn btn-sm btn-success" onclick="markExpiryRenewed(\'' + e.id + '\')" style="font-size:11px">✓ ต่ออายุแล้ว</button>')
      + '</div></div>';
  }).join('');
  host.innerHTML = (isReadOnly ? '' : '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center"><button class="btn btn-sm btn-primary" onclick="addExpiryRow()">+ เพิ่มรายการ</button><button class="btn btn-sm" onclick="pullExpiryFromQuote()">⟲ ดึงจากใบเสนอราคา</button><button class="btn btn-sm btn-success" style="margin-left:auto" onclick="saveExpiryManual()">💾 บันทึก</button></div>')
    + (rows || '<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">ยังไม่มีรายการติดตามวันหมดอายุ</div>');
}
let _expirySaveT = null;
function _expirySaveSoon() { clearTimeout(_expirySaveT); _expirySaveT = setTimeout(function(){ saveSTDealData(); }, 600); }
function addExpiryRow() { _stExpiries().push({ id: 'ex'+_nextItemId(), type:'License', name:'', serial:'', startDate:'', expiryDate:'', qty:'', note:'', emails:(currentUser&&currentUser.email?[currentUser.email]:[]), remindDays:30, remindSentAt:null, renewed:false }); renderExpiryTab(); saveSTDealData(); }
function removeExpiry(id) { stDealData.expiries = _stExpiries().filter(e => e.id !== id); renderExpiryTab(); saveSTDealData(); }
function updateExpiry(id, field, val) { const e = _stExpiries().find(x => x.id === id); if (!e) return;
  if (field==='qty'||field==='remindDays') val = (val===''?'':+val);
  if (field==='renewed') { e.renewed = !!val; e.renewedAt = val ? new Date().toISOString() : null; if(!val) e.remindSentAt=null;
    if (val && typeof _stTimeline==='function') _stTimeline('♻️ ต่ออายุแล้ว: ' + (e.type||'') + ' ' + (e.name||'') + (e.serial?(' (S/N '+e.serial+')'):'') + (e.expiryDate?(' · เดิมหมด '+e.expiryDate):''), 'reminder');
    renderExpiryTab(); saveSTDealData(); if (typeof renderSTTimeline==='function') renderSTTimeline(); return; }
  if (field==='expiryDate') e.remindSentAt = null;   // เปลี่ยนวันหมดอายุ → เตือนใหม่ได้
  e[field] = val;
  if (field==='type'||field==='expiryDate'||field==='startDate') renderExpiryTab();   // อัปเดตป้ายสถานะ
  _expirySaveSoon();
}
function updateExpiryEmails(id, val) { const e = _stExpiries().find(x => x.id === id); if (!e) return; e.emails = val.split(',').map(s=>s.trim()).filter(Boolean); _expirySaveSoon(); }
// คำนวณวันหมดอายุจาก "อายุ" (นับจากวันเริ่ม ถ้าไม่มีใช้วันนี้)
function _addPeriod(ds, n, unit) { const base = ds ? new Date(ds+'T00:00:00') : new Date(); if (isNaN(base)) return ''; const d = new Date(base); if(unit==='y') d.setFullYear(d.getFullYear()+n); else if(unit==='m') d.setMonth(d.getMonth()+n); else d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function setExpiryDuration(id, n, unit) { const e = _stExpiries().find(x => x.id === id); if (!e) return; e.expiryDate = _addPeriod(e.startDate, +n||0, unit); e.remindSentAt = null; renderExpiryTab(); saveSTDealData(); }
function setExpiryDurationInput(id) { const n = +(document.getElementById('exdur-'+id)?.value||0); const unit = document.getElementById('exunit-'+id)?.value||'y'; if(!n){ toast('ใส่จำนวนก่อน','error'); return; } setExpiryDuration(id, n, unit); }
async function saveExpiryManual() { try { await saveSTDealData(); toast('บันทึกรายการหมดอายุแล้ว ✓', 'success'); } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message, 'error'); } }
function markExpiryRenewed(id) { updateExpiry(id,'renewed',true); }
async function pullExpiryFromQuote() {
  try {
    const items = (typeof getQuoteItemsForST==='function') ? await getQuoteItemsForST() : [];
    const have = new Set(_stExpiries().map(e => (e.name||'').trim().toLowerCase()));
    let n = 0;
    items.forEach(function(it) {
      const nm = (it.Title||it.Description||'').trim(); if (!nm) return;
      if (have.has(nm.toLowerCase())) return;
      _stExpiries().push({ id:'ex'+_nextItemId(), type:'อุปกรณ์', name:nm, serial:'', startDate:'', expiryDate:'', qty:(+it.Quantity||''), note:'', emails:(currentUser&&currentUser.email?[currentUser.email]:[]), remindDays:30, remindSentAt:null, renewed:false }); n++;
    });
    renderExpiryTab(); saveSTDealData();
    toast(n ? ('ดึง '+n+' รายการมาแล้ว — กรอกวันหมดอายุต่อได้เลย') : 'ไม่มีรายการใหม่ให้ดึง', n?'success':'info');
  } catch(e) { toast('ดึงไม่สำเร็จ: '+e.message, 'error'); }
}
// ส่งอีเมลแจ้งเตือนหมดอายุที่ถึงกำหนด (เรียกตอน sync — ล้อ checkFollowUpsDue)
async function checkExpiriesDue() {
  if (_expChecked || !currentUser) return;
  _expChecked = true;
  const today = new Date().toISOString().split('T')[0];
  let sent = 0;
  for (const q of quotesData) {
    try {
      const ds = parseDealStatus(q.DealStatus);
      const exps = Array.isArray(ds.expiries) ? ds.expiries : [];
      let changed = false;
      for (const e of exps) {
        if (e.renewed || e.remindSentAt || !e.expiryDate) continue;
        const remindDate = _addDaysStr(e.expiryDate, -(+e.remindDays||30));
        if (remindDate > today) continue;   // ยังไม่ถึงวันเตือน
        const emails = (e.emails||[]).filter(Boolean);
        if (!emails.length) continue;
        const stx = expiryStatus(e.expiryDate, false);
        const subject = '[SalePro] ⏰ ใกล้หมดอายุ: ' + (e.type||'') + ' ' + (e.name||'') + ' — ' + (q.ClientName||'');
        const body = 'แจ้งเตือนวันหมดอายุ\n────────────────────────\n'
          + 'ประเภท: ' + (e.type||'') + '\nสินค้า/รุ่น: ' + (e.name||'') + (e.serial?('\nSerial: '+e.serial):'')
          + '\nลูกค้า: ' + (q.ClientName||'') + '\nใบเสนอราคา: ' + (q.Title||'')
          + '\nวันหมดอายุ: ' + e.expiryDate + ' (' + stx.label + ')'
          + (e.note?('\nหมายเหตุ: '+e.note):'')
          + '\n────────────────────────\nโปรดติดต่อลูกค้าเพื่อต่ออายุ — ระบบ SalePro';
        for (const to of emails) { try { await _sendMailGraph(to, subject, body); } catch(err) { console.warn('expiry mail '+to+' failed:', err.message); } }
        e.remindSentAt = new Date().toISOString(); changed = true; sent++;
        ds.notes = ds.notes || [];
        ds.notes.push({ id: Date.now(), user: 'ระบบ', text: '⏰ แจ้งเตือนใกล้หมดอายุ: ' + (e.type||'') + ' ' + (e.name||'') + ' (หมด ' + e.expiryDate + ') → ' + emails.join(', '), ts: e.remindSentAt, type: 'reminder' });
      }
      if (changed) { const val = serializeDealStatus(ds); await putStoredDealStatus(q.id, val); q.DealStatus = val; }
    } catch(e) { console.warn('checkExpiriesDue:', e.message); }
  }
  if (sent) toast('⏰ ส่งแจ้งเตือนหมดอายุ ' + sent + ' รายการแล้ว', 'success');
}
function _addDaysStr(ds, n) { if(!ds) return ''; const d=new Date(ds+'T00:00:00'); if(isNaN(d))return''; d.setDate(d.getDate()+(+n||0)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
let _expChecked = false;



// ============================================================
// SALE TRACKER — ค่าใช้จ่าย / งบประมาณ
// ============================================================
const EXP_CAT_COLORS = {
  'เดินทาง':'#4f8ef7','ที่พัก':'#a78bfa','ค่ารับรอง/อาหาร':'#fbbf24',
  'ค่าขนส่ง/ส่งของ':'#34d399','ค่าแรงช่าง/ติดตั้ง':'#f87171',
  'ค่าอุปกรณ์/วัสดุ':'#6ea8fe','อื่นๆ':'#9ca3b5'
};
let expReceiptFile = null;
function onExpReceiptSelect(input) {
  const f = input.files && input.files[0];
  const prev = document.getElementById('exp-receipt-preview');
  if (!f) { expReceiptFile = null; if (prev) { prev.style.display='none'; prev.innerHTML=''; } return; }
  expReceiptFile = f;
  const reader = new FileReader();
  reader.onload = e => {
    prev.style.display = 'block';
    prev.innerHTML = `<img src="${e.target.result}" style="max-height:120px;border-radius:6px;border:1px solid var(--border)">`;
  };
  reader.readAsDataURL(f);
}
async function addExpense() {
  const cat = document.getElementById('exp-cat').value;
  const detail = document.getElementById('exp-detail').value.trim();
  const amount = +document.getElementById('exp-amount').value || 0;
  const date = document.getElementById('exp-date').value || new Date().toISOString().split('T')[0];
  if (amount <= 0) { toast('กรุณาระบุจำนวนเงิน', 'error'); return; }
  if (!expReceiptFile) {
    if (!confirm('ยังไม่ได้แนบรูปใบเสร็จ/สลิป\nแนะนำให้แนบทุกครั้งเพื่อใช้เป็นหลักฐาน\n\nต้องการบันทึกโดยไม่มีรูปหรือไม่?')) return;
  }
  const btn = document.getElementById('exp-save-btn');
  const statusEl = document.getElementById('exp-save-status');
  let receiptUrl = '', receiptName = '', receiptError = '';
  // อัปโหลดรูป (ถ้ามี) — ถ้าล้มเหลวแจ้งเหตุผลชัดเจน
  if (expReceiptFile) {
    try {
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'กำลังอัปโหลดรูป...';
      const b64 = await fileToBase64(expReceiptFile);
      const base64Data = String(b64).split(',')[1] || '';
      const res = await _uploadFileGraph('Expenses', 'EXP_' + (stQuoteId||'') + '_' + Date.now() + '_' + expReceiptFile.name, expReceiptFile.type || 'image/jpeg', base64Data);
      receiptUrl = res.fileUrl || '';
      receiptName = expReceiptFile.name;
      if (!receiptUrl) throw new Error('เซิร์ฟเวอร์ไม่ส่ง URL ของไฟล์กลับมา');
    } catch(e) {
      receiptError = e.message || 'ไม่ทราบสาเหตุ';
      if (statusEl) statusEl.textContent = '';
      if (btn) btn.disabled = false;
      const cont = confirm('⚠ แนบรูปไม่สำเร็จ\n\nเหตุผล: ' + receiptError + '\n\nต้องการบันทึกค่าใช้จ่ายโดยยังไม่มีรูป (แล้วค่อยแนบใหม่ภายหลัง) หรือไม่?');
      if (!cont) { toast('ยกเลิกการบันทึก — แก้ปัญหาการแนบรูปแล้วลองใหม่', 'error'); return; }
    }
  }
  if (btn) btn.disabled = false;
  if (statusEl) statusEl.textContent = '';
  stDealData.expenses = stDealData.expenses || [];
  stDealData.expenses.push({ id: Date.now(), cat, detail, amount, date, by: currentUser?.displayName||currentUser?.email||'', ts: new Date().toISOString(), receiptUrl, receiptName, receiptError });
  // log to timeline
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({ id: Date.now()+1, user: currentUser?.displayName||'User', text: '💰 บันทึกค่าใช้จ่าย ['+cat+'] '+fmt(amount)+(detail?' — '+detail:'')+(receiptUrl?' 🧾':(receiptError?' (แนบรูปไม่สำเร็จ)':'')), ts: new Date().toISOString(), type: 'expense' });
  document.getElementById('exp-detail').value = '';
  document.getElementById('exp-amount').value = '';
  expReceiptFile = null;
  const rf = document.getElementById('exp-receipt'); if (rf) rf.value = '';
  const rp = document.getElementById('exp-receipt-preview'); if (rp) { rp.style.display='none'; rp.innerHTML=''; }
  renderExpenseTab();
  saveSTDealData();
  toast(receiptError ? 'บันทึกแล้ว (ยังไม่มีรูป)' : 'บันทึกค่าใช้จ่ายแล้ว', receiptError ? 'warn' : 'success');
}
function removeExpense(id) {
  stDealData.expenses = (stDealData.expenses||[]).filter(e => e.id !== id);
  renderExpenseTab();
  saveSTDealData();
}
function renderExpenseTab() {
  const q = quotesData.find(x => x.id === stQuoteId) || {};
  if (!document.getElementById('exp-date').value) document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
  // ค่าใช้จ่ายฝั่ง Sale (กรอกในแท็บนี้)
  const saleExps = (stDealData.expenses || []).map(e => ({ ...e, _src:'sale' }));
  // ค่าใช้จ่ายฝั่งช่าง (ดึงจากงานช่างทุกงาน — อ่านอย่างเดียว)
  const techExps = [];
  (stDealData.techJobs || []).forEach(j => {
    (j.expenses || []).forEach(e => {
      techExps.push({ id:e.id, cat:(e.category||'อื่นๆ'), detail:(e.desc||e.description||''), amount:+e.amount||0,
        date:(j.scheduledAt||'').split('T')[0], by:'ช่าง '+(j.techName||''), receiptUrl:e.receiptUrl||'', _src:'tech' });
    });
  });
  const all = saleExps.concat(techExps);
  const saleTotal = saleExps.reduce((a,e) => a + (+e.amount||0), 0);
  const techTotal = techExps.reduce((a,e) => a + (+e.amount||0), 0);
  const total = saleTotal + techTotal;
  const quoteVal = +q.TotalAmount || 0;
  const remain = quoteVal - total;
  const pct = quoteVal > 0 ? (total/quoteVal*100) : 0;
  // summary
  const sum = document.getElementById('exp-summary');
  if (sum) sum.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">มูลค่าใบเสนอราคา</div>
        <div style="font-size:18px;font-weight:600;font-family:var(--mono)">${fmt(quoteVal)}</div>
      </div>
      <div style="background:var(--surface2);border:1px solid rgba(248,113,113,0.3);border-radius:8px;padding:12px 14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">ค่าใช้จ่ายรวม (${pct.toFixed(1)}%)</div>
        <div style="font-size:18px;font-weight:600;font-family:var(--mono);color:var(--red)">${fmt(total)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px">Sale ${fmt(saleTotal)} · ช่าง ${fmt(techTotal)}</div>
      </div>
      <div style="background:var(--surface2);border:1px solid rgba(52,211,153,0.3);border-radius:8px;padding:12px 14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">คงเหลือ (กำไรขั้นต้นโดยประมาณ)</div>
        <div style="font-size:18px;font-weight:600;font-family:var(--mono);color:${remain>=0?'var(--green)':'var(--red)'}">${fmt(remain)}</div>
      </div>
    </div>`;
  // list
  const list = document.getElementById('exp-list');
  if (!list) return;
  if (!all.length) { list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:10px;text-align:center">ยังไม่มีรายการค่าใช้จ่าย</div>'; return; }
  const canManage = canManageSaleActions(q);
  list.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--muted);font-size:11px">
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);font-weight:500">วันที่</th>
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);font-weight:500">ประเภท</th>
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);font-weight:500">รายละเอียด</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:1px solid var(--border);font-weight:500">จำนวนเงิน</th>
      <th style="width:30px;border-bottom:1px solid var(--border)"></th>
    </tr></thead><tbody>
    ${all.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(e => `
      <tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);color:var(--muted);white-space:nowrap">${fmtDate(e.date)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border)"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;background:${(EXP_CAT_COLORS[e.cat]||'#9ca3b5')}22;color:${EXP_CAT_COLORS[e.cat]||'#9ca3b5'}">${escHtml(e.cat||'อื่นๆ')}</span>${e._src==='tech'?'<div style="font-size:9px;color:var(--amber);margin-top:2px">จากงานช่าง</div>':''}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text)">${escHtml(e.detail||'-')}${e.by?`<div style="font-size:10px;color:var(--muted)">โดย ${escHtml(e.by)}</div>`:''}${e.receiptUrl?`<div style="margin-top:3px">${docThumb(e.receiptUrl,'ใบเสร็จ',{small:true})}</div>`:(e._src==='sale'?(e.receiptError?`<div style="margin-top:3px;font-size:10px;color:var(--red)">⚠ แนบรูปไม่สำเร็จ: ${escHtml(e.receiptError)}</div>`:`<div style="margin-top:3px;font-size:10px;color:var(--amber)">⚠ ไม่มีรูปแนบ</div>`):'')}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--mono);color:var(--red)">${fmt(e.amount)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center">${e._src==='tech'?'<span style="font-size:9px;color:var(--muted)" title="บันทึกโดยช่าง — แก้ไขในแท็บช่าง">🔧</span>':'<span style="font-size:11px;color:var(--muted)" title="ค่าใช้จ่ายถูกบันทึกเป็นหลักฐาน ลบไม่ได้">🔒</span>'}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function formatDateTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return fmtDate(d) + ' ' + d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  } catch(e) { return ts; }
}



async function addSaleNote() {
  const input = document.getElementById('st-note-input');
  const text = (input?.value||'').trim();
  if (!text) { toast('กรุณาพิมพ์ note ก่อน','error'); return; }
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({ id:Date.now(), user:currentUser?.displayName||currentUser?.email||'User', text, ts:new Date().toISOString(), type:'note' });
  input.value = '';
  renderSTTimeline();
  await saveSTDealData();
}

function deleteSTNote(id) {
  stDealData.notes = (stDealData.notes||[]).filter(n => n.id !== id);
  renderSTTimeline();
  saveSTDealData();
}

// ---- DOCS ----
function handleSTDocSelect(input) { Array.from(input.files).forEach(f => processSTDoc(f)); input.value=''; }
function handleSTDocDrop(e) { e.preventDefault(); document.getElementById('st-drop-zone').style.borderColor='var(--border2)'; document.getElementById('st-drop-zone').style.background=''; Array.from(e.dataTransfer.files).forEach(f=>processSTDoc(f)); }
function guessSTDocType(name) {
  const n=(name||'').toLowerCase();
  if(n.includes('contract')||n.includes('สัญญา')) return 'สัญญา';
  if(n.includes('po')||n.includes('purchase')) return 'PO';
  if(n.includes('invoice')||n.includes('inv')) return 'Invoice';
  if(n.includes('receipt')||n.includes('ใบเสร็จ')) return 'ใบเสร็จ';
  return 'เอกสารอื่น';
}
function processSTDoc(file) {
  if (file.size>10*1024*1024){toast('ไฟล์ใหญ่เกิน 10MB: '+file.name,'error');return;}
  const d={id:Date.now()+Math.random(),name:file.name,docType:guessSTDocType(file.name),file,url:'',pending:true};
  stPendingDocs.push(d);
  renderPendingDocs();
}
function updatePendingDocType(id, val) {
  const d = stPendingDocs.find(x => x.id === id);
  if (d) { d.docType = val; renderPendingDocs(); }
}

function removePendingDoc(id) {
  stPendingDocs = stPendingDocs.filter(d => d.id !== id);
  renderPendingDocs();
}

function clearPendingDocs() {
  stPendingDocs = [];
  renderPendingDocs();
}

async function confirmSaveDocs() {
  if (!stPendingDocs.length) return;
  const btn = document.querySelector('#st-docs-pending .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }
  toast('กำลังอัปโหลดเอกสาร...', 'info');

  const toUpload = [...stPendingDocs];
  let successCount = 0;

  for (const docEntry of toUpload) {
    try {
      // อัปโหลดขึ้น Google Drive
      const reader = new FileReader();
      const base64Data = await new Promise((res, rej) => {
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(docEntry.file);
      });
      const mimeType = docEntry.file.type || 'application/octet-stream';
      const uploadRes = await apiPost('uploadFile', 'Payments', null, {
        fileName: docEntry.name,
        mimeType: mimeType,
        base64Data: base64Data
      });
      const url = uploadRes.fileUrl || '';
      docEntry.url = url; docEntry.pending = false;
      stDealData.docs = stDealData.docs || [];
      stDealData.docs.push({ id: docEntry.id, name: docEntry.name, docType: docEntry.docType, url, ts: new Date().toISOString() });
      stDealData.notes = stDealData.notes || [];
      stDealData.notes.push({ id: Date.now(), user: currentUser?.displayName||'User', text: 'แนบเอกสาร: ' + docEntry.name + ' [' + docEntry.docType + ']', ts: new Date().toISOString(), type: 'doc' });
      stPendingDocs = stPendingDocs.filter(d => d.id !== docEntry.id);
      successCount++;
    } catch(e) {
      toast('อัปโหลด ' + docEntry.name + ' ไม่สำเร็จ: ' + e.message, 'error');
    }
  }

  if (successCount > 0) {
    await saveSTDealData();
    renderSTDocs();
    renderSTTimeline();
    renderPendingDocs();
    toast('บันทึก ' + successCount + ' เอกสารสำเร็จ', 'success');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> บันทึกเอกสาร'; }
}

async function uploadSTDoc(docEntry) {
  try {
    const reader = new FileReader();
    const base64Data = await new Promise((res, rej) => {
      reader.onload = e => res(e.target.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(docEntry.file);
    });
    const uploadRes = await apiPost('uploadFile', 'Payments', null, {
      fileName: docEntry.name,
      mimeType: docEntry.file.type || 'application/octet-stream',
      base64Data: base64Data
    });
    const url = uploadRes.fileUrl || '';
    docEntry.url=url; docEntry.uploading=false;
    stDealData.docs=stDealData.docs||[];
    stDealData.docs.push({id:docEntry.id,name:docEntry.name,docType:docEntry.docType,url,ts:new Date().toISOString()});
    stDealData.notes=stDealData.notes||[];
    stDealData.notes.push({id:Date.now(),user:currentUser?.displayName||'User',text:'แนบเอกสาร: '+docEntry.name+' ['+docEntry.docType+']',ts:new Date().toISOString(),type:'doc'});
    stPendingDocs=stPendingDocs.filter(d=>d.id!==docEntry.id);
    renderSTDocs(); renderSTTimeline();
    await saveSTDealData();
    toast('อัปโหลด '+docEntry.name+' สำเร็จ','success');
  } catch(e) {
    docEntry.uploading=false; docEntry.url='';
    toast('อัปโหลดไม่สำเร็จ: '+e.message,'error');
    stPendingDocs=stPendingDocs.filter(d=>d.id!==docEntry.id);
    renderSTDocs();
  }
}
function removeSTDoc(id) { stDealData.docs=(stDealData.docs||[]).filter(d=>d.id!==id); renderSTDocs(); saveSTDealData(); }
function updateSTDocType(id,val) { const d=(stDealData.docs||[]).find(x=>x.id===id); if(d){d.docType=val;saveSTDealData();} }


// ---- PAYMENT ----
function renderSTPaySummary(q) {
  const el=document.getElementById('st-pay-summary');
  if(!el||!q) return;
  const paid=q.PaidAmount||0,total=q.TotalAmount||0,rem=total-paid;
  const pct=total>0?Math.min(100,Math.round(paid/total*100)):0;
  el.innerHTML=`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
    <div style="display:flex;gap:20px;font-size:12px;margin-bottom:8px">
      <span>มูลค่ารวม: <strong style="font-family:var(--mono)">${fmt(total)}</strong></span>
      <span>ชำระแล้ว: <strong style="font-family:var(--mono);color:var(--green)">${fmt(paid)}</strong></span>
      <span>คงเหลือ: <strong style="font-family:var(--mono);color:${rem>0?'var(--red)':'var(--green)'}">${fmt(rem)}</strong></span>
    </div>
    <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--green)':pct>0?'var(--amber)':'var(--red)'};border-radius:2px;transition:width 0.4s"></div>
    </div></div>`;
}

async function renderSTPayHistory(q) {
  const el=document.getElementById('st-pay-history');
  if(!el) return;
  try {
    // ใช้ paymentsCache เพื่อลดการเรียก API ซ้ำ
    if (!paymentsCache) paymentsCache = await getListItems(CONFIG.lists.payments);
    const pays=paymentsCache.filter(p=>String(p.QuoteID)===String(stQuoteId));
    if(!pays.length){el.innerHTML='<div style="font-size:12px;color:var(--muted);padding:4px 0 8px">ยังไม่มีประวัติการชำระ</div>';return;}
    el.innerHTML='<div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em">ประวัติการชำระ</div>'+
      pays.map(p=>{ const _isCredit=/ลดหนี้/.test(p.PaymentMethod||''); return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:12px">
        <span style="color:${_isCredit?'var(--amber)':'var(--green)'};font-family:var(--mono)">${_isCredit?'▼ ':''}${fmt(p.AmountPaid||0)}</span>
        <span style="color:var(--muted)">${fmtDate(p.PaymentDate)}</span>
        <span class="badge badge-draft" style="font-size:10px${_isCredit?';background:rgba(251,191,36,0.15);color:var(--amber)':''}">${p.PaymentMethod||''}</span>
        ${(+p.WHTAmount>0)?`<span style="color:var(--amber);font-size:11px" title="ลูกค้าหัก ณ ที่จ่าย ${p.WHTPercent||''}%">หัก ${fmt(p.WHTAmount)}</span>`:''}
        ${p.Reference?`<span style="color:var(--muted);font-size:11px">${escHtml(p.Reference)}</span>`:''}
        ${p.SlipURL && p.SlipURL.startsWith('http')?`<span style="margin-left:auto">${docThumb(p.SlipURL,'สลิปโอนเงิน',{small:true})}</span>`:''}
      </div>`; }).join('');
  } catch(e){el.innerHTML='';}
}

function handleSTSlipSelect(input){if(input.files?.[0])setSTSlip(input.files[0]);}
function handleSTSlipDrop(e){e.preventDefault();const f=e.dataTransfer.files[0];if(f)setSTSlip(f);}
function setSTSlip(file){
  if(file.size>5*1024*1024){toast('ไฟล์ใหญ่เกิน 5MB','error');return;}
  stCurrentSlipFile=file;
  document.getElementById('st-slip-label').textContent='✓ '+file.name;
  document.getElementById('st-slip-drop').style.borderColor='var(--green)';
  if(file.type.startsWith('image/')){
    const r=new FileReader();
    r.onload=e=>{const p=document.getElementById('st-slip-preview');p.style.display='block';p.innerHTML=`<img src="${e.target.result}" style="max-width:100%;max-height:120px;border-radius:6px;border:1px solid var(--border)">`};
    r.readAsDataURL(file);
  }
}
function clearSTSlip(){
  stCurrentSlipFile=null;
  const lbl=document.getElementById('st-slip-label');const prev=document.getElementById('st-slip-preview');const drop=document.getElementById('st-slip-drop');
  if(lbl)lbl.textContent='คลิกหรือลากสลิปมาวาง';
  if(prev){prev.style.display='none';prev.innerHTML='';}
  if(drop)drop.style.borderColor='var(--border2)';
  const fi=document.getElementById('st-slip-file');if(fi)fi.value='';
}

async function saveSTPayment(){
  const amt=+document.getElementById('st-pay-amount').value;
  if(!amt||amt<=0){toast('กรุณาระบุจำนวนเงิน','error');return;}
  const q=quotesData.find(x=>x.id===stQuoteId);if(!q)return;
  try{
    toast('กำลังบันทึก...','info');
    const payRef='PAY-'+Date.now();
    const newPaid=Math.min((q.PaidAmount||0)+amt,q.TotalAmount||0);
    let slipUrl='';
    if(stCurrentSlipFile){
      try{
        toast('กำลังอัปโหลดสลิป...','info');
        const slipReader=new FileReader();
        const slipB64=await new Promise((res,rej)=>{slipReader.onload=e=>res(e.target.result.split(',')[1]);slipReader.onerror=rej;slipReader.readAsDataURL(stCurrentSlipFile);});
        const slipRes=await apiPost('uploadFile','Payments',null,{fileName:'SLIP_'+payRef+'_'+stCurrentSlipFile.name,mimeType:stCurrentSlipFile.type||'image/jpeg',base64Data:slipB64});
        slipUrl=slipRes.fileUrl||'';
      }catch(e2){toast('อัปโหลดสลิปไม่สำเร็จ: '+e2.message,'error');}
    }
    const whtPct=+document.getElementById('st-pay-wht')?.value||0;
    const whtAmt=+(amt*whtPct/100).toFixed(2);
    await createListItem(CONFIG.lists.payments,{Title:payRef,QuoteID:stQuoteId,AmountPaid:amt,PaymentDate:document.getElementById('st-pay-date').value,PaymentMethod:document.getElementById('st-pay-method').value,Reference:document.getElementById('st-pay-ref').value,Note:document.getElementById('st-pay-note').value,SlipURL:slipUrl,WHTPercent:whtPct,WHTAmount:whtAmt});
    const isNowFullyPaid = newPaid >= (q.TotalAmount||0) && (q.TotalAmount||0) > 0;
    const statusUpdate = isNowFullyPaid ? { PaidAmount: newPaid, Status: 'Closed' } : { PaidAmount: newPaid };
    await updateListItem(CONFIG.lists.quotations,stQuoteId,statusUpdate);
    if (isNowFullyPaid) {
      q.Status = 'Closed';
      renderQuotes();
      // แจ้ง Approver ว่าชำระเงินครบแล้ว
      sendPaymentCompleteEmail(q, newPaid).catch(function(e) { console.warn('Payment email failed:', e.message); });
    }
    stDealData.notes=stDealData.notes||[];
    stDealData.notes.push({id:Date.now(),user:currentUser?.displayName||'User',text:`บันทึกชำระ ${fmt(amt)} (${document.getElementById('st-pay-method').value})${isNowFullyPaid?' — ชำระครบแล้ว ✓ Closed':''}`,ts:new Date().toISOString(),type:'payment'});
    await saveSTDealData();
    // อัปเดต paymentsCache ใน memory แทนการ syncAll ทั้งก้อน
    if (paymentsCache) paymentsCache.push({QuoteID:stQuoteId,AmountPaid:amt,PaymentDate:document.getElementById('st-pay-date').value,PaymentMethod:document.getElementById('st-pay-method').value,Reference:document.getElementById('st-pay-ref').value,Note:document.getElementById('st-pay-note').value,SlipURL:slipUrl,Title:payRef});
    // อัปเดต quotesData ใน memory
    const qLocal=quotesData.find(x=>x.id===stQuoteId);
    if(qLocal){qLocal.PaidAmount=newPaid;if(isNowFullyPaid)qLocal.Status='Closed';}
    clearSTSlip();
    ['st-pay-amount','st-pay-ref','st-pay-note','st-pay-wht'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    renderWHTHint();
    const qU=quotesData.find(x=>x.id===stQuoteId);
    if(qU){
      renderSTPaySummary(qU);
      renderSTPayHistory(qU);
      // อัปเดต badge ถ้าชำระครบ
      const badge2 = document.getElementById('st-status-badge');
      const _paid2 = (qU.PaidAmount||0) >= (qU.TotalAmount||1) && (qU.TotalAmount||0) > 0;
      if (badge2 && _paid2 && !stDealData.closed && qU.Status !== 'Closed') {
        badge2.innerHTML = '<button class="btn btn-sm btn-success" onclick="confirmCloseDeal()" style="font-size:11px;padding:4px 10px">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>' +
          'ปิดการขาย</button>';
      }
    }
    renderSTTimeline();
    toast('บันทึกการชำระสำเร็จ','success');
  }catch(e){toast('ไม่สำเร็จ: '+e.message,'error');}
}

// ---- PROCUREMENT ----
let poRecipients=[];let poItems=[];

function initProcurementTab(){
  const q=quotesData.find(x=>x.id===stQuoteId);if(!q)return;
  const _v=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val;};
  const req=new Date();req.setDate(req.getDate()+7);
  _v('po-required-date',req.toISOString().split('T')[0]);
  _v('po-budget',q.TotalAmount||'');_v('po-vendor','');_v('po-costcenter','');_v('po-note','');
  try{const s=AppStorage.getItem('po_recipients_'+(currentUser?.email||''));poRecipients=s?JSON.parse(s):[];}catch(e){poRecipients=[];}
  if(!poRecipients.length)poRecipients=[{id:Date.now(),email:''}];
  renderPORecipients();
  renderPOItemsPreview();
  loadPOItems();
}
function addPORecipient(email=''){poRecipients.push({id:Date.now(),email});renderPORecipients();}
function removePORecipient(id){if(poRecipients.length<=1){toast('ต้องมีอย่างน้อย 1 Email','error');return;}poRecipients=poRecipients.filter(r=>r.id!==id);renderPORecipients();}
function updatePORecipient(id,val){const r=poRecipients.find(x=>x.id===id);if(r)r.email=val;}
function renderPORecipients(){
  const list=document.getElementById('po-recipients-list');if(!list)return;
  list.innerHTML=poRecipients.map((r,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <span style="font-size:11px;color:var(--muted);width:18px;text-align:right;flex-shrink:0">${i+1}.</span>
    <input type="email" value="${escHtml(r.email)}" placeholder="purchasing@company.com" oninput="updatePORecipient(${r.id},this.value)"
      style="flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--text);font-family:var(--font);outline:none">
    <button class="action-btn" onclick="removePORecipient(${r.id})" style="color:var(--red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
  </div>`).join('');
}
async function loadPOItems(){try{const all=await getListItems(CONFIG.lists.quoteItems);poItems=all.filter(i=>String(i.QuoteID)===String(stQuoteId) && !isMarkerItem(i));}catch(e){poItems=[];}renderPOItemsPreview();}
function renderPOItemsPreview(){
  const el=document.getElementById('po-items-preview');if(!el)return;
  if(!poItems.length){el.innerHTML='<div style="font-size:12px;color:var(--muted);padding:4px">กำลังโหลดรายการ...</div>';return;}
  el.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:rgba(255,255,255,0.03)"><th style="padding:6px 8px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">#</th><th style="padding:6px 8px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">รายการ</th><th style="padding:6px 8px;text-align:center;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">จำนวน</th><th style="padding:6px 8px;text-align:center;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">หน่วย</th><th style="padding:6px 8px;text-align:right;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">ราคา/หน่วย</th><th style="padding:6px 8px;text-align:right;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">รวม</th></tr></thead><tbody>${poItems.map((it,i)=>`<tr style="${i%2===0?'':'background:rgba(255,255,255,0.015)'}"><td style="padding:5px 8px;color:var(--muted);border-bottom:1px solid var(--border)">${i+1}</td><td style="padding:5px 8px;border-bottom:1px solid var(--border)"><div style="font-weight:500;color:var(--text)">${escHtml(it.Title||'-')}</div>${it.Description?`<div style="font-size:10px;color:var(--muted);margin-top:2px;white-space:pre-line;line-height:1.5">${escHtml(it.Description)}</div>`:''}</td><td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border);color:var(--text)">${it.Quantity||1}</td><td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border);color:var(--muted)">${it.Unit||''}</td><td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px;color:var(--text)">${fmt(it.UnitPrice||0)}</td><td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px;color:var(--accent2);font-weight:500">${fmt((it.Quantity||1)*(it.UnitPrice||0)*(1-(it.DiscountPct||0)/100))}</td></tr>`).join('')}</tbody></table>`;
}

function previewPOEmail() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const recipients = poRecipients.map(r => r.email).filter(Boolean).join(', ');
  const itemsText = poItems.map((it, i) =>
    (i+1) + '. ' + (it.Title||'-') + ' | ' + (it.Quantity||1) + ' ' + (it.Unit||'') + ' | ' + fmt(it.UnitPrice||0) + '/หน่วย | รวม ' + fmt((it.Quantity||1)*(it.UnitPrice||0)*(1-(it.DiscountPct||0)/100))
  ).join('\n');
  const note = document.getElementById('po-note')?.value || '';
  const reqDate = document.getElementById('po-required-date')?.value || '';
  const vendor = document.getElementById('po-vendor')?.value || '';
  const lines = [
    'ถึง: ' + (recipients || '(ยังไม่ได้ระบุ)'),
    'หัวข้อ: [จัดซื้อ] ' + (q.Title||'') + ' — ' + (q.ClientName||''),
    '─────────────────────────────────',
    'ใบเสนอราคา: ' + (q.Title||''),
    'ลูกค้า: ' + (q.ClientName||''),
    'มูลค่า: ' + fmt(q.TotalAmount||0),
    'ต้องการของภายใน: ' + reqDate,
    vendor ? 'Vendor: ' + vendor : '',
    '',
    'รายการ:',
    itemsText || '(กำลังโหลด...)',
    note ? '\nหมายเหตุ: ' + note : ''
  ];
  alert(lines.filter(Boolean).join('\n'));
}
function buildPOEmailHTMLBase(q,payload){
  const itemRows=payload.items.map((it,i)=>'<tr style="background:'+(i%2===0?'#fff':'#f8fafc')+'">'+'<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#555">'+(i+1)+'</td><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-weight:500;color:#1a1a2e">'+(it.name||'-')+'</td><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#1a1a2e">'+(it.qty||1)+'</td><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#555">'+(it.unit||'')+'</td><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;color:#1a1a2e">'+fmt(it.unitPrice||0)+'</td><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;font-weight:700;color:#1a3a5c">'+fmt(it.lineTotal||0)+'</td></tr>').join('');
  return '<div style="font-family:Segoe UI,sans-serif;max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">'+'<div style="background:#1a3a5c;padding:20px 28px"><div style="color:#fff;font-size:18px;font-weight:700">📦 คำขอจัดซื้อ</div><div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px">Purchase Request — '+(q.Title||'')+'</div></div>'+'<div style="padding:20px 28px;background:#f8fafc;display:grid;grid-template-columns:1fr 1fr;gap:12px">'+'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">ใบเสนอราคา</div><div style="font-size:13px;color:#1a3a5c;font-weight:700">'+(q.Title||'')+'</div></div>'+'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">ลูกค้า</div><div style="font-size:13px;color:#1a1a2e">'+(q.ClientName||'')+'</div></div>'+'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">มูลค่ารวม</div><div style="font-size:13px;color:#1a3a5c;font-weight:700">'+fmt(q.TotalAmount||0)+'</div></div>'+'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">ต้องการของภายใน</div><div style="font-size:13px;color:#e74c3c;font-weight:700">'+(payload.requiredDate||'')+'</div></div>'+'</div>'+'<div style="padding:20px 28px"><div style="font-size:13px;font-weight:600;color:#1a3a5c;margin-bottom:10px;border-bottom:2px solid #1a3a5c;padding-bottom:6px">รายการสินค้า</div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#1a3a5c;color:#fff"><th style="padding:8px 10px;text-align:left">#</th><th style="padding:8px 10px;text-align:left">รายการ</th><th style="padding:8px 10px;text-align:center">จำนวน</th><th style="padding:8px 10px;text-align:center">หน่วย</th><th style="padding:8px 10px;text-align:right">ราคา/หน่วย</th><th style="padding:8px 10px;text-align:right">รวม</th></tr></thead><tbody>'+itemRows+'</tbody></table></div>'+(payload.notes?'<div style="padding:0 28px 16px"><div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;color:#555"><strong>📝 หมายเหตุ:</strong> '+payload.notes+'</div></div>':'')+'<div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e5e7eb"><div style="font-size:11px;color:#888">ส่งโดย: <strong>'+(payload.triggeredBy||'')+'</strong> · ระบบ SalePro</div></div></div>';
}

async function sendPORequest(){
  const q=quotesData.find(x=>x.id===stQuoteId);if(!q)return;
  const valid=poRecipients.map(r=>r.email.trim()).filter(e=>e&&e.includes('@'));
  if(!valid.length){toast('กรุณาระบุ Email ฝ่ายจัดซื้ออย่างน้อย 1 คน','error');return;}
  const reqDate=document.getElementById('po-required-date')?.value;
  if(!reqDate){toast('กรุณาระบุวันที่ต้องการของ','error');return;}
  try{AppStorage.setItem('po_recipients_'+(currentUser?.email||''),JSON.stringify(poRecipients));}catch(e){}
  try{
    toast('กำลังส่ง Email...','info');
    const vendor=document.getElementById('po-vendor')?.value||'';
    const costCenter=document.getElementById('po-costcenter')?.value||'';
    const notes=document.getElementById('po-note')?.value||'';
    const itemsText=poItems.map((it,i)=>(i+1)+'. '+(it.Title||'-')+' | '+(it.Quantity||1)+' '+(it.Unit||'')+' | '+fmt(it.UnitPrice||0)+'/หน่วย | รวม '+fmt((it.Quantity||1)*(it.UnitPrice||0)*(1-(it.DiscountPct||0)/100))).join('\n');
    const subject=encodeURIComponent('[จัดซื้อ] '+(q.Title||'')+' — '+(q.ClientName||''));
    const body=encodeURIComponent(
      'คำขอจัดซื้อ\n'+'─────────────────────────────────\n'+
      'ใบเสนอราคา: '+(q.Title||'')+'\n'+
      'ลูกค้า: '+(q.ClientName||'')+'\n'+
      'มูลค่ารวม: '+fmt(q.TotalAmount||0)+'\n'+
      'ต้องการของภายใน: '+reqDate+'\n'+
      (vendor?'Vendor: '+vendor+'\n':'')+
      (costCenter?'Cost Center: '+costCenter+'\n':'')+
      '\nรายการสินค้า:\n'+itemsText+
      (notes?'\n\nหมายเหตุ: '+notes:'')+
      '\n\n─────────────────────────────────\n'+
      'ส่งโดย: '+(currentUser?.displayName||'')+' | SalePro System'
    );
    await apiPost('sendEmail', '_', null, {to:valid.join(','),subject:decodeURIComponent(subject),body:decodeURIComponent(body)});
    stDealData.notes=stDealData.notes||[];
    stDealData.notes.push({id:Date.now(),user:currentUser?.displayName||'User',text:'📦 ส่งคำขอจัดซื้อแล้ว → '+valid.join(', ')+'\nต้องการของภายใน: '+reqDate,ts:new Date().toISOString(),type:'procurement'});
    await saveSTDealData();
    try{
      await updateListItem(CONFIG.lists.quotations,stQuoteId,{ProcurementEmails:valid.join('\n')});
      const lq=quotesData.find(x=>x.id===stQuoteId);
      if(lq)lq.ProcurementEmails=valid.join('\n');
    }catch(e2){console.warn('ProcurementEmails save failed:',e2.message);}
    switchSTTab('timeline',document.querySelector('.st-tab[data-tab="timeline"]'));
    renderSTTimeline();
    toast('ส่ง Email คำขอจัดซื้อแล้ว','success');
  }catch(e){toast('ส่ง Email ไม่สำเร็จ: '+e.message,'error');}
}
// ---- CLOSE DEAL ----


async function saveSTDealData(throwOnError){
  try{
    _quietWrite=true;   // auto-save หน้าติดตาม = เงียบ ไม่เด้ง save bar
    const toSave={...stDealData,
      docs:(stDealData.docs||[]).map(d=>({id:d.id,name:d.name,docType:d.docType,url:d.url,ts:d.ts})),
      custPOs:(stDealData.custPOs||[]).map(p=>({id:p.id,poNumber:p.poNumber,poDate:p.poDate,note:p.note,fileName:p.fileName,fileUrl:p.fileUrl||'',savedBy:p.savedBy,ts:p.ts}))
    };
    const val=serializeDealStatus(toSave);
    await putStoredDealStatus(stQuoteId, val);   // เก็บใน Settings list — ไม่แตะ quotation item
    const q=quotesData.find(x=>x.id===stQuoteId);if(q)q.DealStatus=val;
  }catch(e){toast('บันทึก DealStatus ไม่สำเร็จ: '+e.message,'error');if(throwOnError)throw e;}
  finally{ _quietWrite=false; }
}

// ============================================================
// SALE TRACKER — VISIBILITY CONTROL (ข้อ 1 & 2)
// ============================================================
function canManageSaleActions(q) {
  // Admin เห็นทุกอย่าง, Sale เจ้าของใบเห็น, Approver ไม่เห็น
  if (!currentUser || !q) return false;
  if (userRoles.isAdmin) return true;
  const myEmail = (currentUser.email||'').toLowerCase();
  const saleEmail = (q.SaleEmail||'').toLowerCase();
  return saleEmail === myEmail;
}

function applyTrackerVisibility(q) {
  const canManage = canManageSaleActions(q);
  const isClosed = stDealData.closed;
  const isPaid = (q.PaidAmount||0) >= (q.TotalAmount||1) && (q.TotalAmount||0) > 0;

  const isCancelled = q.Status === 'Cancelled';
  const isStatusClosed = q.Status === 'Closed';

  // Tab payment & procurement — ซ่อนถ้า Cancelled/Closed หรือปิดงานแล้ว
  const payBtn = document.getElementById('st-tab-btn-payment');
  const procBtn = document.getElementById('st-tab-btn-procurement');
  const custpoBtn = document.getElementById('st-tab-btn-custpo');
  // Payment tab — Approver/Admin เห็นได้เสมอ (ดูประวัติชำระ/ใบเสร็จ), Sales เห็นเมื่อไม่ Cancelled
  const canSeePayment = userRoles.isApprover || userRoles.isAdmin || (canManage && !isCancelled);
  if (payBtn) payBtn.style.display = canSeePayment ? '' : 'none';
  // Procurement tab — ซ่อนเมื่อ Closed หรือ Cancelled หรือ Approver
  if (procBtn) procBtn.style.display = canManage && !isClosed && !isCancelled && !isStatusClosed ? '' : 'none';
  if (custpoBtn) custpoBtn.style.display = ''; // แสดงเสมอ
  const techBtn = document.getElementById('st-tab-btn-tech');
  if (techBtn) techBtn.style.display = isCancelled ? 'none' : '';
  // Expense tab — เฉพาะ Sale เจ้าของ/Admin (ค่าใช้จ่ายภายใน), ไม่ให้ Approver เห็น
  const expBtn = document.getElementById('st-tab-btn-expense');
  if (expBtn) expBtn.style.display = canManage ? '' : 'none';

  // ปุ่มปิดการขาย — ซ่อนถ้า Cancelled
  const closeBtn = document.getElementById('st-close-deal-btn');
  if (closeBtn) {
    closeBtn.style.display = 'none'; // ปุ่มปิดการขายย้ายไปอยู่ใน st-status-badge แล้ว
  }

  // ซ่อนฟอร์มบันทึกชำระใหม่เมื่อ Closed — ยังดูประวัติ/ใบเสร็จได้
  const paySubmitBtn = document.getElementById('st-pay-submit-btn');
  const payFormCard = document.querySelector('#st-tab-payment > div:last-child');
  // Approver (ที่ไม่ใช่ Admin) ดูได้อย่างเดียว, Admin/Sales ยังบันทึกได้
  const isPayReadOnly = isStatusClosed || isClosed || isCancelled || (userRoles.isApprover && !userRoles.isAdmin && !canManage);
  if (paySubmitBtn) paySubmitBtn.style.display = isPayReadOnly ? 'none' : '';
  if (payFormCard) payFormCard.style.display = isPayReadOnly ? 'none' : '';

  // ปุ่ม Add Note — ยังใช้ได้แม้ Cancelled
  // ปุ่มบันทึก Doc — ยังใช้ได้แม้ Cancelled (เพิ่มได้ ลบไม่ได้)

  // ถ้า tab payment/procurement ซ่อน → switch กลับ timeline
  if (!canManage || isClosed) {
    const activeTab = document.querySelector('.st-tab.active') || document.querySelector('.st-tab[data-tab="timeline"]');
    if (activeTab && (activeTab.dataset.tab === 'payment' || activeTab.dataset.tab === 'procurement')) {
      switchSTTab('timeline', document.querySelector('.st-tab[data-tab="timeline"]'));
    }
  }

  // ข้อ 2: ถ้าปิดการขายแล้ว — ซ่อนปุ่มลบ Note และ ลบ Doc
  // (จัดการใน renderSTTimeline และ renderSTDocs โดยส่ง isClosed ไปด้วย)
}

// ════════════════════════════════════════════
// CUSTOMER PO TAB
// ════════════════════════════════════════════
let cpoPendingFile = null;

function handleCPOFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  processCPOFile(file);
}
function handleCPODrop(e) {
  e.preventDefault();
  document.getElementById('cpo-drop-zone').style.borderColor = 'var(--border2)';
  const file = e.dataTransfer.files[0];
  if (file) processCPOFile(file);
}
function processCPOFile(file) {
  if (file.size > 2 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 2MB', 'error'); return; }
  var reader = new FileReader();
  reader.onload = function(ev) {
    cpoPendingFile = { name: file.name, dataUrl: ev.target.result, size: file.size };
    document.getElementById('cpo-file-name').textContent = file.name + ' (' + (file.size/1024).toFixed(0) + ' KB)';
    document.getElementById('cpo-file-preview').style.display = 'flex';
    document.getElementById('cpo-drop-label').textContent = '✅ ' + file.name;
  };
  reader.readAsDataURL(file);
}
function clearCPOFile() {
  cpoPendingFile = null;
  document.getElementById('cpo-file-preview').style.display = 'none';
  document.getElementById('cpo-drop-label').textContent = '📎 คลิกหรือลากไฟล์ PO มาวาง (PDF, รูป, Word — สูงสุด 2MB)';
}

async function saveCustPO() {
  var num  = (document.getElementById('cpo-number').value || '').trim();
  var date = document.getElementById('cpo-date').value || '';
  var note = (document.getElementById('cpo-note').value || '').trim();
  if (!num) { toast('กรุณาใส่เลข PO', 'error'); return; }

  // อัปโหลดไฟล์ขึ้น Google Drive ก่อน (ถ้ามี)
  var driveFileUrl = '';
  var driveFileName = '';
  if (cpoPendingFile) {
    driveFileName = cpoPendingFile.name;
    try {
      toast('กำลังอัปโหลด ' + cpoPendingFile.name + ' ไปยัง SharePoint...', 'info');
      var base64Data = cpoPendingFile.dataUrl.split(',')[1];
      var mimeType = cpoPendingFile.dataUrl.split(';')[0].split(':')[1];
      var uploadRes = await apiPost('uploadFile', 'Payments', null, {
        fileName: cpoPendingFile.name,
        mimeType: mimeType,
        base64Data: base64Data
      });
      driveFileUrl = uploadRes.fileUrl || '';
      driveFileName = uploadRes.fileName || cpoPendingFile.name;
    } catch(uploadErr) {
      toast('อัปโหลดไฟล์ไม่สำเร็จ: ' + uploadErr.message, 'error');
    }
  }

  var entry = {
    id: Date.now(),
    poNumber: num,
    poDate: date,
    note: note,
    fileName: driveFileName,
    fileUrl: driveFileUrl,
    savedBy: (currentUser && (currentUser.displayName || currentUser.email)) || 'User',
    ts: new Date().toISOString()
  };
  stDealData.custPOs = stDealData.custPOs || [];
  stDealData.custPOs.unshift(entry);
  stDealData.notes = stDealData.notes || [];
  var timelineText = '📋 รับ PO ลูกค้า: ' + num;
  if (date) timelineText += ' (วันที่ ' + date + ')';
  if (note) timelineText += ' — ' + note;
  if (entry.fileName) timelineText += ' 📎 ' + entry.fileName;
  stDealData.notes.push({
    id: Date.now() + 1,
    user: (currentUser && (currentUser.displayName || currentUser.email)) || 'User',
    text: timelineText,
    ts: new Date().toISOString(),
    type: 'custpo'
  });
  document.getElementById('cpo-number').value = '';
  document.getElementById('cpo-date').value = '';
  document.getElementById('cpo-note').value = '';
  clearCPOFile();
  renderCustPOTab();
  renderTechJobList();
  renderSTTimeline();
  try {
    var toSave = Object.assign({}, stDealData, {
      docs: (stDealData.docs || []).map(function(d) { return {id:d.id,name:d.name,docType:d.docType,url:d.url,ts:d.ts}; }),
      custPOs: (stDealData.custPOs || []).map(function(p) { return {id:p.id,poNumber:p.poNumber,poDate:p.poDate,note:p.note,fileName:p.fileName,fileUrl:p.fileUrl||'',savedBy:p.savedBy,ts:p.ts}; })
    });
    await putStoredDealStatus(stQuoteId, serializeDealStatus(toSave));   // DealStatus → Settings list
    // อัปเดตสถานะใบเสนอราคาเป็น PO Received (status เปลี่ยนจริง — ตั้งใจให้ trigger)
    await updateListItem(CONFIG.lists.quotations, stQuoteId, { Status: 'PO Received' });
    var q = quotesData.find(function(x) { return x.id === stQuoteId; });
    if (q) {
      q.Status = 'PO Received';
      q.DealStatus = serializeDealStatus(toSave);
    }
    // อัปเดต badge สถานะใน modal
    var stBadge = document.getElementById('st-status-badge');
    if (stBadge) stBadge.innerHTML = '<span class="badge badge-poreceived" style="font-size:10px">📋 PO Received</span>';
    toast('บันทึก PO สำเร็จ — สถานะเปลี่ยนเป็น PO Received ✅', 'success');
    renderQuotes();
    // แจ้ง Approver ว่าได้รับ PO ลูกค้าแล้ว
    var qPO = quotesData.find(function(x) { return x.id === stQuoteId; });
    if (qPO) sendPOReceivedEmail(qPO, num).catch(function(e) { console.warn('PO email failed:', e.message); });
  } catch(err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  }
}

function deleteCustPO(id) {
  if (!confirm('ลบ PO นี้?')) return;
  stDealData.custPOs = (stDealData.custPOs || []).filter(function(p) { return p.id !== id; });
  renderCustPOTab();
  saveSTDealData();
  toast('ลบ PO แล้ว', 'success');
}
function renderCustPOTab() {
  const list = document.getElementById('cpo-list');
  if (!list) return;
  const pos = stDealData.custPOs || [];
  const currentQ = quotesData.find(function(x) { return x.id === stQuoteId; });
  const isReadOnly = stDealData.closed || (currentQ && (currentQ.Status === 'Closed' || currentQ.Status === 'Cancelled'));
  const waiver = stDealData.poWaiver || null;
  const waiverApproved = !!(waiver && waiver.status === 'approved');
  const waiverPending = !!(waiver && waiver.status === 'pending');
  const poOk = pos.length > 0 || waiverApproved;
  const canApprove = !!(userRoles.isApprover || userRoles.isAdmin);
  const canManage = currentQ ? canManageSaleActions(currentQ) : false;
  var cpoForm = document.querySelector('#st-tab-custpo > div:first-child');
  if (cpoForm) cpoForm.style.display = (isReadOnly || pos.length > 0 || waiver) ? 'none' : '';
  var printSec = document.getElementById('cpo-print-section');
  if (printSec) printSec.style.display = poOk ? 'block' : 'none';
  // คืนสถานะโหมด Manual (กรอกรายการเอง)
  if (poOk) {
    var _dm = stDealData.docManual || {};
    var _tg = document.getElementById('cpo-manual-toggle');
    var _box = document.getElementById('cpo-manual-box');
    if (_tg) _tg.checked = !!_dm.on;
    if (_box) _box.style.display = _dm.on ? '' : 'none';
    renderDocManualRows();
    // คืนค่าข้อความเหนือ E.&O.E. (ต่อชนิดเอกสาร)
    var _rn = stDealData.docReferNote || {};
    var _rt = document.getElementById('cpo-refnote-tax'); if (_rt) _rt.value = _rn.tax || '';
    var _rr = document.getElementById('cpo-refnote-receipt'); if (_rr) _rr.value = _rn.receipt || '';
  }

  // ── การ์ดสถานะ "ขอข้ามการรับ PO" ──
  var waiverCard = '';
  if (waiverPending) {
    waiverCard = '<div style="padding:12px 14px;border:1px solid var(--amber);background:rgba(245,158,11,0.08);border-radius:8px;margin-bottom:10px">'
      + '<div style="font-size:12px;font-weight:600;color:var(--amber)">⏳ ขอข้ามการรับ PO — รอการอนุมัติ</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:4px">ผู้ขอ: ' + escHtml(waiver.by||'') + (waiver.at?' · '+fmtDate(waiver.at.split('T')[0]):'') + '</div>'
      + (waiver.reason ? '<div style="font-size:12px;color:var(--text);margin-top:4px">เหตุผล: ' + escHtml(waiver.reason) + '</div>' : '')
      + '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
      + (canApprove ? '<button class="btn btn-sm btn-primary" onclick="approvePOWaiver()" style="font-size:11px">✓ อนุมัติให้ข้าม PO</button><button class="btn btn-sm" onclick="rejectPOWaiver()" style="font-size:11px;border:1px solid var(--red);color:var(--red)">✕ ปฏิเสธ</button>' : '')
      + (canManage && !canApprove ? '<button class="btn btn-sm" onclick="cancelPOWaiver()" style="font-size:11px;border:1px solid var(--border2);color:var(--muted)">ยกเลิกคำขอ</button>' : '')
      + '</div></div>';
  } else if (waiverApproved) {
    waiverCard = '<div style="padding:12px 14px;border:1px solid var(--green);background:rgba(34,197,94,0.08);border-radius:8px;margin-bottom:10px">'
      + '<div style="font-size:12px;font-weight:600;color:var(--green)">✅ ข้ามการรับ PO — อนุมัติแล้ว (ออกเอกสารได้)</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:4px">อนุมัติโดย: ' + escHtml(waiver.approvedBy||'') + (waiver.approvedAt?' · '+fmtDate(waiver.approvedAt.split('T')[0]):'') + '</div>'
      + (waiver.reason ? '<div style="font-size:12px;color:var(--text);margin-top:4px">เหตุผล: ' + escHtml(waiver.reason) + '</div>' : '')
      + '</div>';
  }

  if (!pos.length) {
    var noPoBtn = (!isReadOnly && !waiver && canManage)
      ? '<div style="text-align:center;margin-top:6px"><button class="btn btn-sm" onclick="requestPOWaiver()" style="font-size:11px;border:1px dashed var(--amber);background:none;color:var(--amber)">ไม่มี PO ลูกค้า? — ขอข้ามกระบวนการ (ต้องขออนุมัติ)</button></div>'
      : '';
    list.innerHTML = waiverCard
      + (waiverApproved ? '' : '<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px">ยังไม่มี PO ที่บันทึก</div>')
      + noPoBtn;
    return;
  }
  const rows = pos.map(function(p) {
    const dateStr = p.poDate
      ? fmtDate(p.poDate)
      : '';
    const fileHtml = p.fileName
      ? '<div style="margin-top:6px">' + (
          p.fileUrl
            ? docThumb(p.fileUrl, p.fileName, {small:true})
            : '<span style="font-size:11px;color:var(--muted);display:inline-flex;align-items:center;gap:4px">📎 ' + escHtml(p.fileName) + '</span>'
        ) + '</div>'
      : '';
    return '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--surface2)">'
      + '<div style="display:flex;align-items:flex-start;gap:8px">'
      + '<div style="font-size:18px;line-height:1;margin-top:2px">📋</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="font-size:13px;font-weight:600;color:var(--text);font-family:monospace">' + escHtml(p.poNumber) + '</span>'
      + (dateStr ? '<span style="font-size:11px;color:var(--muted)">' + dateStr + '</span>' : '')
      + '<span style="margin-left:auto;font-size:10px;color:var(--muted)">' + (p.savedBy||'') + '</span>'
      + '</div>'
      + (p.note ? '<div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5">' + escHtml(p.note) + '</div>' : '')
      + fileHtml
      + '</div>'
      + (!isReadOnly ? '<button onclick="deleteCustPO(' + p.id + ')" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:2px 4px;font-size:14px;line-height:1" title="ลบ">✕</button>' : '')
      + '</div>'
      + '</div>';
  });
  var addBtn = !isReadOnly
    ? '<div style="margin-top:8px"><button class="btn btn-sm" onclick="document.querySelector(\'#st-tab-custpo>div:first-child\').style.display=\'\'" style="font-size:11px;border:1px dashed var(--border2);background:none;color:var(--muted)">+ เพิ่ม PO</button></div>'
    : '';
  list.innerHTML = waiverCard + rows.join('') + addBtn;
}

// ── ข้อความ manual เหนือ "ผิด ตก ยกเว้น" (แยกต่อชนิดเอกสาร: tax / receipt / ...) ──
function saveDocReferNote(kind, val) {
  stDealData.docReferNote = stDealData.docReferNote || {};
  stDealData.docReferNote[kind] = val || '';
  saveSTDealData();
}

// ── โหมด Manual: กรอกรายการในเอกสารเอง ทีละคอลัมน์ (สลับกับดึงอัตโนมัติจากใบเสนอราคา) ──
function _docManual() { stDealData.docManual = stDealData.docManual || {}; if (!Array.isArray(stDealData.docManual.rows)) stDealData.docManual.rows = []; return stDealData.docManual; }
function toggleDocManual(on) {
  const dm = _docManual();
  dm.on = !!on;
  if (on && !dm.rows.length) dm.rows = (typeof _cdSeedRowsFromItems==='function') ? _cdSeedRowsFromItems() : [{ t:'item', no:'', desc:'', qty:'', price:'', amount:'' }];
  const box = document.getElementById('cpo-manual-box'); if (box) box.style.display = on ? '' : 'none';
  renderDocManualRows();
  saveSTDealData();
}
function renderDocManualRows() {
  const tb = document.getElementById('cpo-manual-rows'); if (!tb) return;
  const dm = _docManual();
  const xbtn = (i,f) => '<button onclick="clearDocManualCell('+i+',\''+f+'\')" title="ล้างให้ว่าง" style="flex:0 0 auto;width:16px;height:16px;line-height:14px;padding:0;border-radius:50%;border:1px solid var(--border,#ccc);background:none;cursor:pointer;color:var(--muted);font-size:10px">×</button>';
  const inp = (i,f,v,ph,align) => '<div style="display:flex;gap:2px;align-items:center"><input value="'+escHtml(String(v||''))+'" oninput="updateDocManualCell('+i+',\''+f+'\',this.value)" placeholder="'+(ph||'')+'" style="flex:1 1 auto;min-width:0;font-size:11px;text-align:'+(align||'left')+'">'+xbtn(i,f)+'</div>';
  const _mainText = r => r.name!=null && String(r.name).trim()!=='' ? r.name : (r.desc||'');  // บรรทัดหลัก (รองรับทั้ง name และ desc เดิม)
  tb.innerHTML = dm.rows.map((r,i) => {
    const t = r.t || 'item';
    if (t==='group' || t==='note') {
      const lbl = t==='group' ? '▦ กลุ่ม' : '📝 หมายเหตุ';
      return '<tr><td colspan="6" style="padding:4px 2px">'
        + '<div style="display:flex;gap:6px;align-items:center;background:var(--surface2);border-radius:6px;padding:4px 8px">'
        + '<span style="font-size:10px;color:var(--muted);font-weight:700;white-space:nowrap">'+lbl+'</span>'
        + '<input value="'+escHtml(String(r.name||''))+'" oninput="updateDocManualCell('+i+',\'name\',this.value)" placeholder="หัวข้อ" style="flex:1;min-width:0;font-size:11px;font-weight:600">'
        + '<button onclick="removeDocManualRow('+i+')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px" title="ลบแถว">✕</button>'
        + '<span style="font-size:10px;color:var(--muted);white-space:nowrap">แก้เต็มที่พรีวิว</span></div></td></tr>';
    }
    return '<tr>'
    + '<td style="padding:2px">'+inp(i,'no',r.no,'','center')+'</td>'
    + '<td style="padding:2px"><textarea oninput="updateDocManualCell('+i+',\''+(r.name!=null&&String(r.name).trim()!==''?'name':'desc')+'\',this.value);_autoGrow(this)" placeholder="รายการ..." rows="1" style="width:100%;font-size:11px;min-height:1.7em;overflow:hidden;resize:none;line-height:1.4">'+escHtml(String(_mainText(r)))+'</textarea></td>'
    + '<td style="padding:2px">'+inp(i,'qty',r.qty,'','center')+'</td>'
    + '<td style="padding:2px">'+inp(i,'price',r.price,'','center')+'</td>'
    + '<td style="padding:2px"><div style="display:flex;gap:2px;align-items:center"><input value="'+escHtml(String(r.amount||''))+'" oninput="updateDocManualCell('+i+',\'amount\',this.value)" onblur="blurDocManualAmount(this,'+i+')" placeholder="0.00" style="flex:1 1 auto;min-width:0;font-size:11px;text-align:right">'+xbtn(i,'amount')+'</div></td>'
    + '<td style="padding:2px;text-align:center"><button onclick="removeDocManualRow('+i+')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px" title="ลบแถว">✕</button></td>'
    + '</tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:6px;font-size:11px">— ยังไม่มีแถว กด "+ เพิ่มแถว" —</td></tr>';
  // ปรับความสูง textarea รายการให้พอดีเนื้อหาตอนเปิดมา
  [...tb.querySelectorAll('textarea')].forEach(_autoGrow);
}
function _autoGrow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; }
function addDocManualRow() { _docManual().rows.push({ no:'', desc:'', qty:'', price:'', amount:'' }); renderDocManualRows(); saveSTDealData(); }
function removeDocManualRow(i) { const dm=_docManual(); dm.rows.splice(i,1); renderDocManualRows(); if(typeof _cdRefresh==='function')_cdRefresh(); saveSTDealData(); }
function clearDocManualCell(i, field) { const dm=_docManual(); if(!dm.rows[i])return; dm.rows[i][field]=''; renderDocManualRows(); if(typeof _cdRefreshFrame==='function')_cdRefreshFrame(); saveSTDealData(); }
let _docManualSaveT = null;
function updateDocManualCell(i, field, val) {
  const dm = _docManual(); if (!dm.rows[i]) return; dm.rows[i][field] = val;
  clearTimeout(_docManualSaveT); _docManualSaveT = setTimeout(saveSTDealData, 700);   // หน่วงบันทึกกันยิงถี่
}
// จัดรูปแบบจำนวนเงินเมื่อออกจากช่อง (1,000.00) — ถ้าเป็นข้อความปล่อยไว้
function blurDocManualAmount(el, i) {
  const s = String(el.value||'').trim();
  if (s !== '' && /^-?[\d,]*\.?\d*$/.test(s)) {
    const n = parseFloat(s.replace(/,/g,''));
    if (isFinite(n)) { el.value = n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  }
  updateDocManualCell(i, 'amount', el.value);
  clearTimeout(_docManualSaveT); saveSTDealData();
}

// ════════ PO ลูกค้า: ระบบจัดหน้าเอกสาร (พรีวิวแยกซ้าย-ขวา · คอลัมน์ · Manual · AI/Excel) ════════
// คอลัมน์ตาราง — ซ่อน/แสดง + ปรับความกว้าง (เก็บใน stDealData.docManual.cols)
const CUST_DOC_COLS = [
  { k:'seq',  th:'ลำดับ',       en:'ITEM',       w:42 },
  { k:'pn',   th:'รหัสสินค้า',   en:'CODE',       w:84, opt:true },
  { k:'name', th:'รายการ',       en:'DESCRIPTION', flex:true, always:true },
  { k:'qty',  th:'จำนวน',        en:'QUANTITY',   w:70 },
  { k:'unit', th:'หน่วยนับ',     en:'UNIT',       w:64, opt:true },
  { k:'price',th:'ราคาต่อหน่วย', en:'UNIT PRICE', w:95, priceCol:true },
  { k:'amt',  th:'จำนวนเงิน',    en:'AMOUNT',     w:105, priceCol:true }
];
function _cdColCfg() { const dm=_docManual(); if(!dm.cols||typeof dm.cols!=='object')dm.cols={}; if(!dm.cols.vis)dm.cols.vis={}; if(!dm.cols.w)dm.cols.w={}; return dm.cols; }
function _cdColW(k) { const c=_cdColCfg(); const def=(CUST_DOC_COLS.find(x=>x.k===k)||{}).w; return (c.w[k]!=null&&c.w[k]!=='')?+c.w[k]:def; }
function toggleCDCol(k,on) { _cdColCfg().vis[k]=!!on; saveSTDealData(); _cdRefresh(); }
let _cdColWT=null;
function setCDColWidth(k,val) { _cdColCfg().w[k]=val; const lbl=document.getElementById('cd-cw-'+k); if(lbl)lbl.textContent=val+'px'; clearTimeout(_cdColWT); _cdColWT=setTimeout(function(){ _cdRefreshFrame(); saveSTDealData(); },250); }

// รีเฟรชทั้ง editor ฝั่งซ้าย + inline box + พรีวิวฝั่งขวา
function _docManualChanged() { try{ renderDocManualRows(); }catch(e){} _cdRefresh(); }
let _cdManT=null;
function setCDManual(i,field,val) { const r=_docManual().rows; if(r[i])r[i][field]=val; if(typeof _cdUpdateWarn==='function')_cdUpdateWarn(); clearTimeout(_cdManT); _cdManT=setTimeout(function(){ _cdRefreshFrame(); try{renderDocManualRows();}catch(e){} saveSTDealData(); },350); }
function setCDManualBlank(i,field) { const r=_docManual().rows; if(r[i])r[i][field]=' '; _docManualChanged(); saveSTDealData(); }
function setCDManualAlign(i,a) { const r=_docManual().rows; if(r[i])r[i].align=a; _docManualChanged(); saveSTDealData(); }
function moveCDManualRow(i,dir) { const a=_docManual().rows; const j=i+dir; if(j<0||j>=a.length)return; const t=a[i];a[i]=a[j];a[j]=t; _docManualChanged(); saveSTDealData(); }
function addCDManualRow(type) {
  const row = type==='group' ? {t:'group',name:'หัวข้อกลุ่ม',align:'left'}
            : type==='note'  ? {t:'note',name:'',desc:''}
            : {t:'item',no:'',pn:'',name:'',desc:'',qty:'',unit:'',price:'',amount:''};
  _docManual().rows.push(row); _docManualChanged(); saveSTDealData();
}

// ยอดรวมโหมด Manual (เฉพาะแถว item)
function _cdManualSum() { const _num=v=>{const s=String(v==null?'':v).trim(); if(s===''||!/^-?[\d,]*\.?\d*$/.test(s))return 0; const n=parseFloat(s.replace(/,/g,'')); return isFinite(n)?n:0;}; return (_docManual().rows||[]).reduce((s,r)=> s + ((r.t==='group'||r.t==='note')?0:_num(r.amount)), 0); }
function _cdWarnHtml() { const man=_cdManualSum(); const fmt2=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); return '<span style="color:#15803d">Σ รวมรายการ (ก่อน VAT) = <b>'+fmt2(man)+'</b> บาท · VAT 7% = '+fmt2(man*0.07)+' · รวมสุทธิ '+fmt2(man*1.07)+'</span>'; }
function _cdUpdateWarn() { const el=document.getElementById('cd-man-warn'); if(el)el.innerHTML=_cdWarnHtml(); }

// ── นำเข้ารายการ: วางจากตาราง (Excel) ──
function _cdNum(s){ const n=parseFloat(String(s).replace(/[,\s฿]/g,'')); return isNaN(n)?'':n; }
function _cdIsNum(s){ s=String(s).trim(); return s!=='' && /^[\d,.\s฿]+$/.test(s) && !isNaN(parseFloat(s.replace(/[,\s฿]/g,''))); }
function parseCDPaste(text){
  const out=[];
  String(text||'').split(/\r?\n/).forEach(function(line){
    if(!line.trim()) return;
    let cells = line.indexOf('\t')>=0 ? line.split('\t') : line.split(/\s{2,}|\s*\|\s*|,(?=\s)/);
    cells = cells.map(c=>c.trim()).filter((c,i,a)=>!(c===''&&(i===0||i===a.length-1)));
    if(!cells.length) return;
    const joined=cells.join(' ').toLowerCase();
    const hasNum=cells.some(_cdIsNum);
    if(!hasNum && /(รายการ|description|จำนวนเงิน|amount|unit\s*price|ราคา|ลำดับ|qty|จำนวน|หน่วย)/.test(joined)) return;
    if(cells.length>=4 && /^\d+\.?$/.test(cells[0])) cells=cells.slice(1);
    if(!cells.length) return;
    const name=cells[0]||''; const rest=cells.slice(1);
    const nums=[], texts=[];
    rest.forEach(c=>{ if(_cdIsNum(c)) nums.push(_cdNum(c)); else if(c) texts.push(c); });
    let qty='',unit=texts[0]||'',price='',amt='';
    if(nums.length>=3){ qty=nums[0]; price=nums[nums.length-2]; amt=nums[nums.length-1]; }
    else if(nums.length===2){ price=nums[0]; amt=nums[1]; }
    else if(nums.length===1){ amt=nums[0]; }
    if(name || amt!=='') out.push({t:'item',no:'',pn:'',name:name,desc:'',qty:qty,unit:unit,price:price,amount:amt});
  });
  return out;
}
function openCDPasteImport(){
  const old=document.getElementById('_cdPaste'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_cdPaste';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:10px;width:560px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#17356b">📋 วางจากตาราง (Excel)</div>'
    +'<div style="padding:12px 16px;overflow:auto">'
    +'<div style="font-size:12px;color:#64748b;margin-bottom:8px">คัดลอกตารางรายการ (Excel / PDF / Word) แล้ววางด้านล่าง<br>คอลัมน์ที่รองรับ: <b>รายการ · จำนวน · หน่วย · ราคา/หน่วย · จำนวนเงิน</b> (ระบบเดาคอลัมน์ให้ ปรับแก้ภายหลังได้)</div>'
    +'<textarea id="_cdPasteTxt" placeholder="วางที่นี่ (Ctrl+V)..." style="width:100%;min-height:200px;font-size:12px;font-family:monospace;border:1px solid #cbd5e1;border-radius:6px;padding:8px;line-height:1.5"></textarea>'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:10px"><input type="checkbox" id="_cdPasteAppend"> เพิ่มต่อท้ายรายการเดิม (ไม่ติ๊ก = แทนที่ทั้งหมด)</label>'
    +'</div>'
    +'<div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px">'
    +'<button id="_cdPasteCancel" style="padding:7px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">ยกเลิก</button>'
    +'<button id="_cdPasteOk" style="padding:7px 16px;border:none;background:#17356b;color:#fff;border-radius:6px;cursor:pointer">แปลง & ใส่</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  const txt=document.getElementById('_cdPasteTxt'); if(txt)txt.focus();
  document.getElementById('_cdPasteCancel').onclick=()=>ov.remove();
  ov.addEventListener('click',e=>{ if(e.target===ov)ov.remove(); });
  document.getElementById('_cdPasteOk').onclick=function(){
    const parsed=parseCDPaste(document.getElementById('_cdPasteTxt').value);
    if(!parsed.length){ toast('ไม่พบรายการจากข้อความที่วาง','error'); return; }
    const dm=_docManual(); dm.on=true;
    const append=document.getElementById('_cdPasteAppend').checked;
    dm.rows = append ? (dm.rows||[]).concat(parsed) : parsed;
    ov.remove();
    const _tg=document.getElementById('cpo-manual-toggle'); if(_tg)_tg.checked=true;
    const _bx=document.getElementById('cpo-manual-box'); if(_bx)_bx.style.display='';
    _docManualChanged(); saveSTDealData();
    toast('นำเข้า '+parsed.length+' รายการแล้ว','success');
  };
}
// ── นำเข้ารายการด้วย AI (Claude Vision) จากไฟล์ใบเสนอราคา/รูป/PDF ──
function _cdGetAIKey(){ try{ return localStorage.getItem('cd_ai_key')||''; }catch(e){ return ''; } }
function _cdSetAIKey(k){ try{ localStorage.setItem('cd_ai_key', k||''); }catch(e){} }
function _cdFileToB64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(String(e.target.result).split(',')[1]||''); r.onerror=rej; r.readAsDataURL(file); }); }
async function _cdClaudeExtract(b64, mediaType){
  const key=_cdGetAIKey(); if(!key) throw new Error('ยังไม่ได้ใส่ API key');
  const isPdf=/pdf/i.test(mediaType||'');
  const fileBlock = isPdf ? { type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 } }
                          : { type:'image', source:{ type:'base64', media_type:(mediaType||'image/png'), data:b64 } };
  const PROMPT='นี่คือใบเสนอราคา/เอกสารรายการสินค้า. ดึงเฉพาะ "รายการสินค้า/บริการ" ในตาราง ส่งกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น. '
    +'แต่ละ object มีคีย์: name (ชื่อรายการ string), qty (จำนวน ตัวเลข หรือ ""), unit (หน่วยนับ string), '
    +'price (ราคาต่อหน่วย ตัวเลขไม่มีคอมมา หรือ ""), amt (จำนวนเงินรวมของรายการนั้น ตัวเลข หรือ ""). '
    +'ห้ามรวมแถวหัวตาราง, ส่วนลด, VAT, หรือยอดรวมสุทธิ. ตอบเป็น JSON array ล้วน ๆ.';
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{ 'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model:'claude-sonnet-5', max_tokens:4096, messages:[{ role:'user', content:[ fileBlock, { type:'text', text:PROMPT } ] }] })
  });
  if(!r.ok){ let msg=''; try{ msg=(await r.json()).error?.message||''; }catch(e){ msg=await r.text(); } throw new Error('AI '+r.status+': '+(msg||'').slice(0,200)); }
  const data=await r.json();
  let t=(data.content||[]).map(c=>c.text||'').join('').trim();
  const m=t.match(/\[[\s\S]*\]/); if(m)t=m[0];
  let arr; try{ arr=JSON.parse(t); }catch(e){ throw new Error('อ่านผลลัพธ์ AI ไม่สำเร็จ'); }
  if(!Array.isArray(arr)) throw new Error('ผลลัพธ์ไม่ใช่รายการ');
  const num=v=>{ if(v===''||v==null)return ''; const n=parseFloat(String(v).replace(/[,\s฿]/g,'')); return isNaN(n)?'':n; };
  return arr.map(r=>({ t:'item', no:'', pn:'', name:String(r.name||r.description||''), desc:'', qty:num(r.qty!=null?r.qty:r.quantity), unit:String(r.unit||''), price:num(r.price!=null?r.price:r.unitPrice), amount:num(r.amt!=null?r.amt:(r.amount!=null?r.amount:r.total)) }))
            .filter(x=>x.name||x.amount!=='');
}
function openCDAIImport(){
  const old=document.getElementById('_cdAI'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_cdAI';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:10px;width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#17356b">🤖 ดูดรายการจากไฟล์ใบเสนอราคา (AI)</div>'
    +'<div style="padding:12px 16px;overflow:auto">'
    +'<div style="font-size:12px;color:#334155;font-weight:600;margin-bottom:4px">Anthropic API key</div>'
    +'<input id="_cdaiKey" type="password" value="'+escHtml(_cdGetAIKey())+'" placeholder="sk-ant-..." style="width:100%;font-size:12px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:4px">'
    +'<div style="font-size:10.5px;color:#b45309;margin-bottom:10px">⚠ key เก็บในเบราว์เซอร์นี้ และส่งตรงไป Anthropic — อย่าใช้ในเครื่องสาธารณะ</div>'
    +'<div style="font-size:12px;color:#334155;font-weight:600;margin-bottom:4px">ไฟล์ (PDF หรือ รูปภาพ)</div>'
    +'<input id="_cdaiFile" type="file" accept=".pdf,image/*" style="width:100%;font-size:12px;margin-bottom:10px">'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px"><input type="checkbox" id="_cdaiAppend"> เพิ่มต่อท้ายรายการเดิม (ไม่ติ๊ก = แทนที่)</label>'
    +'<div id="_cdaiStatus" style="font-size:12px;color:#64748b;min-height:18px"></div>'
    +'</div>'
    +'<div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px">'
    +'<button id="_cdaiCancel" style="padding:7px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">ยกเลิก</button>'
    +'<button id="_cdaiOk" style="padding:7px 16px;border:none;background:#17356b;color:#fff;border-radius:6px;cursor:pointer">ดูดข้อมูล</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  document.getElementById('_cdaiCancel').onclick=close;
  ov.addEventListener('click',e=>{ if(e.target===ov)close(); });
  document.getElementById('_cdaiOk').onclick=async function(){
    const key=document.getElementById('_cdaiKey').value.trim(); _cdSetAIKey(key);
    const f=document.getElementById('_cdaiFile').files[0];
    const st=document.getElementById('_cdaiStatus');
    if(!key){ st.innerHTML='<span style="color:#b91c1c">กรุณาใส่ API key</span>'; return; }
    if(!f){ st.innerHTML='<span style="color:#b91c1c">กรุณาเลือกไฟล์</span>'; return; }
    st.innerHTML='⏳ กำลังอ่านไฟล์และวิเคราะห์ด้วย AI...';
    const okBtn=document.getElementById('_cdaiOk'); okBtn.disabled=true; okBtn.style.opacity='0.6';
    try{
      const b64=await _cdFileToB64(f);
      const mt=f.type|| (/\.pdf$/i.test(f.name)?'application/pdf':'image/png');
      const rows=await _cdClaudeExtract(b64, mt);
      if(!rows.length){ st.innerHTML='<span style="color:#b91c1c">ไม่พบรายการในไฟล์</span>'; okBtn.disabled=false; okBtn.style.opacity='1'; return; }
      const dm=_docManual(); dm.on=true;
      dm.rows = document.getElementById('_cdaiAppend').checked ? (dm.rows||[]).concat(rows) : rows;
      close();
      const _tg=document.getElementById('cpo-manual-toggle'); if(_tg)_tg.checked=true;
      const _bx=document.getElementById('cpo-manual-box'); if(_bx)_bx.style.display='';
      _docManualChanged(); saveSTDealData();
      toast('ดูดข้อมูลสำเร็จ '+rows.length+' รายการ','success');
    }catch(e){ st.innerHTML='<span style="color:#b91c1c">ไม่สำเร็จ: '+escHtml(e.message)+'</span>'; okBtn.disabled=false; okBtn.style.opacity='1'; }
  };
}

// ── Editor ฝั่งซ้ายของพรีวิว (จัดหน้า · คอลัมน์ · Manual) ──
function renderCDEditor() {
  const dm=_docManual(); const _manual=!!dm.on;
  const kind=_cdPreview?_cdPreview.kind:'delivery';
  const noPrice=(kind==='tempdelivery');
  const esc=escHtml;
  let h='';
  // ชนิดเอกสาร + สำเนา (สลับได้ในพรีวิว)
  const kinds=[['delivery','ใบส่งของ/ใบแจ้งหนี้'],['tax','ใบกำกับภาษี'],['receipt','ใบเสร็จรับเงิน'],['tempdelivery','ใบส่งของชั่วคราว']];
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px">ชนิดเอกสาร</div>';
  h+='<select onchange="switchCDKind(this.value)" style="width:100%;font-size:12px;margin-bottom:8px">'+kinds.map(k=>'<option value="'+k[0]+'" '+(kind===k[0]?'selected':'')+'>'+k[1]+'</option>').join('')+'</select>';
  const copies=[['customer','ต้นฉบับลูกค้า'],['acct','สำเนา (บัญชี)'],['company','สำเนาบริษัท']];
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px">สำเนา</div>';
  h+='<select onchange="switchCDCopy(this.value)" style="width:100%;font-size:12px;margin-bottom:12px">'+copies.map(c=>'<option value="'+c[0]+'" '+((_cdPreview&&_cdPreview.copy)===c[0]?'selected':'')+'>'+c[1]+'</option>').join('')+'</select>';
  // สินค้าเป็น Hardware → เลขเอกสารใช้ TAX แทน IV/RV
  h+='<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#334155;margin-bottom:12px;cursor:pointer;padding:6px 8px;border:1px dashed #cbd5e1;border-radius:6px"><input type="checkbox" '+(dm.hardware?'checked':'')+' onchange="setCDHardware(this.checked)"> 📦 สินค้าเป็น Hardware — เลขเอกสารใช้ <b>TAX</b> แทน IV/RV</label>';
  // ข้อความเหนือ E.&O.E.
  const rn=(stDealData.docReferNote||{})[kind]||'';
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px">ข้อความเหนือ "ผิด ตก ยกเว้น" (ต่อชนิดเอกสาร)</div>';
  h+='<textarea oninput="setCDReferNote(this.value)" placeholder="เช่น อ้างอิงใบเสนอราคา..." style="width:100%;min-height:52px;font-size:12px;line-height:1.5;margin-bottom:12px">'+esc(rn)+'</textarea>';
  // คอลัมน์: ซ่อน/แสดง + ความกว้าง
  h+='<div style="border-top:1px solid #e2e8f0;margin:6px 0 8px"></div>';
  h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px">คอลัมน์ตาราง (ซ่อน/แสดง · ปรับความกว้าง)</div>';
  h+=CUST_DOC_COLS.map(function(col){
    const forcedOff = col.priceCol && noPrice;
    const _cv = _cdColCfg().vis;
    const vis = col.always ? true : (col.priceCol ? !noPrice : (col.opt ? _cv[col.k]===true : _cv[col.k]!==false));
    const showChk = !col.always && !col.priceCol;
    const chk = showChk
      ? '<input type="checkbox" '+(vis?'checked':'')+' onchange="toggleCDCol(\''+col.k+'\',this.checked)" style="margin:0">'
      : '<span style="display:inline-block;width:13px"></span>';
    let row='<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">'
      +'<label style="display:flex;align-items:center;gap:6px;min-width:100px;font-size:11px;color:#334155;cursor:'+(showChk?'pointer':'default')+'">'+chk+' '+col.th+(col.always?' <span style="color:#94a3b8">(คงที่)</span>':(col.priceCol?' <span style="color:#94a3b8">(ตามชนิด)</span>':''))+'</label>';
    if(col.flex){ row+='<span style="font-size:10px;color:#94a3b8">ยืดอัตโนมัติ</span>'; }
    else { const w=_cdColW(col.k);
      row+='<input type="range" min="30" max="200" value="'+w+'" oninput="setCDColWidth(\''+col.k+'\',this.value)" '+(forcedOff?'disabled':'')+' style="flex:1;min-width:0">'
         +'<span id="cd-cw-'+col.k+'" style="font-size:10px;font-family:monospace;color:#64748b;min-width:34px;text-align:right">'+w+'px</span>'; }
    return row+'</div>';
  }).join('');
  h+='<div style="font-size:10px;color:#94a3b8;margin-bottom:12px">* คอลัมน์ "รายการ" ยืดเต็มพื้นที่ที่เหลือเสมอ</div>';
  // Manual toggle
  h+='<div style="border-top:1px solid #e2e8f0;margin:6px 0 10px"></div>';
  h+='<label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;cursor:pointer"><input type="checkbox" '+(_manual?'checked':'')+' onchange="toggleCDManual(this.checked)"> ✎ ปรับรายการเอง (Manual)</label>';
  if(_manual){
    const rows=dm.rows||[];
    h+='<div style="font-size:10.5px;color:#64748b;margin-bottom:6px">แก้ได้ทุกช่อง ไม่จำกัดบรรทัด · ยอดรวม/VAT/สุทธิ คิดจากคอลัมน์ "จำนวนเงิน" ที่กรอกเอง</div>';
    h+='<button onclick="fillCDFromQuote()" style="width:100%;font-size:12px;padding:7px;border:1px solid #16a34a;background:#f0fdf4;color:#15803d;border-radius:6px;cursor:pointer;margin-bottom:6px;font-weight:600">⟲ ดึงรายการจากใบเสนอราคามาแก้</button>';
    h+='<button onclick="openCDAIImport()" style="width:100%;font-size:12px;padding:7px;border:none;background:#17356b;color:#fff;border-radius:6px;cursor:pointer;margin-bottom:6px;font-weight:600">🤖 ดูดจากไฟล์ใบเสนอราคา (AI · PDF/รูป)</button>';
    h+='<button onclick="openCDPasteImport()" style="width:100%;font-size:12px;padding:6px;border:1px solid #2563a8;background:#eff6ff;color:#1d4ed8;border-radius:6px;cursor:pointer;margin-bottom:8px">📋 วางจากตาราง (Excel)</button>';
    if(!noPrice) h+='<div id="cd-man-warn" style="font-size:11px;margin-bottom:8px">'+_cdWarnHtml()+'</div>';
    const n=rows.length;
    const moveBtns=i=>'<button onclick="moveCDManualRow('+i+',-1)" title="ย้ายขึ้น" '+(i===0?'disabled':'')+' style="border:none;background:none;cursor:pointer;color:'+(i===0?'#cbd5e1':'#64748b')+';font-size:12px;padding:0 1px">▲</button>'
      +'<button onclick="moveCDManualRow('+i+',1)" title="ย้ายลง" '+(i===n-1?'disabled':'')+' style="border:none;background:none;cursor:pointer;color:'+(i===n-1?'#cbd5e1':'#64748b')+';font-size:12px;padding:0 1px">▼</button>';
    const delBtn=i=>'<button onclick="removeDocManualRow('+i+')" title="ลบแถว" style="border:none;background:none;color:#b91c1c;cursor:pointer;font-size:13px;padding:0 2px">✕</button>';
    const bx=(i,field)=>'<button type="button" onclick="setCDManualBlank('+i+',\''+field+'\')" title="ล้างให้ว่าง" style="position:absolute;top:50%;right:2px;transform:translateY(-50%);width:13px;height:13px;border-radius:50%;border:none;background:#e2e8f0;color:#64748b;font-size:9px;line-height:13px;text-align:center;cursor:pointer;padding:0;z-index:2">×</button>';
    const wx=(inner,i,field,wrapStyle)=>'<span style="position:relative;display:inline-flex;align-items:center;'+(wrapStyle||'')+'">'+inner+bx(i,field)+'</span>';
    h+=rows.map(function(r,i){ const t=r.t||'item';
      if(t==='group'){ const al=r.align||'left'; const ab=(a,lab)=>'<button onclick="setCDManualAlign('+i+',\''+a+'\')" title="จัด'+lab+'" style="border:none;background:'+(al===a?'#dbeafe':'none')+';color:'+(al===a?'#1d4ed8':'#94a3b8')+';cursor:pointer;font-size:11px;font-weight:700;padding:1px 5px;border-radius:3px">'+lab+'</button>';
        return '<div style="border:1px solid #c7d2fe;background:#eef2ff;border-radius:6px;padding:6px;margin-bottom:6px">'
          +'<div style="display:flex;gap:4px;align-items:center"><span style="font-size:10px;color:#6366f1;font-weight:700">▦ กลุ่ม</span>'+ab('left','L')+ab('center','C')+ab('right','R')
          +'<span style="margin-left:auto">'+moveBtns(i)+delBtn(i)+'</span></div>'
          +'<input value="'+esc(r.name||'')+'" oninput="setCDManual('+i+',\'name\',this.value)" placeholder="หัวข้อกลุ่ม" style="width:100%;margin-top:4px;font-size:11px;font-weight:600;padding:3px 5px">'
          +'</div>'; }
      if(t==='note'){ return '<div style="border:1px dashed #cbd5e1;background:#f8fafc;border-radius:6px;padding:6px;margin-bottom:6px">'
          +'<div style="display:flex;gap:4px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700">📝 หมายเหตุ</span><span style="margin-left:auto">'+moveBtns(i)+delBtn(i)+'</span></div>'
          +'<input value="'+esc(r.name||'')+'" oninput="setCDManual('+i+',\'name\',this.value)" placeholder="หัวข้อ (ไม่บังคับ)" style="width:100%;margin-top:4px;font-size:11px;font-weight:600;padding:3px 5px">'
          +'<textarea oninput="setCDManual('+i+',\'desc\',this.value)" placeholder="ข้อความ..." style="width:100%;margin-top:4px;min-height:44px;font-size:11px;line-height:1.5;padding:3px 5px">'+esc(r.desc||'')+'</textarea>'
          +'</div>'; }
      // item
      return '<div style="border:1.5px solid #94a3b8;border-radius:7px;padding:8px;margin-bottom:9px;box-shadow:0 1px 3px rgba(15,23,42,.1)">'
        +'<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">'
        +wx('<input value="'+esc(r.no!=null?r.no:'')+'" oninput="setCDManual('+i+',\'no\',this.value)" placeholder="'+(i+1)+'" title="ลำดับ — เว้นว่าง = อัตโนมัติ" style="width:46px;font-size:10px;padding:3px 16px 3px 3px;text-align:center">', i, 'no')
        +wx('<input value="'+esc(r.name||'')+'" oninput="setCDManual('+i+',\'name\',this.value)" placeholder="รายการ" style="width:100%;font-size:11px;padding:3px 16px 3px 5px">', i, 'name', 'flex:1;min-width:0')
        +moveBtns(i)+delBtn(i)+'</div>'
        +wx('<input value="'+esc(r.pn||'')+'" oninput="setCDManual('+i+',\'pn\',this.value)" placeholder="รหัสสินค้า / Part No. (ถ้ามี)" style="width:100%;font-size:10.5px;padding:3px 16px 3px 5px;font-family:monospace">', i, 'pn', 'width:100%;margin-bottom:4px')
        +'<textarea oninput="setCDManual('+i+',\'desc\',this.value)" placeholder="รายละเอียดเพิ่มเติม (Detail)..." style="width:100%;margin-bottom:4px;min-height:34px;font-size:10.5px;line-height:1.5;padding:3px 5px;color:#475569">'+esc(r.desc||'')+'</textarea>'
        +'<div style="display:flex;gap:4px">'
        +wx('<input value="'+esc(r.qty!=null?r.qty:'')+'" oninput="setCDManual('+i+',\'qty\',this.value)" placeholder="จำนวน" style="width:100%;font-size:11px;padding:3px 16px 3px 4px;text-align:center">', i, 'qty', 'width:58px')
        +wx('<input value="'+esc(r.unit||'')+'" oninput="setCDManual('+i+',\'unit\',this.value)" placeholder="หน่วย" style="width:100%;font-size:11px;padding:3px 16px 3px 4px;text-align:center">', i, 'unit', 'width:60px')
        +wx('<input value="'+esc(r.price!=null?r.price:'')+'" oninput="setCDManual('+i+',\'price\',this.value)" placeholder="ราคา/หน่วย" style="width:100%;font-size:11px;padding:3px 16px 3px 4px;text-align:right">', i, 'price', 'flex:1;min-width:0')
        +wx('<input value="'+esc(r.amount!=null?r.amount:'')+'" oninput="setCDManual('+i+',\'amount\',this.value)" placeholder="จำนวนเงิน" style="width:100%;font-size:11px;padding:3px 16px 3px 4px;text-align:right">', i, 'amount', 'flex:1;min-width:0')
        +'</div></div>'; }).join('');
    h+='<div style="display:flex;gap:4px;margin-bottom:12px">'
      +'<button onclick="addCDManualRow(\'item\')" style="flex:1;font-size:11px;padding:6px 4px;border:1px dashed #2563a8;background:none;color:#2563a8;border-radius:6px;cursor:pointer">+ รายการ</button>'
      +'<button onclick="addCDManualRow(\'group\')" style="flex:1;font-size:11px;padding:6px 4px;border:1px dashed #6366f1;background:none;color:#4f46e5;border-radius:6px;cursor:pointer">+ หัวข้อกลุ่ม</button>'
      +'<button onclick="addCDManualRow(\'note\')" style="flex:1;font-size:11px;padding:6px 4px;border:1px dashed #94a3b8;background:none;color:#475569;border-radius:6px;cursor:pointer">+ หมายเหตุ</button>'
      +'</div>';
    // ── แบ่งหน้า (ขึ้นหน้าใหม่หลังรายการ) — index อ้างอิงลำดับรายการที่แสดงจริง ──
    const _hasC = r => (r.t==='group'||r.t==='note') ? String(r.name||r.desc||'').trim()!=='' : ['no','pn','name','desc','qty','unit','price','amount'].some(f=>String(r[f]||'').trim());
    const _rr = rows.filter(_hasC);
    const brks = Array.isArray(dm.breaks)?dm.breaks:[];
    h+='<div style="border-top:1px solid #e2e8f0;margin:6px 0 8px"></div>';
    h+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px">แบ่งหน้า (ขึ้นหน้าใหม่หลังรายการ)</div>';
    if(!_rr.length){ h+='<div style="font-size:11px;color:#94a3b8;margin-bottom:12px">— ยังไม่มีรายการ —</div>'; }
    else h+=_rr.map(function(r,idx){ const t=r.t||'item';
      const lbl = t==='group'?('▦ '+(r.name||'')):(t==='note'?('📝 '+(r.name||r.desc||'')):(r.name||r.desc||('รายการ '+(idx+1))));
      const has = brks.indexOf(idx)>=0;
      return '<div style="display:flex;align-items:center;gap:6px;border-top:1px solid #f1f5f9;padding:3px 0;font-size:11px">'
        +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#475569">'+(idx+1)+'. '+esc(String(lbl).slice(0,40))+'</span>'
        +(has?'<button onclick="delCDBreak('+idx+')" title="ยกเลิกขึ้นหน้าใหม่" style="border:none;background:#fde68a;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#92400e;white-space:nowrap">⤵ ขึ้นหน้าใหม่ ✕</button>'
             :'<button onclick="addCDBreak('+idx+')" style="border:1px dashed #d97706;background:none;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#b45309;white-space:nowrap">+ ขึ้นหน้าใหม่</button>')
        +'</div>';
    }).join('')+'<div style="margin-bottom:12px"></div>';
  }
  return h;
}
function addCDBreak(idx){ const dm=_docManual(); if(!Array.isArray(dm.breaks))dm.breaks=[]; if(dm.breaks.indexOf(idx)<0)dm.breaks.push(idx); _cdRefresh(); saveSTDealData(); }
function delCDBreak(idx){ const dm=_docManual(); dm.breaks=(dm.breaks||[]).filter(n=>n!==idx); _cdRefresh(); saveSTDealData(); }
function setCDReferNote(val){ const kind=_cdPreview?_cdPreview.kind:'delivery'; stDealData.docReferNote=stDealData.docReferNote||{}; stDealData.docReferNote[kind]=val||''; const _el=document.getElementById(kind==='tax'?'cpo-refnote-tax':(kind==='receipt'?'cpo-refnote-receipt':null)); if(_el)_el.value=val||''; clearTimeout(_cdManT); _cdManT=setTimeout(function(){ _cdRefreshFrame(); saveSTDealData(); },350); }
// สร้างแถว Manual จากรายการในใบเสนอราคา (ดึงมาแก้ต่อ)
function _cdSeedRowsFromItems(){
  const items=_cdItemsCache||[];
  if(!items.length) return [{t:'item',no:'',pn:'',name:'',desc:'',qty:'',unit:'',price:'',amount:''}];
  return items.map(function(it){
    const q=parseFloat(it.Quantity||0), p=parseFloat(it.UnitPrice||0), d=parseFloat(it.DiscountPct||0)/100;
    const amt=q*p*(1-d);
    return { t:'item', no:'', pn:(it.PartNumber||it.PartNo||it.Code||it.ProductCode||''),
      name:(it.Title||it.Description||''), desc:((it.Description&&it.Title)?it.Description:''),
      qty:(q||''), unit:(it.Unit||it.UnitName||''), price:(p||''), amount:(amt||'') };
  });
}
function fillCDFromQuote(){
  const dm=_docManual();
  if((dm.rows||[]).some(r=>String(r.name||r.desc||r.amount||'').trim()) && !confirm('แทนที่รายการที่กรอกไว้ด้วยรายการจากใบเสนอราคา?')) return;
  dm.on=true; dm.rows=_cdSeedRowsFromItems();
  const _tg=document.getElementById('cpo-manual-toggle'); if(_tg)_tg.checked=true;
  const _bx=document.getElementById('cpo-manual-box'); if(_bx)_bx.style.display='';
  _docManualChanged(); saveSTDealData();
  toast('ดึง '+(dm.rows.length)+' รายการจากใบเสนอราคาแล้ว','success');
}
function toggleCDManual(on){ const dm=_docManual(); dm.on=!!on; if(on && !(dm.rows||[]).length) dm.rows=_cdSeedRowsFromItems(); const _tg=document.getElementById('cpo-manual-toggle'); if(_tg)_tg.checked=!!on; const _bx=document.getElementById('cpo-manual-box'); if(_bx)_bx.style.display=on?'':'none'; _docManualChanged(); saveSTDealData(); }
function setCDHardware(on){ _docManual().hardware=!!on; _cdRefreshFrame(); saveSTDealData(); }
function switchCDKind(k){ if(_cdPreview)_cdPreview.kind=k; _cdRefresh(); }
function switchCDCopy(c){ if(_cdPreview)_cdPreview.copy=c; _cdRefresh(); }

// ── พรีวิวแยกซ้าย-ขวา (editor | เอกสารจริง) ──
let _cdPreview=null, _cdItemsCache=[], _cdQCache=null;
function _cdBuildHtml(){
  const q=_cdQCache||quotesData.find(x=>x.id===stQuoteId)||{};
  const po=(stDealData.custPOs||[])[0]||{};
  const co=companySettings||{};
  const kind=_cdPreview?_cdPreview.kind:'delivery';
  const copy=_cdPreview?_cdPreview.copy:'customer';
  const referNote=(stDealData.docReferNote||{})[kind]||'';
  return buildCustomerDocHTML(kind, copy, q, _cdItemsCache||[], po, co, stDealData.docManual||null, referNote);
}
function _cdRefresh(){ if(!_cdPreview)return; const ed=document.getElementById('_cdEditor'); if(ed)ed.innerHTML=renderCDEditor(); _cdRefreshFrame(); }
function _cdRefreshFrame(){ if(!_cdPreview)return; const f=document.getElementById('_cdFrame'); if(f)f.srcdoc=_cdBuildHtml(); }
function openCDPreview(kind, copy){
  _cdPreview={kind:kind||'delivery', copy:copy||'customer'};
  const old=document.getElementById('_docOverlay'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_docOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.62);display:flex;flex-direction:column;padding:10px 12px;gap:8px';
  const bar=document.createElement('div'); bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px';
  bar.innerHTML='<div style="color:#fff;font-size:13px;font-weight:600">พรีวิว / จัดหน้าเอกสาร PO ลูกค้า</div>';
  const btns=document.createElement('div'); btns.style.cssText='display:flex;gap:8px';
  const printBtn=document.createElement('button'); printBtn.textContent='🖨 พิมพ์ / บันทึก PDF'; printBtn.style.cssText='padding:8px 18px;background:#17356b;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer';
  const closeBtn=document.createElement('button'); closeBtn.textContent='✕ ปิด'; closeBtn.style.cssText='padding:8px 16px;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer';
  btns.appendChild(printBtn); btns.appendChild(closeBtn); bar.appendChild(btns); ov.appendChild(bar);
  const wrap=document.createElement('div'); wrap.style.cssText='flex:1;min-height:0;display:flex;gap:10px';
  const ed=document.createElement('div'); ed.id='_cdEditor'; ed.style.cssText='width:min(460px,42vw);flex-shrink:0;background:#fff;border-radius:8px;padding:12px;overflow:auto';
  ed.innerHTML=renderCDEditor();
  const f=document.createElement('iframe'); f.id='_cdFrame'; f.style.cssText='flex:1;min-width:0;border:none;border-radius:8px;background:#fff;box-shadow:0 12px 44px rgba(0,0,0,0.45)'; f.srcdoc=_cdBuildHtml();
  wrap.appendChild(ed); wrap.appendChild(f); ov.appendChild(wrap);
  document.body.appendChild(ov);
  function close(){ ov.remove(); _cdPreview=null; document.removeEventListener('keydown',onKey); if(typeof renderCustPOTab==='function')renderCustPOTab(); }
  function onKey(e){ if(e.key==='Escape'){ e.stopPropagation(); close(); } }
  printBtn.onclick=function(){ const html=_cdBuildHtml(); const w=window.open('','_blank'); if(!w){ toast('เบราว์เซอร์บล็อกป๊อปอัป — โปรดอนุญาตแล้วลองใหม่','error'); return; } w.document.open(); w.document.write(html); w.document.close(); setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },500); };
  closeBtn.onclick=close;
  document.addEventListener('keydown',onKey);
}

// ── ขอข้ามการรับ PO (ต้องผ่านการอนุมัติจาก Approver ก่อนออกเอกสารได้) ──
function _stTimeline(text, type) {
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({ id: Date.now(), user: (currentUser && (currentUser.displayName || currentUser.email)) || 'User', text: text, ts: new Date().toISOString(), type: type || 'note' });
}
async function requestPOWaiver() {
  const reason = (prompt('เหตุผลที่ต้องข้ามการรับ PO ลูกค้า (จะส่งให้ผู้อนุมัติพิจารณา):', '') || '').trim();
  if (!reason) { toast('กรุณาระบุเหตุผล', 'error'); return; }
  const previous = JSON.parse(JSON.stringify(stDealData));
  stDealData.poWaiver = { status: 'pending', reason: reason, by: (currentUser && (currentUser.displayName || currentUser.email)) || 'User', at: new Date().toISOString() };
  _stTimeline('📝 ขอข้ามการรับ PO ลูกค้า — รออนุมัติ (เหตุผล: ' + reason + ')', 'custpo');
  if (!await savePOWaiverChange(previous)) return;
  renderCustPOTab(); renderSTTimeline();
  toast('ส่งคำขอข้าม PO แล้ว — รอผู้อนุมัติพิจารณา', 'success');
  // แจ้งผู้อนุมัติ (ถ้ามีฟังก์ชันส่งเมล)
  try { const q = quotesData.find(x => x.id === stQuoteId); if (q && typeof sendPOReceivedEmail === 'function') sendPOReceivedEmail(q, '(ขอข้าม PO — รออนุมัติ)').catch(function(){}); } catch(e) {}
}
async function approvePOWaiver() {
  if (!(userRoles.isApprover || userRoles.isAdmin)) { toast('เฉพาะผู้อนุมัติเท่านั้น', 'error'); return; }
  const w = stDealData.poWaiver; if (!w || w.status !== 'pending') return;
  if (!confirm('อนุมัติให้ "ข้ามการรับ PO" สำหรับดีลนี้? ระบบจะเปลี่ยนสถานะเป็น PO Received และออกเอกสารได้')) return;
  const previous = JSON.parse(JSON.stringify(stDealData));
  w.status = 'approved';
  w.approvedBy = (currentUser && (currentUser.displayName || currentUser.email)) || 'Approver';
  w.approvedAt = new Date().toISOString();
  _stTimeline('✅ อนุมัติให้ข้ามการรับ PO โดย ' + w.approvedBy, 'custpo');
  if (!await savePOWaiverChange(previous)) return;
  try {
    await updateListItem(CONFIG.lists.quotations, stQuoteId, { Status: 'PO Received' });   // ให้ downstream ปฏิบัติเหมือนได้รับ PO
    const q = quotesData.find(x => x.id === stQuoteId);
    if (q) q.Status = 'PO Received';
    const stBadge = document.getElementById('st-status-badge');
    if (stBadge) stBadge.innerHTML = '<span class="badge badge-poreceived" style="font-size:10px">📋 PO Received (ข้าม PO)</span>';
  } catch(e) { console.warn('status update', e.message); }
  renderCustPOTab(); renderSTTimeline(); renderQuotes();
  toast('อนุมัติข้าม PO แล้ว — ออกเอกสารได้', 'success');
}
async function rejectPOWaiver() {
  if (!(userRoles.isApprover || userRoles.isAdmin)) { toast('เฉพาะผู้อนุมัติเท่านั้น', 'error'); return; }
  const w = stDealData.poWaiver; if (!w || w.status !== 'pending') return;
  if (!confirm('ปฏิเสธคำขอข้าม PO นี้?')) return;
  const previous = JSON.parse(JSON.stringify(stDealData));
  _stTimeline('✕ ปฏิเสธคำขอข้ามการรับ PO โดย ' + ((currentUser && (currentUser.displayName || currentUser.email)) || 'Approver'), 'custpo');
  delete stDealData.poWaiver;
  if (!await savePOWaiverChange(previous)) return;
  renderCustPOTab(); renderSTTimeline();
  toast('ปฏิเสธคำขอแล้ว', 'success');
}
async function cancelPOWaiver() {
  const w = stDealData.poWaiver; if (!w || w.status !== 'pending') return;
  if (!confirm('ยกเลิกคำขอข้าม PO?')) return;
  const previous = JSON.parse(JSON.stringify(stDealData));
  delete stDealData.poWaiver;
  if (!await savePOWaiverChange(previous)) return;
  renderCustPOTab(); renderSTTimeline();
  toast('ยกเลิกคำขอแล้ว', 'success');
}
async function savePOWaiverChange(previous) {
  try { await saveSTDealData(true); return true; }
  catch(e) { stDealData = previous; renderCustPOTab(); renderSTTimeline(); return false; }
}

function renderPrintTab() {
  var el = document.getElementById('st-print-content');
  if (!el) return;
  var q = quotesData.find(function(x){ return x.id === stQuoteId; });
  var pos = stDealData.custPOs || [];
  var poRef = pos.length ? pos[0].poNumber : '-';
  var poDate = pos.length && pos[0].poDate ? fmtDate(pos[0].poDate) : '-';
  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">'
    + '<div style="padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--muted)">'
    + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px">'
    + '<span style="color:var(--muted)">ลูกค้า:</span><span style="color:var(--text);font-weight:500">'+(q?escHtml(q.ClientName||'-'):'-')+'</span>'
    + '<span style="color:var(--muted)">ใบเสนอราคา:</span><span style="color:var(--text);font-family:monospace">'+(q?escHtml(q.Title||'-'):'-')+'</span>'
    + '<span style="color:var(--muted)">เลข PO:</span><span style="color:var(--accent2);font-family:monospace;font-weight:600">'+escHtml(poRef)+'</span>'
    + '<span style="color:var(--muted)">วันที่ PO:</span><span style="color:var(--text)">'+poDate+'</span>'
    + '</div></div>'
    + '<button class="btn btn-primary" onclick="printInvoice()" style="width:100%;padding:12px;font-size:14px;border-radius:8px">🧾 Invoice / ใบกำกับภาษี</button>'
    + '<button class="btn" onclick="printDeliveryNote()" style="width:100%;padding:12px;font-size:14px;border-radius:8px;border:1px solid var(--border2)">📦 ใบส่งสินค้า</button>'
    + '</div>';
}

// แถวพิเศษ(หัวข้อกลุ่ม/หมายเหตุ/บรรทัดว่าง/ตัวแบ่งหน้า) — ไม่ใช่สินค้าจริง
function isMarkerItem(i) {
  const t = (i && i.Title) || '';
  return t === '__BLANK__' || t === '__PAGEBREAK__' || t === '__NOTE__' || t.startsWith('__GROUP__:');
}

async function getQuoteItemsForST() {
  try {
    const all = await getListItems(CONFIG.lists.quoteItems);
    return all.filter(function(i) { return String(i.QuoteID) === String(stQuoteId) && !isMarkerItem(i); });
  } catch(e) { return []; }
}

// ════════ เอกสาร PO ลูกค้า — ชุดเอกสาร (ออกทีละใบ) ════════
// 2 ชนิด: delivery = ใบส่งสินค้า/ใบแจ้งหนี้/ใบวางบิล (รวมใบเดียว), receipt = ใบเสร็จรับเงิน/ใบกำกับภาษี
// 3 สำเนา: customer(ต้นฉบับ-ลูกค้า) / acct(สำเนา-บัญชี) / company(สำเนา-บริษัท)
// ธีมสี: ส้ม | เลขที่: TIS-YYMM-NNN | หัว/โลโก้: Company Settings
const CUST_DOC_COPIES = {
  customer: { recip: 'ต้นฉบับลูกค้า',  original: true  },
  acct:     { recip: 'สำเนา (บัญชี)',  original: false },
  company:  { recip: 'สำเนาบริษัท',    original: false }
};

// เลขรันเอกสาร: ใช้เลขที่ Auto กำหนดไว้ (q._docSeq) — ถ้ายังไม่มี fallback เป็นเลขท้ายใบเสนอราคา
function custDocNo(q) {
  const seq = (q && q._docSeq != null) ? q._docSeq : ((String(q.Title || q.id || '').match(/(\d+)\s*$/) || [])[1] || 1);
  const tail = String(seq);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const bbbb = String(now.getFullYear() + 543);          // พ.ศ.
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  // รูปแบบกำหนดได้จากหน้าตั้งค่าบริษัท (Admin) — ค่าเริ่มต้น TIS-{YY}{MM}-{NO}
  const tpl = (typeof companySettings !== 'undefined' && companySettings.DocNoFormat) ? companySettings.DocNoFormat : 'TIS-{YY}{MM}-{NO}';
  return tpl
    .replace(/{YYYY}/g, yyyy).replace(/{YY}/g, yyyy.slice(2))
    .replace(/{BBBB}/g, bbbb).replace(/{BB}/g, bbbb.slice(2))
    .replace(/{MM}/g, mm).replace(/{DD}/g, dd)
    .replace(/{NNNN}/g, String(tail).padStart(4, '0'))
    .replace(/{NNN}/g, String(tail).padStart(3, '0'))
    .replace(/{NO}/g, tail);
}

// กำหนดเลขรันเอกสารแบบ Auto (0001, 0002, ...) ต่อ 1 ใบเสนอราคา — เก็บถาวรใน Settings, พิมพ์ซ้ำได้เลขเดิม
async function ensureCustDocSeq(q) {
  const key = 'CustDocNo_' + q.id;
  const cache = _settingsCache || [];
  const ex = cache.find(function(i){ return i.Title === key; });
  if (ex && ex.Value) return parseInt(ex.Value, 10);
  const cItem = cache.find(function(i){ return i.Title === 'CustDocCounter'; });
  const next = ((cItem && cItem.Value) ? parseInt(cItem.Value, 10) : 0) + 1;
  await saveSettingItem('CustDocCounter', String(next));   // เพิ่มตัวนับกลาง
  await saveSettingItem(key, String(next));                // ผูกเลขกับใบเสนอราคานี้ถาวร
  return next;
}

async function printCustomerDoc(kind, copy) {
  if (!copy) copy = document.getElementById('cpo-copy') ? document.getElementById('cpo-copy').value : 'customer';
  const q = quotesData.find(function(x){ return x.id === stQuoteId; });
  if (!q) { toast('ไม่พบข้อมูลใบเสนอราคา', 'error'); return; }
  toast('กำลังสร้างเอกสาร...', 'info');
  try { q._docSeq = await ensureCustDocSeq(q); } catch(e) { console.warn('doc seq', e.message); }
  if (typeof loadCustomers === 'function') { try { await loadCustomers(); } catch(e) {} }
  else if (typeof loadCustomerCodes === 'function') { loadCustomerCodes(); }
  _cdItemsCache = await getQuoteItemsForST();
  _cdQCache = q;
  openCDPreview(kind, copy);   // เปิดพรีวิวแยกซ้าย-ขวา (editor | เอกสารจริง)
}

// พรีวิวเอกสารในแอป (modal) — มีปุ่มพิมพ์/ปิดชัดเจน กดปิดครั้งเดียว ไม่กระทบหน้าหลัก
function printViaIframe(html) {
  const old = document.getElementById('_docOverlay'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = '_docOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.62);display:flex;flex-direction:column;align-items:center;padding:12px 0';
  const bar = document.createElement('div');
  bar.style.cssText = 'width:100%;max-width:900px;display:flex;justify-content:space-between;align-items:center;padding:0 6px 10px;gap:10px';
  bar.innerHTML = '<div style="color:#fff;font-size:13px;font-weight:600">พรีวิวเอกสาร</div>';
  const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px';
  const printBtn = document.createElement('button');
  printBtn.textContent = '🖨 พิมพ์ / บันทึก PDF';
  printBtn.style.cssText = 'padding:8px 18px;background:#17356b;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ ปิด';
  closeBtn.style.cssText = 'padding:8px 16px;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer';
  btns.appendChild(printBtn); btns.appendChild(closeBtn); bar.appendChild(btns); ov.appendChild(bar);
  const f = document.createElement('iframe');
  f.id = '_printFrame';
  f.style.cssText = 'width:100%;max-width:900px;flex:1;min-height:0;border:none;border-radius:8px;background:#fff;box-shadow:0 12px 44px rgba(0,0,0,0.45)';
  ov.appendChild(f);
  document.body.appendChild(ov);
  f.srcdoc = html;
  function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  printBtn.onclick = function() {
    // เปิดเอกสารในแท็บใหม่ แล้วสั่งพิมพ์จากแท็บนั้น (แยกจากหน้าหลักสนิท)
    const w = window.open('', '_blank');
    if (!w) { if (typeof toast === 'function') toast('เบราว์เซอร์บล็อกป๊อปอัป — โปรดอนุญาตป๊อปอัปแล้วลองใหม่', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function() { try { w.focus(); w.print(); } catch(e) {} }, 500);
  };
  closeBtn.onclick = close;
  ov.addEventListener('mousedown', function(e) { if (e.target === ov) close(); });   // คลิกพื้นหลัง = ปิด
  document.addEventListener('keydown', onKey);
}

function buildCustomerDocHTML(kind, copyKey, q, items, po, co, manual, referNote) {
  const NAVY = co.PrimaryColor || '#17356b';
  // ── ชื่อ/ที่อยู่ลูกค้าภาษาอังกฤษสำหรับเอกสารสำคัญ (ถ้ากรอกไว้ในทะเบียนลูกค้า) ──
  // SOLD TO = ชื่อไทยจากทะเบียนลูกค้า (จับคู่จากชื่อไทย/EN) ถ้าหาไม่เจอใช้ชื่อบนใบ
  const DOC_CLIENT = ((typeof customerThaiNameByAny === 'function' && customerThaiNameByAny(q.ClientName, q.CustomerTaxID)) || q.ClientName || '');
  const DOC_ADDR   = (q.CustomerAddress || '');   // ADDRESS = ภาษาไทยเสมอ
  // ── หัวบริษัท Fix ตายตัว (ยกเว้นโลโก้ดึงจาก Company Settings) ──
  const CO_NAME_TH = 'บริษัท ไอที เซอร์วิสเซส จำกัด';
  const CO_NAME_EN = 'IT SERVICES CO.,LTD.';
  const CO_ADDR_TH_L = 'สำนักงานใหญ่', CO_ADDR_TH_V = 'เลขที่ 78 หมู่ 11 ตำบล ผาเลือด อำเภอ ท่าปลา จังหวัด อุตรดิตถ์ 53190';
  const CO_ADDR_EN_L = 'HEAD OFFICE', CO_ADDR_EN_V = 'No. 78, Moo 11, Pha Lueat Subdistrict, Tha Pla District, Uttaradit Province';
  const CO_TEL = '065-262-9886', CO_TAXID = '0105559006113';
  const F_TH = "'Sarabun','Segoe UI',sans-serif";                        // ฟอนต์เดิมทั้งเอกสาร (Sarabun)
  const F_EN = "'Sarabun','Segoe UI',sans-serif";
  const F_NUM = "'Sarabun','Segoe UI',sans-serif";
  const F_HEAD = "'Leelawadee UI','Tahoma','Angsana New',sans-serif";    // ยกเว้น: ชื่อบริษัทหัวเอกสาร (ตัวหนาตามรูป)
  const F_ADDR = "'Angsana New','Sarabun',serif";                        // ที่อยู่บริษัทหัวเอกสาร: Angsana New
  const copy = CUST_DOC_COPIES[copyKey] || CUST_DOC_COPIES.customer;
  const today = fmtDate(new Date());
  // เลขเอกสาร: ใบเสร็จใช้ RV แทน IV (ชนิดอื่นคงเดิม)
  let docNo = custDocNo(q);
  if (kind === 'receipt') docNo = docNo.replace(/IV/i, 'RV');
  // สินค้าเป็น Hardware → เลขเอกสารใช้ TAX แทน IV/RV
  if (manual && manual.hardware) docNo = docNo.replace(/IV|RV/i, 'TAX');
  const poRef = po.poNumber || q.PONumber || '-';
  const isReceipt = kind === 'receipt';
  const isTax = kind === 'tax';
  const noPrice = kind === 'tempdelivery';
  const notTax = !isTax;   // ใบที่ไม่ใช่ใบกำกับภาษี ให้ขึ้นป้าย "ไม่ใช่ใบกำกับภาษี"
  const titles = {
    tax:          ['ใบกำกับภาษี', 'TAX INVOICE'],
    receipt:      ['ใบเสร็จรับเงิน', 'RECEIPT'],
    delivery:     ['ใบส่งของ / ใบแจ้งหนี้', 'DELIVERY ORDER / INVOICE'],
    tempdelivery: ['ใบส่งของชั่วคราว', 'TEMPORARY DELIVERY NOTE']
  };
  const [titleTh, titleEn] = titles[kind] || titles.delivery;
  const fmt2 = n => Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc = s => escHtml(s);
  // จำนวนเงินโหมด Manual: ถ้าเป็นตัวเลข → จัดรูปแบบ 1,000.00 ; ถ้าเป็นข้อความ (เช่น Included, -) → แสดงตามเดิม
  const _fmtAmt = v => { const s=String(v==null?'':v).trim(); if(s===''){return '';} const n=parseFloat(s.replace(/,/g,'')); return (isFinite(n) && /^-?[\d,]*\.?\d*$/.test(s)) ? fmt2(n) : esc(s); };

  // แถวรายการ + เติมแถวว่างให้ตารางเต็มหน้า
  const cellB = 'border-right:1px solid '+NAVY+'55;';
  const _isGN = r => r.t==='group' || r.t==='note';
  const _mHas = r => _isGN(r) ? String(r.name||r.desc||'').trim()!=='' : ['no','pn','name','desc','qty','unit','price','amount'].some(f => String(r[f]||'').trim());
  const _manualRows = (manual && manual.on && Array.isArray(manual.rows)) ? manual.rows.filter(_mHas) : [];
  const _manualOn = _manualRows.length > 0;
  // ยอดเงิน: โหมด Manual คิดยอดจากคอลัมน์ "จำนวนเงิน" ที่กรอกเอง (ข้อความ/ว่าง = 0) — ไม่งั้นคิดจากใบเสนอราคา
  const _amtNum = v => { const s=String(v==null?'':v).trim(); if(s===''||!/^-?[\d,]*\.?\d*$/.test(s)) return 0; const n=parseFloat(s.replace(/,/g,'')); return isFinite(n)?n:0; };
  const subTotal = _manualOn
    ? _manualRows.reduce((s,r)=> s + (_isGN(r)?0:_amtNum(r.amount)), 0)
    : items.reduce((s,it)=>{ const d=parseFloat(it.DiscountPct||0)/100; return s + parseFloat(it.Quantity||0)*parseFloat(it.UnitPrice||0)*(1-d); }, 0);
  const vatAmt = subTotal * 0.07;
  const grand = subTotal + vatAmt;
  const bahtWords = (typeof bahtText === 'function') ? bahtText(grand) : '';

  // ── คอลัมน์ตาราง (ซ่อน/แสดง + ความกว้าง) — ตั้งค่าจากพรีวิว, เก็บใน manual.cols ──
  const _cfg = (manual && manual.cols && typeof manual.cols==='object') ? manual.cols : {vis:{},w:{}};
  const _cvis = (_cfg.vis||{}), _cw = (_cfg.w||{});
  const _colVis = c => c.always ? true : (c.priceCol ? !noPrice : (c.opt ? _cvis[c.k]===true : _cvis[c.k]!==false));
  const visCols = CUST_DOC_COLS.filter(_colVis);
  const _colW = c => { if(c.flex) return null; return (_cw[c.k]!=null&&_cw[c.k]!=='')?+_cw[c.k]:c.w; };
  const _lastK = visCols.length ? visCols[visCols.length-1].k : '';
  const _bR = c => (c.k===_lastK ? '' : cellB);

  // สร้าง td รายการ 1 แถว ตามคอลัมน์ที่แสดง (vals = {seq,pn,name,qty,unit,price,amt})
  const _itemTds = vals => visCols.map(c => {
    let v='', align='left', ff='', wsp='nowrap';
    if (c.k==='seq'){ v=vals.seq; align='center'; }
    else if (c.k==='pn'){ v=vals.pn; align='center'; ff='font-family:'+F_NUM+';'; }
    else if (c.k==='name'){ v=vals.name; align='left'; wsp='normal'; }
    else if (c.k==='qty'){ v=vals.qty; align='center'; }
    else if (c.k==='unit'){ v=vals.unit; align='center'; }
    else if (c.k==='price'){ v=vals.price; align='right'; ff='font-family:'+F_NUM+';'; }
    else if (c.k==='amt'){ v=vals.amt; align='right'; ff='font-family:'+F_NUM+';'; }
    return '<td style="padding:5px 8px;text-align:'+align+';'+ff+_bR(c)+'white-space:'+wsp+'">'+v+'</td>';
  }).join('');

  // rowArr = อาเรย์ของ <tr> (เพื่อแบ่งหน้าได้), markSeq = เลขลำดับที่แสดงของแต่ละ index (ใช้โชว์ในเครื่องมือแบ่งหน้า)
  let rowArr;
  if (_manualOn) {
    // โหมด Manual: กรอกรายการเองทีละคอลัมน์ (item/กลุ่ม/หมายเหตุ) — ยอดรวม/VAT/รวมทั้งสิ้น คิดจากคอลัมน์จำนวนเงินที่กรอกเอง
    let _auto = 0;
    rowArr = _manualRows.map(r => {
      if (r.t==='group') {
        const al = r.align||'left';
        return '<tr><td colspan="'+visCols.length+'" style="padding:6px 10px;font-weight:700;text-align:'+al+';background:'+NAVY+'0d;color:'+NAVY+'">'+esc(r.name||r.desc||'')+'</td></tr>';
      }
      if (r.t==='note') {
        return '<tr><td colspan="'+visCols.length+'" style="padding:5px 10px;line-height:1.5">'+(r.name?'<b>'+esc(r.name)+'</b> ':'')+'<span style="white-space:pre-line">'+esc(r.desc||'')+'</span></td></tr>';
      }
      _auto++;
      const nm = esc(r.name||''), ds = esc(r.desc||'');
      // ถ้าไม่มี name (แถวที่กรอกจากกล่องเดิมซึ่งใช้ desc เป็นบรรทัดหลัก) → ใช้ desc เป็นบรรทัดหลัก
      const nameCell = nm
        ? ('<div style="font-weight:500">'+nm+'</div>' + (ds?'<div style="font-size:10px;color:#555;margin-top:2px;white-space:pre-line;line-height:1.5">'+ds+'</div>':''))
        : (ds?'<div style="white-space:pre-line;line-height:1.5">'+ds+'</div>':'');
      return '<tr style="vertical-align:top">'+_itemTds({
        seq:  (r.no!=null && String(r.no)!=='') ? esc(r.no) : String(_auto),   // กรอกเอง (รวมช่องว่าง) = ตามนั้น, ไม่กรอก = อัตโนมัติ
        pn:   esc(r.pn||''),
        name: nameCell,
        qty:  esc(r.qty||''),
        unit: esc(r.unit||''),
        price:_fmtAmt(r.price),
        amt:  _fmtAmt(r.amount)
      })+'</tr>';
    });
  } else {
    rowArr = items.map((it,i)=>{
      const d=parseFloat(it.DiscountPct||0)/100, line=parseFloat(it.Quantity||0)*parseFloat(it.UnitPrice||0)*(1-d);
      const nameCell = '<div style="font-weight:500">'+esc(it.Title||it.Description||'-')+'</div>'
        + ((it.Description&&it.Title)?'<div style="font-size:10px;color:#555;margin-top:2px;white-space:pre-line;line-height:1.5">'+esc(it.Description)+'</div>':'');
      return '<tr style="vertical-align:top">'+_itemTds({
        seq:  (i+1),
        pn:   esc(it.PartNumber||it.PartNo||it.Code||it.ProductCode||''),
        name: nameCell,
        qty:  fmt2(it.Quantity||0),
        unit: esc(it.Unit||it.UnitName||''),
        price:fmt2(it.UnitPrice||0),
        amt:  fmt2(line)
      })+'</tr>';
    });
  }
  // จุดขึ้นหน้าใหม่ (เก็บ index ของแถวที่จะตัดหน้าหลังแถวนั้น) — เก็บใน manual.breaks
  const _breaks = (manual && Array.isArray(manual.breaks)) ? manual.breaks.slice().filter(n=>n>=0&&n<rowArr.length) : [];
  const rowPages = [[]];
  rowArr.forEach((tr,idx)=>{ rowPages[rowPages.length-1].push(tr); if(_breaks.indexOf(idx)>=0) rowPages.push([]); });
  // แถว filler ที่ "ดิ้น" ยืดเต็มพื้นที่ที่เหลือ (height:100%) — ดันยอดรวมไปชิดล่าง เส้นคอลัมน์ต่อเนื่อง
  // E.&O.E. อยู่ล่างสุดของคอลัมน์ "รายการ/DESCRIPTION" (ไม่แยกเป็นแถวเต็มความกว้าง)
  const _refNote = String(referNote||'').trim();
  const fillerRow = '<tr style="height:100%">'+visCols.map(c => {
    if (c.k==='name') {
      return '<td style="'+_bR(c)+'vertical-align:bottom;padding:0 10px 4px">'
        +(_refNote?'<div style="text-align:left;font-size:12px;color:#1a1a2e;margin-bottom:5px;white-space:pre-line;line-height:1.5">'+esc(_refNote)+'</div>':'')
        +'<div style="text-align:center;font-size:10px;color:#777">ผิด ตก ยกเว้น E. &amp; O.E.</div></td>';
    }
    return '<td style="'+_bR(c)+'">&nbsp;</td>';
  }).join('')+'</tr>';

  const colspanFull = noPrice ? 3 : 5;
  const logoHtml = (co.LogoURL||co.LogoBase64) ? '<img src="'+(co.LogoBase64||co.LogoURL)+'" style="max-height:85px;max-width:115px;object-fit:contain"/>' : '';

  // กล่องหัวข้อ (ป้ายสำเนา + เอกสารออกเป็นชุด + ไม่ใช่ใบกำกับภาษี)
  const copyBox = '<div style="text-align:right;flex-shrink:0;white-space:nowrap">'
    +'<div style="display:inline-block;background:'+NAVY+';color:#fff;border-radius:16px;padding:6px 22px;font-weight:700;font-size:15px;white-space:nowrap">'+copy.recip+'</div>'
    +'<div style="margin-top:6px">'
    +(notTax?'<div style="color:#c0392b;font-size:10px;line-height:1.2">ไม่ใช่ใบกำกับภาษี</div>':'')
    +'<div style="color:#888;font-size:10px;line-height:1.2">เอกสารออกเป็นชุด</div>'
    +'</div></div>';

  // กล่องข้อมูลด้านขวา (วันที่/เงื่อนไข/พนักงานขาย/PO) — กรอบมน
  const termsVal = q.PaymentDueDate ? fmtDate((q.PaymentDueDate+'').split('T')[0]) : (q.PaymentMethod||'');   // กำหนดชำระ = วันที่ครบกำหนด
  // ป้ายไทยบรรทัดบน / อังกฤษ+ค่าบรรทัดล่าง (ช่องไฟแคบ ประหยัดแนวนอน) เหมือนฟอร์มจริง
  const infoRow = (th,en,val,first) => '<div style="padding:4px 9px;'+(first?'':'border-top:1px solid '+NAVY+'55')+'">'
    +'<div style="font-family:'+F_TH+';font-size:11px;font-weight:700;line-height:1.1">'+th+'</div>'
    +'<div style="line-height:1.15"><span style="font-family:'+F_EN+';font-size:10px;letter-spacing:-0.3px;color:#555">'+en+' :</span> <span style="font-family:'+F_TH+';font-size:11px">'+esc(val)+'</span></div></div>';
  const infoBox = '<div style="border:1px solid '+NAVY+';border-radius:8px;overflow:hidden">'
    + infoRow('วันที่','DATE',today,true)
    + infoRow('กำหนดชำระเงิน','TERMS',termsVal)
    + infoRow('พนักงานขาย','SALESMAN',q.SaleName||'')
    + infoRow('ใบสั่งซื้อเลขที่','P/O NO.',poRef)
    + '</div>';

  // ── footer (ต่างกันตามชนิด) — ปรับให้ตรงฟอร์มจริง ──
  const SIGBOX = 'flex:1;border:1px solid '+NAVY+';border-radius:8px;padding:8px 10px;font-size:10px;display:flex;flex-direction:column;min-height:120px';
  const DASH = '<span style="color:#999;letter-spacing:1px">.................</span>';
  const DATELINE = '<div style="margin-top:8px;display:flex;align-items:flex-end;font-family:'+F_TH+';font-size:10px;white-space:nowrap">'
    +'<span>วันที่&nbsp;<span style="font-family:'+F_EN+'">DATE</span>&nbsp;</span>'
    +'<span style="flex:1;border-bottom:1px dotted #999;margin:0 3px"></span>/'
    +'<span style="flex:1;border-bottom:1px dotted #999;margin:0 3px"></span>/'
    +'<span style="flex:1;border-bottom:1px dotted #999;margin:0 3px"></span>'
    +'</div>';
  // ป้ายกำกับสองภาษา (ไทยบรรทัดบน / อังกฤษบรรทัดล่าง)
  const lbl2 = (th,en) => '<span style="display:inline-block;vertical-align:top;line-height:1.05"><span style="font-family:'+F_TH+';font-size:11px">'+th+'</span><br><span style="font-family:'+F_EN+';font-size:9px;color:#555">'+en+'</span></span>';
  const chkbox = '<span style="display:inline-block;width:12px;height:12px;border:1.2px solid #333;vertical-align:top;margin-right:5px"></span>';
  // ช่องผู้มีอำนาจลงนาม (ใช้ทั้งใบเสร็จ/ใบส่งของ) — ชื่อบริษัทบน / เว้นที่เซ็น / เส้นประ + ป้ายชิดขวา
  const authBox = '<div style="'+SIGBOX+';text-align:center">'
    +'<div style="white-space:nowrap"><span style="font-family:'+F_TH+';font-size:11px">ในนาม</span> <b style="font-family:'+F_TH+';font-weight:700;color:'+NAVY+';font-size:12px">'+CO_NAME_TH+'</b></div>'
    +'<div style="white-space:nowrap"><span style="font-family:'+F_EN+';font-size:9px;color:#555">FOR</span> <b style="font-family:'+F_EN+';font-weight:700;color:'+NAVY+';font-size:11px">'+CO_NAME_EN+'</b></div>'
    +((co.SignatureURL||co.SignatureBase64)?'<div style="flex:1;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px"><img src="'+(co.SignatureBase64||co.SignatureURL)+'" style="max-height:36px;object-fit:contain"/></div>':'<div style="flex:1"></div>')
    +'<div style="border-top:1px dotted #999;text-align:center;padding-top:4px;color:#555">ผู้มีอำนาจลงนาม / AUTHORIZED SIGNATURE</div></div>';
  let footer;
  if (isReceipt) {
    footer = '<div style="display:flex;gap:10px;align-items:stretch">'
      +'<div style="'+SIGBOX.replace('flex:1','flex:2')+'">'
      +'<div style="font-size:9px;color:#555;margin-bottom:8px;line-height:1.3"><span style="font-family:'+F_TH+';font-size:10px;color:#333">ใบเสร็จรับเงินทุกฉบับจะสมบูรณ์ต่อเมื่อ มีลายเซ็นต์ของผู้รับเงินและเมื่อขึ้นเงินตามเช็คได้แล้ว</span><br>THIS RECEIPT WILL BE VALID UNLESS PROPERLY SIGNED BY CASHIER AND THE CHEQUE IS HONOURED BY THE BANK.</div>'
      +'<div style="font-family:'+F_TH+';font-size:11px;margin-bottom:8px">ชำระโดย</div>'
      +'<div style="display:flex;gap:30px;align-items:flex-start">'
      +'<span>'+chkbox+lbl2('เงินสด','CASH')+'</span>'
      +'<span>'+chkbox+lbl2('เช็ค','CHEQUE')+'</span>'
      +'<span>'+lbl2('เลขที่','NO.')+' <span style="vertical-align:top">'+DASH+DASH+'</span></span>'
      +'</div>'
      +'<div style="display:flex;gap:18px;align-items:flex-end;margin-top:12px">'
      +'<span>'+lbl2('ธนาคาร','BANK')+' <span style="vertical-align:top">'+DASH+DASH+'</span></span>'
      +'<span>'+lbl2('วันที่','DATE')+' <span style="vertical-align:top">'+DASH+'</span></span>'
      +'<span style="margin-left:auto">'+lbl2('ผู้รับเงิน','COLLECTOR')+' <span style="vertical-align:top">'+DASH+DASH+'</span></span>'
      +'</div>'
      +'<div style="flex:1"></div></div>'
      +authBox+'</div>';
  } else {
    // ช่องผู้รับของ / ผู้ส่งของ: เว้นที่เซ็น → เส้นประ → ป้ายกึ่งกลาง → วันที่ล่างซ้าย
    const recvBox = (topHtml,label) => '<div style="'+SIGBOX+';text-align:center">'
      +(topHtml?'<div style="line-height:1.25;text-align:center">'+topHtml+'</div>':'')
      +'<div style="flex:1"></div>'
      +'<div style="border-top:1px dotted #999;text-align:center;padding-top:4px;color:#555">'+label+'</div>'
      +DATELINE+'</div>';
    footer = '<div style="display:flex;gap:10px;align-items:stretch">'
      +recvBox('<span style="font-family:'+F_TH+';font-size:11px;white-space:nowrap">ได้รับสินค้าระบุไว้ข้างต้นถูกต้องเรียบร้อยแล้ว</span><br><span style="font-family:'+F_EN+';font-size:8px;color:#555;white-space:nowrap">RECEIVED THE ABOVE IN GOOD ORDER AND CONDITION.</span>','<span style="font-family:'+F_TH+';font-size:11px">ผู้รับของ (ลงนามประทับตรา)</span>')
      +recvBox('','<span style="font-family:'+F_TH+';font-size:11px">ผู้ส่งของ / <span style="font-family:'+F_EN+'">SENDER</span></span>')
      +authBox+'</div>';
  }

  // หมายเหตุ/การชำระเงิน/AMOUNT — จัดเป็น 3 คอลัมน์ (หัวข้อ | : | เนื้อหา) ให้ ":" และตัวหนังสือตรงกันทุกบรรทัด
  const _ntRow = (label,val) => '<tr><td style="vertical-align:top;white-space:nowrap;font-weight:600;padding:0">'+label+'</td><td style="vertical-align:top;padding:0 5px">:</td><td style="vertical-align:top;padding:0">'+val+'</td></tr>';
  const NOTE_TERMS = '<table style="border-collapse:collapse;width:100%;font-size:10px;line-height:1.5;color:#333">'
    + _ntRow('หมายเหตุ', '<b>สินค้าจำหน่ายแล้วไม่รับเปลี่ยนคืน</b>')
    + _ntRow('การชำระเงิน', 'โปรดชำระเงินด้วยเช็คขีดคร่อมในนาม <b>'+CO_NAME_TH+'</b> บัญชีที่ค้างกำหนดชำระบริษัทฯ จะคิดดอกเบี้ยในอัตรา 2% ต่อเดือน สินค้าตามใบส่งของนี้แม้จะได้ส่งมอบแก่ผู้ซื้อแล้วก็ยังคงเป็นทรัพย์สินของผู้ขายอยู่จนกว่าผู้ซื้อจะได้ชำระราคาเสร็จเรียบร้อยแล้ว และหากการชำระราคาสินค้าเป็นเช็ค การซื้อ-ขายนี้จะสมบูรณ์ต่อเมื่อเช็คสามารถเรียกเก็บเงินจากธนาคารได้เรียบร้อยแล้วเท่านั้น')
    + '</table>';

  // ── totals block (ขวาล่าง) ──
  const totLabel = (th,en)=>'<td style="background:'+NAVY+';color:#fff;padding:5px 10px;font-size:11px;border:1px solid '+NAVY+'"><b>'+th+'</b> '+en+'</td>';
  const totVal = v=>'<td style="border:1px solid '+NAVY+';padding:5px 10px;text-align:right;font-family:'+F_NUM+';min-width:110px">'+v+'</td>';
  const totalsBox = noPrice ? '' :
    '<table style="border-collapse:collapse;width:100%;font-size:12px">'
    +'<tr>'+totLabel('รวมเงิน','TOTAL')+totVal(fmt2(subTotal))+'</tr>'
    +'<tr>'+totLabel('ภาษีมูลค่าเพิ่ม','PLUS VAT')+totVal(fmt2(vatAmt))+'</tr>'
    +'<tr>'+totLabel('ยอดเงินสุทธิ','GRAND TOTAL')+'<td style="border:1px solid '+NAVY+';padding:6px 10px;text-align:right;font-family:'+F_NUM+';font-weight:700;font-size:14px">'+fmt2(grand)+'</td></tr>'
    +'</table>';

  // ── ส่วนหัว (ซ้ำทุกหน้า) ──
  const COMPANY_HEADER = '<div style="position:relative;display:flex;align-items:flex-start;gap:12px">'
    +logoHtml
    +'<div style="flex:1;min-width:0">'
    +(co.HeaderNameImage
      ? '<img src="'+co.HeaderNameImage+'" style="'+(co.HeaderNameW?('width:'+(+co.HeaderNameW)+'px;'):'')+(co.HeaderNameH?('height:'+(+co.HeaderNameH)+'px;'):'height:auto;')+((co.HeaderNameW&&co.HeaderNameH)?'object-fit:fill;':'object-fit:contain;')+'display:block"/>'
      : '<div style="display:inline-block">'
        +'<div class="_cnTh" style="font-family:'+F_HEAD+';font-size:21px;font-weight:700;color:'+NAVY+';line-height:1.1;letter-spacing:-0.3px;white-space:nowrap">'+CO_NAME_TH+'</div>'
        +'<div class="_cnEn" style="font-family:'+F_HEAD+';font-size:16px;font-weight:700;color:'+NAVY+';line-height:1.15;white-space:nowrap;-webkit-text-stroke:0.35px '+NAVY+'">'+CO_NAME_EN+'</div>'
        +'</div>')
    +'<table style="border-collapse:collapse;margin-top:3px;font-family:'+F_ADDR+'"><tbody>'
    +'<tr><td style="font-size:17px;color:#222;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_TH_L+'</td><td style="font-size:17px;color:#222;vertical-align:top;padding:0 5px;line-height:1.1">:</td><td style="font-size:17px;color:#222;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_TH_V+'</td></tr>'
    +'<tr><td style="font-size:17px;color:#333;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_EN_L+'</td><td style="font-size:17px;color:#333;vertical-align:top;padding:0 5px;line-height:1.1">:</td><td style="font-size:17px;color:#333;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_EN_V+'</td></tr>'
    +'</tbody></table>'
    +'<div style="font-family:'+F_ADDR+';font-size:17px;color:#333;margin-top:2px">TEL. '+CO_TEL+'</div>'
    +'</div>'
    +'<div style="position:absolute;top:0;right:0">'+copyBox+'</div></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-end;margin:8px 0 10px">'
    +'<div style="font-size:11px;color:#1a1a2e">เลขประจำตัวผู้เสียภาษีอากร '+CO_TAXID+'</div>'
    +'<div style="background:'+NAVY+';color:#fff;border-radius:16px;padding:6px 22px;text-align:center"><div style="font-size:15px;font-weight:700">'+esc(titleTh)+'</div><div style="font-size:9px;letter-spacing:0.05em">'+titleEn+'</div></div>'
    +'<div style="font-size:11px;text-align:right"><b>เลขที่</b><br>NO. '+esc(docNo)+'</div>'
    +'</div>'
    +'<div style="display:flex;gap:10px;margin-bottom:8px;align-items:stretch">'
    +'<div style="flex:1.5;border:1px solid '+NAVY+';border-radius:8px;padding:8px 10px">'
    +'<table style="border-collapse:collapse;width:100%">'
    +'<tr><td colspan="3" style="font-family:'+F_TH+';font-size:11px;font-weight:700;line-height:1.1;padding:0">นามผู้ซื้อ</td></tr>'
    +'<tr><td style="vertical-align:top;width:58px;font-family:'+F_EN+';font-size:10px;letter-spacing:-0.3px;color:#555;padding:0">SOLD TO</td><td style="vertical-align:top;color:#555;padding:0 4px 0 0">:</td><td style="vertical-align:top;font-family:'+F_TH+';font-size:11px;font-weight:600;padding:0">'+esc(DOC_CLIENT)+'</td></tr>'
    +'<tr><td colspan="3" style="font-family:'+F_TH+';font-size:11px;font-weight:700;line-height:1.1;padding:5px 0 0">ที่อยู่</td></tr>'
    +'<tr><td style="vertical-align:top;font-family:'+F_EN+';font-size:10px;letter-spacing:-0.3px;color:#555;padding:0">ADDRESS</td><td style="vertical-align:top;color:#555;padding:0 4px 0 0">:</td><td style="vertical-align:top;font-family:'+F_TH+';font-size:11px;line-height:1.35;padding:0">'+esc(DOC_ADDR)+'</td></tr>'
    +(q.CustomerTaxID?'<tr><td colspan="3" style="padding:5px 0 0;font-size:10px;color:#555;font-family:'+F_TH+'">เลขประจำตัวผู้เสียภาษี : '+esc(q.CustomerTaxID)+'</td></tr>':'')
    +'</table>'
    +'</div>'
    +'<div style="flex:1">'+infoBox+'</div></div>';
  // thead (ซ้ำทุกหน้า) + totals (หน้าสุดท้าย)
  const tableHead = '<colgroup>'+visCols.map(c=>'<col'+(c.flex?'':' style="width:'+_colW(c)+'px"')+'>').join('')+'</colgroup>'
    +'<thead><tr style="background:'+NAVY+';color:#fff;font-size:11px">'
    +visCols.map(c=>'<th style="padding:6px 8px;'+(c.k===_lastK?'':'border-right:1px solid #fff5')+'">'+c.th+'<br><span style="font-weight:400;font-size:9px">'+c.en+'</span></th>').join('')
    +'</tr></thead>';
  const totalsRows = noPrice
    ? '<tr><td colspan="'+visCols.length+'" style="border:1px solid '+NAVY+';padding:8px 10px;font-size:10px;line-height:1.55;color:#333;vertical-align:top">'+NOTE_TERMS+'</td></tr>'
    : '<tr>'
      +'<td colspan="'+(visCols.length-2)+'" rowspan="3" style="border:1px solid '+NAVY+';padding:8px 10px;vertical-align:top">'+NOTE_TERMS+'<div style="margin-top:8px;font-size:11px;border-top:1px solid '+NAVY+'55;padding-top:5px;text-align:center;font-weight:600">'+esc(bahtWords)+'</div></td>'
      +'<td style="background:'+NAVY+';color:#fff;border:1px solid '+NAVY+';padding:6px 10px;font-size:11px"><b>รวมเงิน</b> TOTAL</td>'
      +'<td style="border:1px solid '+NAVY+';padding:6px 10px;text-align:right;font-family:'+F_NUM+'">'+fmt2(subTotal)+'</td></tr>'
      +'<tr><td style="background:'+NAVY+';color:#fff;border:1px solid '+NAVY+';padding:6px 10px;font-size:11px"><b>ภาษีมูลค่าเพิ่ม</b> PLUS VAT</td>'
      +'<td style="border:1px solid '+NAVY+';padding:6px 10px;text-align:right;font-family:'+F_NUM+'">'+fmt2(vatAmt)+'</td></tr>'
      +'<tr><td style="background:'+NAVY+';color:#fff;border:1px solid '+NAVY+';padding:7px 10px;font-size:11px"><b>ยอดเงินสุทธิ</b> GRAND TOTAL</td>'
      +'<td style="border:1px solid '+NAVY+';padding:7px 10px;text-align:right;font-family:'+F_NUM+';font-weight:700;font-size:14px">'+fmt2(grand)+'</td></tr>';
  // ประกอบหลายหน้า — header ซ้ำทุกหน้า, filler ดันเนื้อหาเต็มหน้า, totals+footer เฉพาะหน้าสุดท้าย
  const nP = rowPages.length;
  const pagesHtml = rowPages.map(function(prows, pi){
    const isLast = pi===nP-1;
    const body = prows.join('') + fillerRow + (isLast ? totalsRows : '');
    const pageLabel = nP>1 ? '<div style="text-align:right;color:#888;font-size:10px;margin-top:4px">หน้า '+(pi+1)+' / '+nP+'</div>' : '';
    return '<div class="cd-page">'
      + COMPANY_HEADER
      + '<div style="flex:1;border:1px solid '+NAVY+';border-radius:10px;overflow:hidden;display:flex;flex-direction:column">'
      + '<table style="width:100%;flex:1;border-collapse:collapse;table-layout:fixed">'+tableHead+'<tbody>'+body+'</tbody></table>'
      + '</div>'
      + (isLast ? '<div class="doc-foot" style="margin-top:12px">'+footer+'</div>' : '')
      + pageLabel
      + '</div>';
  }).join('');

  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"/>'
    +'<title>'+esc(titleTh)+' '+docNo+'</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Sarabun","Segoe UI",sans-serif;font-size:12px;color:#1a1a2e;background:#e5e7eb}'
    +'.cd-page{background:#fff;padding:10mm;min-height:287mm;display:flex;flex-direction:column;page-break-after:always;break-after:page}'
    +'.cd-page:last-of-type{page-break-after:auto;break-after:auto}thead{display:table-header-group}tr{page-break-inside:avoid}.doc-foot{page-break-inside:avoid}'
    +'@media screen{.cd-page{width:210mm;max-width:100%;margin:0 auto 10px;box-shadow:0 2px 14px rgba(0,0,0,.18)}}'
    +'@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:0}button{display:none!important}.no-print{display:none!important}.cd-page{box-shadow:none;margin:0}}</style>'
    +'</head><body>'+pagesHtml
    +'<div class="no-print" style="text-align:center;margin:4px auto 18px;max-width:210px"><button onclick="window.print()" style="padding:8px 24px;background:'+NAVY+';color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨 พิมพ์ / บันทึก PDF</button></div>'
    // ปรับความยาวชื่อบริษัท 2 แถวให้เสมอกัน (ทุกหน้า): ยืด letter-spacing ของอังกฤษให้เท่าความกว้างของไทย
    +'<script>(function(){function eq(){var ths=document.querySelectorAll("._cnTh"),ens=document.querySelectorAll("._cnEn");for(var k=0;k<ths.length;k++){var th=ths[k],en=ens[k];if(!th||!en)continue;en.style.letterSpacing="0px";var t=th.getBoundingClientRect().width,e=en.getBoundingClientRect().width,n=(en.textContent||"").length;if(n>1){var ls=(t-e)/(n-1);if(ls<-0.6)ls=-0.6;if(ls>6)ls=6;en.style.letterSpacing=ls+"px";}}}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(eq);}eq();setTimeout(eq,120);})();<\/script>'
    +'</body></html>';
}


// Override openSaleTrackerModal เพื่อ apply visibility หลัง render
function openSaleTrackerModal(id) {
  stQuoteId = id;
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  stDealData = parseDealStatus(q.DealStatus);
  stPendingDocs = []; stCurrentSlipFile = null;
  const techList = document.getElementById('tech-job-list'); if (techList) techList.innerHTML = '';
  // Clear pending docs UI

  document.getElementById('st-title').textContent = (q.Title||'') + ' — ' + (q.ClientName||'');
  const badge = document.getElementById('st-status-badge');
  if (badge) {
    const _isPaid = (q.PaidAmount||0) >= (q.TotalAmount||1) && (q.TotalAmount||0) > 0;
    const _canClose = canManageSaleActions(q) && (q.Status === 'Approved' || q.Status === 'PO Received') && !stDealData.closed && q.Status !== 'Closed';
    if (stDealData.closed || q.Status === 'Closed') {
      badge.innerHTML = '<span class="badge badge-approved" style="font-size:10px">✓ ปิดการขายแล้ว</span>';
    } else if (_isPaid && _canClose) {
      badge.innerHTML = '<button class="btn btn-sm btn-success" onclick="confirmCloseDeal()" style="font-size:11px;padding:4px 10px">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>' +
        'ปิดการขาย</button>';
    } else {
      badge.innerHTML = '<span class="badge badge-pending" style="font-size:10px">กำลังดำเนินการ</span>';
    }
  }

  const av = document.getElementById('st-user-avatar');
  if (av) av.textContent = (currentUser?.displayName || 'U')[0].toUpperCase();

  const _v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  _v('st-pay-amount',''); _v('st-pay-date', new Date().toISOString().split('T')[0]); _v('st-pay-ref',''); _v('st-pay-note','');
  clearSTSlip();

  // Apply visibility ก่อน switch tab
  applyTrackerVisibility(q);

  switchSTTab('timeline', document.querySelector('.st-tab[data-tab="timeline"]'));
  renderSTTimeline();
  renderSTDocs();
  renderSTPaySummary(q);
  renderSTPayHistory(q).catch(()=>{});
  renderPOStatusBar(q);
  renderPayDueDateDisplay(q);
  renderReminderDisplay();
  renderCustPOTab();
  updateFollowUpBtn();
  openModal('sale-tracker-modal');
}

// ============================================================
// PO STATUS — ข้อ 5
// ============================================================
const PO_STATUS_CONFIG = {
  'Pending':     { label: 'รอยืนยัน',    color: 'var(--amber)',  bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  icon: '⏳' },
  'Ready':       { label: 'พร้อมส่ง',    color: 'var(--green)',  bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  icon: '✅' },
  'Partial':     { label: 'พร้อมบางส่วน', color: '#60a5fa',      bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  icon: '🔷' },
  'Unavailable': { label: 'ของไม่พร้อม',  color: 'var(--red)',   bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', icon: '❌' },
};

function renderPOStatusBar(q) {
  const bar = document.getElementById('po-status-bar');
  const display = document.getElementById('po-status-badge-display');
  if (!bar || !display) return;

  const status = q.POStatus;
  if (!status || status === '') { bar.style.display = 'none'; return; }

  const cfg = PO_STATUS_CONFIG[status] || PO_STATUS_CONFIG['Pending'];
  bar.style.display = '';
  bar.style.borderColor = cfg.border;
  bar.style.background = cfg.bg;

  display.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">${cfg.icon}</span>
      <div>
        <div style="font-size:13px;font-weight:600;color:${cfg.color}">${cfg.label}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">อัปเดตล่าสุดโดยฝ่ายจัดซื้อ</div>
      </div>
      ${canManageSaleActions(q) ? `<button class="btn btn-sm" onclick="refreshPOStatus('${q.id}')" style="margin-left:auto;font-size:11px">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
        รีเฟรช
      </button>` : ''}
    </div>`;

  // แสดง POComment ถ้ามี
  const commentEl = document.getElementById('po-comment-display');
  if (commentEl) {
    if (q.POComment) {
      commentEl.style.display = '';
      commentEl.innerHTML = '<span style="font-size:10px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px">หมายเหตุจากจัดซื้อ</span>' + escHtml(q.POComment);
    } else {
      commentEl.style.display = 'none';
    }
  }

  // แสดง Reminder ถ้ามี
  renderReminderDisplay();
}

function renderReminderDisplay() {
  const reminderDate = stDealData.reminderDate;
  const display = document.getElementById('st-reminder-display');
  const input = document.getElementById('st-reminder-date');
  if (!display) return;
  if (input && reminderDate) input.value = reminderDate;
  if (reminderDate) {
    const d = new Date(reminderDate);
    const now = new Date();
    const diff = Math.ceil((d - now) / (1000*60*60*24));
    const color = diff < 0 ? 'var(--red)' : diff <= 3 ? 'var(--amber)' : 'var(--green)';
    display.innerHTML = `<span style="color:${color}">🔔 ตั้งเตือนไว้: ${reminderDate} ${diff < 0 ? '(เลยกำหนดแล้ว ' + Math.abs(diff) + ' วัน)' : diff === 0 ? '(วันนี้!)' : '(อีก ' + diff + ' วัน)'}</span>`;
  } else {
    display.innerHTML = '<span style="color:var(--muted);font-size:11px">ยังไม่ได้ตั้งเตือน</span>';
  }
}

async function savePaymentDueDate() {
  const date = document.getElementById('st-pay-due-date')?.value;
  if (!date) { toast('กรุณาเลือกวันกำหนดชำระ', 'error'); return; }
  try {
    await updateListItem(CONFIG.lists.quotations, stQuoteId, { PaymentDueDate: date + 'T08:00:00' });
    const q = quotesData.find(x => x.id === stQuoteId);
    if (q) q.PaymentDueDate = date;
    stDealData.notes = stDealData.notes || [];
    stDealData.notes.push({
      id: Date.now(),
      user: currentUser?.displayName || 'User',
      text: '📅 กำหนดวันชำระเงินไว้: ' + date,
      ts: new Date().toISOString(),
      type: 'paydue'
    });
    await saveSTDealData();
    renderPayDueDateDisplay(q);
    renderSTTimeline();
    toast('📅 กำหนดวันชำระ ' + date + ' สำเร็จ', 'success');
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

function renderWHTHint() {
  const el = document.getElementById('st-pay-wht-hint');
  if (!el) return;
  const amt = +document.getElementById('st-pay-amount')?.value || 0;
  const pct = +document.getElementById('st-pay-wht')?.value || 0;
  if (amt <= 0) { el.innerHTML = '—'; return; }
  const wht = +(amt * pct / 100).toFixed(2);
  const net = +(amt - wht).toFixed(2);
  el.innerHTML = pct > 0
    ? `หัก ${fmt(wht)} · <b style="color:var(--green)">รับจริง ${fmt(net)}</b>`
    : `<span style="color:var(--muted)">ไม่มีการหัก · รับ ${fmt(amt)}</span>`;
}

function renderPayDueDateDisplay(q) {
  const display = document.getElementById('st-pay-due-display');
  const input = document.getElementById('st-pay-due-date');
  if (!display) return;
  const date = q?.PaymentDueDate ? (q.PaymentDueDate+'').split('T')[0] : stDealData?.paymentDueDate;
  if (input && date) input.value = date;
  if (date) {
    const d = new Date(date);
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = Math.ceil((d - now) / (1000*60*60*24));
    const color = diff < 0 ? 'var(--red)' : diff <= 3 ? 'var(--amber)' : 'var(--green)';
    display.innerHTML = `<span style="color:${color}">📅 กำหนดชำระ: ${date} ${diff < 0 ? '(เลยกำหนด ' + Math.abs(diff) + ' วัน)' : diff === 0 ? '(วันนี้!)' : '(อีก ' + diff + ' วัน)'}</span>`;
  } else {
    display.innerHTML = '<span style="color:var(--muted)">ยังไม่ได้กำหนดวันชำระ</span>';
  }
}

async function saveSTReminder() {
  const date = document.getElementById('st-reminder-date')?.value;
  if (!date) { toast('กรุณาเลือกวันที่แจ้งเตือน', 'error'); return; }
  stDealData.reminderDate = date;
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({
    id: Date.now(),
    user: currentUser?.displayName || 'User',
    text: '🔔 ตั้งแจ้งเตือนติดตามในวันที่ ' + date,
    ts: new Date().toISOString(),
    type: 'reminder'
  });
  await saveSTDealData();

  // บันทึก ReminderDate ลง SharePoint เพื่อให้ Power Automate ดึงได้
  try {
    await updateListItem(CONFIG.lists.quotations, stQuoteId, {
      ReminderDate: date + 'T08:00:00'
    });
    const q = quotesData.find(x => x.id === stQuoteId);
    if (q) q.ReminderDate = date;
  } catch(e) { console.warn('ReminderDate save failed:', e.message); }

  renderReminderDisplay();
  renderSTTimeline();
  toast('🔔 ตั้งแจ้งเตือน ' + date + ' สำเร็จ', 'success');
}

async function refreshPOStatus(id) {
  try {
    const items = await getListItems(CONFIG.lists.quotations);
    const q = items.find(x => x.id === id);
    if (q) {
      const local = quotesData.find(x => x.id === id);
      if (local) local.POStatus = q.POStatus;
      renderPOStatusBar(local || q);
      toast('รีเฟรชสถานะจัดซื้อแล้ว', 'success');
    }
  } catch(e) { toast('รีเฟรชไม่สำเร็จ', 'error'); }
}

// ============================================================
// CANCEL QUOTE — ข้อ 4
// ============================================================
let cancellingQuoteId = null;

// ============================================================
// REVISE QUOTE
// ============================================================
function familyHasClosed(q) {
  // เช็คว่ามีใบ revision ใดใน family เดียวกัน Closed หรือ PO Received อยู่ไหม
  const base = (q.Title||'').replace(/-RV\d+$/, '');
  return quotesData.some(x =>
    (x.Title||'').replace(/-RV\d+$/, '') === base &&
    (x.Status === 'Closed' || x.Status === 'PO Received')
  );
}

async function reviseQuote(id) {
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  if (!canEditQuote(q)) { toast('คุณไม่มีสิทธิ์ Revise ใบนี้', 'error'); return; }

  const baseTitle = q.Title.replace(/-RV\d+$/, '');
  const rvNum = quotesData.filter(x => x.Title && x.Title !== baseTitle && x.Title.startsWith(baseTitle + '-RV')).length + 1;
  const newTitle = baseTitle + '-RV' + rvNum;

  if (!confirm('สร้างใบแก้ไข ' + newTitle + ' จาก ' + q.Title + '?\nข้อมูลทั้งหมดจะถูก copy มาพร้อมแก้ไข')) return;

  try {
    toast('กำลังสร้างใบ Revise...', 'info');

    let oldItems = [];
    try {
      const allItems = await getListItems(CONFIG.lists.quoteItems);
      oldItems = allItems.filter(i => String(i.QuoteID) === String(id));
    } catch(e) {}

    const newFields = {
      Title: newTitle,
      ClientName: q.ClientName||'', ContactPerson: q.ContactPerson||'',
      Phone: q.Phone||'', Email: q.Email||'',
      QuoteDate: new Date().toISOString().split('T')[0],
      PaymentMethod: q.PaymentMethod||'เงินสด',
      SubTotal: q.SubTotal||0, DiscountPct: q.DiscountPct||0,
      TotalAmount: q.TotalAmount||0, Status: 'Draft',
      Note: q.Note||'', Terms: q.Terms||'',
      SaleName: q.SaleName||'', SaleTel: q.SaleTel||'', SaleEmail: q.SaleEmail||'',
      CustomerAddress: q.CustomerAddress||q.CustomerAddress||'', CustomerTaxID: q.CustomerTaxID||q.CustomerTaxID||'', CustomerTel: q.CustomerTel||q.CustomerTel||'',
      ApproverEmail: q.ApproverEmail||'', ApproverName: q.ApproverName||''
    };

    const created = await createListItem(CONFIG.lists.quotations, newFields);
    const newId = created.id;

    if (oldItems.length) {
      await Promise.all(oldItems.map(it =>
        createListItem(CONFIG.lists.quoteItems, {
          Title: it.Title||'', QuoteID: newId,
          Quantity: it.Quantity||1, Unit: it.Unit||'',
          UnitPrice: it.UnitPrice||0, DiscountPct: it.DiscountPct||0,
          LineTotal: it.LineTotal||0, Description: it.Description||''
        })
      ));
    }

    quotesData.push({ id: newId, ...newFields });
    renderDash(); renderQuotes(); updateBadge();
    toast('✓ สร้าง ' + newTitle + ' สำเร็จ — กำลังเปิดหน้าแก้ไข', 'success');
    setTimeout(() => editQuote(newId), 600);

  } catch(e) { toast('สร้างไม่สำเร็จ: ' + e.message, 'error'); }
}

async function cancelQuote(id) {
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  if (!canEditQuote(q)) { toast('คุณไม่มีสิทธิ์ยกเลิกใบเสนอราคานี้', 'error'); return; }

  // Draft → ลบทิ้งได้เลย ไม่ต้องแจ้งใคร
  if (q.Status === 'Draft') {
    if (!confirm('ลบใบเสนอราคา ' + q.Title + '?\nDraft ไม่ต้องแจ้งใคร — ลบได้เลย')) return;
    try {
      toast('กำลังลบ...', 'info');
      await deleteListItem(CONFIG.lists.quotations, id);
      quotesData = quotesData.filter(x => x.id !== id);
      toast('ลบใบเสนอราคา ' + q.Title + ' แล้ว', 'success');
      if (editingQuoteId === id) { editingQuoteId = null; const eb=document.getElementById('edit-banner'); if(eb)eb.style.display='none'; }
      renderDash(); renderQuotes(); updateBadge();
    } catch(e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error'); }
    return;
  }

  // Rejected → ยกเลิกเงียบๆ ไม่แจ้งใคร
  if (q.Status === 'Rejected') {
    if (!confirm('ยกเลิกใบเสนอราคา ' + q.Title + ' ?')) return;
    try {
      toast('กำลังยกเลิก...', 'info');
      await updateListItem(CONFIG.lists.quotations, id, { Status: 'Cancelled' });
      const _r = 'ยกเลิกโดย ' + (currentUser?.displayName||'');
      try { await putSettingValue('CancelReason_' + id, _r); } catch(e) { console.warn('save cancel reason:', e.message); }
      const lq = quotesData.find(x => x.id === id);
      if (lq) { lq.Status = 'Cancelled'; lq.CancelReason = _r; }
      toast('ยกเลิก ' + q.Title + ' แล้ว', 'success');
      if (editingQuoteId === id) { editingQuoteId = null; const eb=document.getElementById('edit-banner'); if(eb)eb.style.display='none'; }
      renderDash(); renderQuotes(); updateBadge();
    } catch(e) { toast('ยกเลิกไม่สำเร็จ: ' + e.message, 'error'); }
    return;
  }

  // Pending / Approved → เปิด modal ระบุเหตุผล + แจ้ง Email
  cancellingQuoteId = id;
  // อัปเดต modal header ตาม status
  const modalTitle = document.querySelector('#cancel-quote-modal .modal-header h3');
  if (modalTitle) modalTitle.textContent = q.Status === 'Approved' ? 'ยกเลิกใบที่อนุมัติแล้ว' : 'ยกเลิกใบเสนอราคา';
  const warningBox = document.querySelector('#cancel-quote-modal .modal-body div');
  if (warningBox && q.Status === 'Approved') {
    warningBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>ใบนี้ <strong>อนุมัติแล้ว</strong> — ระบบจะแจ้ง Approver และฝ่ายจัดซื้อ (ถ้ามี PO) — <strong>ไม่สามารถยกเลิกการกระทำนี้ได้</strong></div>';
  }
  document.getElementById('cancel-reason').value = '';
  openModal('cancel-quote-modal');
}

async function confirmCancelQuote() {
  const reason = (document.getElementById('cancel-reason')?.value || '').trim();
  if (!reason) { toast('กรุณาระบุเหตุผลการยกเลิก', 'error'); return; }
  if (!cancellingQuoteId) return;
  const q = quotesData.find(x => x.id === cancellingQuoteId);
  if (!q) return;
  try {
    toast('กำลังยกเลิกใบเสนอราคา...', 'info');
    // อัปเดตเฉพาะ Status (คอลัมน์ที่มีจริง) — เก็บเหตุผลใน Settings list แทน (ไม่มีคอลัมน์ CancelReason)
    await updateListItem(CONFIG.lists.quotations, cancellingQuoteId, { Status: 'Cancelled' });
    try { await putSettingValue('CancelReason_' + cancellingQuoteId, reason); } catch(e) { console.warn('save cancel reason:', e.message); }
    q.Status = 'Cancelled';
    q.CancelReason = reason;
    q.CancelledReason = reason;
    // reset editingQuoteId ด้วย เพื่อไม่ให้สร้างใบใหม่ติด edit mode เดิม
    if (editingQuoteId === cancellingQuoteId) {
      editingQuoteId = null;
      const editBanner = document.getElementById('edit-banner');
      if (editBanner) editBanner.style.display = 'none';
    }
    closeModal('cancel-quote-modal');
    toast('ยกเลิกใบเสนอราคา ' + q.Title + ' เรียบร้อยแล้ว', 'success');
    // ส่ง Email — Pending แจ้ง Approver, Approved แจ้ง Approver + จัดซื้อ
    await sendCancelNotification(q, reason);
    renderDash(); renderQuotes(); renderApprove(); updateBadge();
    cancellingQuoteId = null;
  } catch(e) { toast('ยกเลิกไม่สำเร็จ: ' + e.message, 'error'); }
}

async function sendPOReceivedEmail(q, poNumber) {
  const to = q.ApproverEmail || '';
  if (!to || !to.includes('@')) return;
  const subject = '[PO Received] ' + (q.Title||'') + ' — ' + (q.ClientName||'');
  const body = 'ได้รับ PO จากลูกค้าสำหรับใบเสนอราคานี้แล้ว\n\n'
    + 'ใบเสนอราคา : ' + (q.Title||'') + '\n'
    + 'ลูกค้า      : ' + (q.ClientName||'') + '\n'
    + 'เลข PO      : ' + (poNumber||'') + '\n'
    + 'มูลค่ารวม   : ' + fmt(q.TotalAmount||0) + '\n'
    + 'สถานะเปลี่ยนเป็น PO Received แล้ว';
  await apiPost('sendEmail', '_', null, { to, subject, body });
}

async function sendPaymentCompleteEmail(q, totalPaid) {
  const to = q.ApproverEmail || '';
  if (!to || !to.includes('@')) return;
  const subject = '[ชำระครบ] ' + (q.Title||'') + ' — ' + (q.ClientName||'');
  const body = 'ลูกค้าชำระเงินครบแล้ว — ปิดการขายเรียบร้อย\n\n'
    + 'ใบเสนอราคา : ' + (q.Title||'') + '\n'
    + 'ลูกค้า      : ' + (q.ClientName||'') + '\n'
    + 'มูลค่ารวม   : ' + fmt(q.TotalAmount||0) + '\n'
    + 'ยอดชำระรวม  : ' + fmt(totalPaid||0) + '\n'
    + 'สถานะเปลี่ยนเป็น Closed แล้ว';
  await apiPost('sendEmail', '_', null, { to, subject, body });
}

// หัวเรื่องอีเมลอนุมัติ (ใช้ร่วมทั้งคำขอและผล เพื่อให้ร้อยเธรดกันได้): [ใบเสนอราคา] เลขที่ — ลูกค้า — โปรเจกต์
function _approvalSubject(q) {
  const tag = (q.Tag || '').trim();
  return '[ใบเสนอราคา] ' + (q.Title||'') + ' — ' + (q.ClientName||'') + (tag ? ' — ' + tag : '');
}
// เก็บ conversationId ของเธรดอนุมัติไว้ต่อใบ → ทุกเมล (ขอ/อนุมัติ/ปฏิเสธ) อยู่เธรดเดียวกันเสมอ
function _getApprovalCID(qid) {
  try { const it = (_settingsCache || []).find(i => i.Title === 'ApprovalCID_' + qid); return it && it.Value ? it.Value : ''; }
  catch(e) { return ''; }
}
// คืน message id ที่จะใช้ reply (ล่าสุดในเธรดเดิม) — ถ้ายังไม่มี cid ให้ค้นจาก subject แล้วจำ cid ไว้
async function _approvalThreadMid(q) {
  if (typeof _latestInConversation !== 'function' || typeof _findRequestMsg !== 'function') return null;
  const cid = _getApprovalCID(q.id);
  let mid = cid ? await _latestInConversation(cid).catch(() => null) : null;
  if (!mid) {
    const m = await _findRequestMsg(_approvalSubject(q)).catch(() => null);
    if (m) { mid = m.id; if (m.conversationId) { try { await saveSettingItem('ApprovalCID_' + q.id, m.conversationId); } catch(e) {} } }
  }
  return mid;
}
async function sendApprovalRequestEmail(q, attachment) {
  const to = q.ApproverEmail || '';
  if (!to || !to.includes('@')) return;
  const subject = _approvalSubject(q);
  const tag = (q.Tag || '').trim();
  const body = '🔔 มีใบเสนอราคารออนุมัติ (แนบไฟล์ PDF ใบเสนอราคาไว้ด้านล่าง)\n\n'
    + 'ใบเสนอราคา : ' + (q.Title||'') + '\n'
    + 'ลูกค้า      : ' + (q.ClientName||'') + '\n'
    + (tag ? 'โปรเจกต์   : ' + tag + '\n' : '')
    + 'มูลค่ารวม   : ' + fmt(q.TotalAmount||0) + '\n'
    + 'ผู้จัดทำ    : ' + (q.SaleName||q.SaleEmail||'') + '\n\n'
    + 'กรุณาเข้าสู่ระบบ SalePro เพื่ออนุมัติหรือปฏิเสธใบเสนอราคา';
  // ถ้าใบนี้เคยส่งอนุมัติแล้ว (มีเธรดเดิม) → ส่งรอบใหม่เป็น reply เพื่อให้อยู่เธรดเดียวกัน
  try {
    const mid = await _approvalThreadMid(q);
    if (mid && typeof _sendReplyNew === 'function') { await _sendReplyNew(mid, to, body, attachment); return; }
  } catch(e) { console.warn('reply-new-round failed, fallback to new email:', e.message); }
  // ส่งอีเมลใหม่ แล้วจำ conversationId ของเธรดนี้ไว้ (เพื่อให้ผลอนุมัติ/ปฏิเสธรอบถัดไปตามเข้าเธรดเดิม)
  await apiPost('sendEmail', '_', null, { to, subject, body, attachments: attachment ? [attachment] : [] });
  try {
    if (typeof _findRequestMsg === 'function') {
      const m = await _findRequestMsg(subject);
      if (m && m.conversationId) await saveSettingItem('ApprovalCID_' + q.id, m.conversationId);
    }
  } catch(e) {}
}

async function sendApprovalResultEmail(q, status, comment) {
  const to = q.SaleEmail || '';
  if (!to || !to.includes('@')) return;
  const isApproved = status === 'Approved';
  const reqSubject = _approvalSubject(q);   // หัวเรื่องเดียวกับอีเมลคำขอ (ใช้จับเธรด)
  const tag = (q.Tag || '').trim();
  const body = (isApproved ? '✅ ใบเสนอราคาของคุณได้รับการอนุมัติแล้ว' : '❌ ใบเสนอราคาของคุณถูกปฏิเสธ') + '\n\n'
    + 'ใบเสนอราคา : ' + (q.Title||'') + '\n'
    + 'ลูกค้า      : ' + (q.ClientName||'') + '\n'
    + (tag ? 'โปรเจกต์   : ' + tag + '\n' : '')
    + 'มูลค่ารวม   : ' + fmt(q.TotalAmount||0) + '\n'
    + 'อนุมัติโดย  : ' + (q.ApproverName||q.ApproverEmail||'') + '\n'
    + (comment ? '\nความคิดเห็น:\n' + comment : '');
  // reply เข้าเธรดเดิม (ใช้ conversationId ที่จำไว้) → อนุมัติ/ปฏิเสธ ของใบเดียวกันอยู่เธรดเดียวกันเสมอ
  try {
    const mid = await _approvalThreadMid(q);
    if (mid && typeof _replyMail === 'function') { await _replyMail(mid, body); return; }
  } catch(e) { console.warn('reply-in-thread failed, fallback to new email:', e.message); }
  // fallback: อีเมลใหม่ (RE:) ถ้าหาเธรดเดิมไม่เจอ
  await apiPost('sendEmail', '_', null, { to, subject: 'RE: ' + reqSubject, body });
}


async function sendCancelNotification(q, reason) {
  // ส่งผ่าน Apps Script MailApp.sendEmail โดยตรง
  try {
    const addedEmails = new Set();
    const toEmails = [];
    const addEmail = (email) => {
      if (email && email.includes('@') && !addedEmails.has(email.toLowerCase())) {
        addedEmails.add(email.toLowerCase());
        toEmails.push(email);
      }
    };
    addEmail(q.ApproverEmail);
    if (q.SaleEmail && q.SaleEmail !== currentUser?.email) addEmail(q.SaleEmail);
    if (!toEmails.length) { console.log('No recipients for cancel notification'); return; }
    const subject = '[ยกเลิก] ใบเสนอราคา ' + (q.Title||'') + ' — ' + (q.ClientName||'');
    const body = 'ใบเสนอราคา: ' + (q.Title||'') + '\n'
      + 'ลูกค้า: ' + (q.ClientName||'') + '\n'
      + 'มูลค่า: ' + fmt(q.TotalAmount||0) + '\n'
      + 'ยกเลิกโดย: ' + (currentUser?.displayName||currentUser?.email||'') + '\n\n'
      + 'เหตุผลการยกเลิก:\n' + reason;
    // ส่งผ่าน Apps Script (doPost action: sendEmail)
    await apiPost('sendEmail', '_', null, {
      to: toEmails.join(','),
      subject: subject,
      body: body
    });
    toast('ส่ง Email แจ้งยกเลิกแล้ว', 'success');
  } catch(e) {
    console.warn('Cancel notification failed:', e.message);
    // fallback: ไม่ toast error เพราะยกเลิกสำเร็จแล้ว แค่ email ไม่ส่ง
  }
}
function buildCancelEmailHTML(q, reason) {
  return '<div style="font-family:Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">'
    + '<div style="background:#7c1d1d;padding:24px 28px;text-align:center">'
    + '<div style="font-size:32px;margin-bottom:8px">🚫</div>'
    + '<div style="color:#fff;font-size:18px;font-weight:600">ใบเสนอราคาถูกยกเลิก</div>'
    + '<div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px">SalePro · D On Net Co., Ltd.</div>'
    + '</div>'
    + '<div style="padding:24px 28px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">'
    + '<tr><td style="padding:6px 0;color:#888;width:130px">ใบเสนอราคา</td><td style="padding:6px 0;color:#1a1a2e;font-weight:700;font-size:15px">' + (q.Title||'') + '</td></tr>'
    + '<tr style="border-top:1px solid #f3f4f6"><td style="padding:6px 0;color:#888">ลูกค้า</td><td style="padding:6px 0;color:#1a1a2e">' + (q.ClientName||'') + '</td></tr>'
    + '<tr style="border-top:1px solid #f3f4f6"><td style="padding:6px 0;color:#888">มูลค่า</td><td style="padding:6px 0;color:#1a1a2e;font-weight:600">฿' + Number(q.TotalAmount||0).toLocaleString('th-TH',{minimumFractionDigits:2}) + '</td></tr>'
    + '<tr style="border-top:1px solid #f3f4f6"><td style="padding:6px 0;color:#888">ยกเลิกโดย</td><td style="padding:6px 0;color:#1a1a2e">' + (currentUser?.displayName||'') + '</td></tr>'
    + '</table>'
    + '<div style="border:1px solid #fecaca;border-radius:8px;overflow:hidden;margin-bottom:20px">'
    + '<div style="background:#fef2f2;padding:10px 16px;border-bottom:1px solid #fecaca"><span style="font-size:12px;color:#991b1b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">📋 เหตุผลการยกเลิก</span></div>'
    + '<div style="padding:14px 16px;font-size:13px;color:#1a1a2e;line-height:1.7">' + reason + '</div>'
    + '</div>'
    + '<div style="text-align:center">'
    + '<a href="https://darmmunginsa.github.io/D-ON-NET/salepro/index.html" style="display:inline-block;background:#1a3a5c;color:#fff;text-decoration:none;padding:11px 28px;border-radius:8px;font-size:13px;font-weight:600">เข้าระบบ SalePro →</a>'
    + '</div></div>'
    + '<div style="padding:14px 28px;text-align:center;border-top:1px solid #e5e7eb;background:#f9fafb">'
    + '<div style="font-size:11px;color:#9ca3af">D On Net Co., Ltd. · อีเมลนี้ส่งอัตโนมัติจาก SalePro</div>'
    + '</div></div>';
}

// ============================================================
// PO CONFIRM LINK — ข้อ 5 (Power Automate webhook handler)
// เมื่อ URL มี ?po_status=Ready&quote_id=xxx → อัปเดต SharePoint
// ============================================================
async function handlePOStatusCallback() {
  const params = new URLSearchParams(window.location.search);
  const poStatus = params.get('po_status');
  const quoteId = params.get('quote_id');
  const needComment = params.get('need_comment') === '1';
  if (!poStatus || !quoteId) return;

  const cfg = PO_STATUS_CONFIG[poStatus];
  if (!cfg) return;

  // Clear URL params
  window.history.replaceState({}, '', window.location.origin + window.location.pathname);

  // Partial / Unavailable ที่ต้องการ comment → แสดง comment modal ก่อน
  if (needComment) {
    setTimeout(() => showPOCommentModal(poStatus, quoteId, cfg), 1500);
    return;
  }

  try {
    await updateListItem(CONFIG.lists.quotations, quoteId, { POStatus: poStatus });
    const q = quotesData.find(x => String(x.id) === String(quoteId));
    if (q) q.POStatus = poStatus;

    // เพิ่ม note ใน Timeline
    if (stQuoteId && (stQuoteId === quoteId || String(stQuoteId) === String(quoteId))) {
      stDealData.notes = stDealData.notes || [];
      stDealData.notes.push({
        id: Date.now(),
        user: currentUser?.displayName || 'จัดซื้อ',
        text: cfg.icon + ' ' + cfg.label,
        ts: new Date().toISOString(),
        type: 'po_reply'
      });
      await saveSTDealData();
    }

    setTimeout(() => showPOConfirmation(poStatus, quoteId, cfg), 1500);
  } catch(e) {
    console.warn('PO status update failed:', e.message);
    setTimeout(() => toast('อัปเดตสถานะจัดซื้อไม่สำเร็จ: ' + e.message, 'error'), 1500);
  }
}

function showPOCommentModal(poStatus, quoteId, cfg) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(8px)';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 32px 80px rgba(0,0,0,0.5)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:10px">${cfg.icon}</div>
        <h2 style="font-size:17px;font-weight:600;color:var(--text);margin-bottom:4px">${cfg.label}</h2>
        <p style="font-size:12px;color:var(--muted)">ใบเสนอราคา #${quoteId}</p>
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--muted);font-weight:500;display:block;margin-bottom:6px">
          ${poStatus === 'Partial' ? 'ระบุรายการที่พร้อม / ไม่พร้อม' : 'เหตุผลและกำหนดการที่คาดว่าจะพร้อม'} <span style="color:var(--red)">*</span>
        </label>
        <textarea id="po-comment-input" placeholder="${poStatus === 'Partial' ? 'เช่น CPU พร้อมแล้ว 4 ชิ้น / RAM ยังรออีก 2 สัปดาห์...' : 'เช่น สินค้าหมด คาดว่าจะพร้อมภายใน 14 วัน / ติดต่อ supplier แล้ว...'}" style="width:100%;min-height:100px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--text);font-family:var(--font);resize:vertical;outline:none;box-sizing:border-box"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:var(--surface2);color:var(--muted);border:1px solid var(--border2);border-radius:8px;padding:9px 18px;font-size:13px;cursor:pointer;font-family:var(--font)">ยกเลิก</button>
        <button id="po-confirm-btn" onclick="submitPOComment('${poStatus}','${quoteId}',this)" style="background:#1a3a5c;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--font)">ยืนยันสถานะ</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('#po-comment-input')?.focus(), 100);
}

async function submitPOComment(poStatus, quoteId, btn) {
  const comment = document.getElementById('po-comment-input')?.value?.trim();
  if (!comment) {
    document.getElementById('po-comment-input').style.borderColor = 'var(--red)';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';
  try {
    const cfg = PO_STATUS_CONFIG[poStatus];
    await updateListItem(CONFIG.lists.quotations, quoteId, { POStatus: poStatus, POComment: comment });
    const q = quotesData.find(x => String(x.id) === String(quoteId));
    if (q) { q.POStatus = poStatus; q.POComment = comment; }

    // เพิ่ม note ใน Timeline อัตโนมัติ
    if (stQuoteId === quoteId || String(stQuoteId) === String(quoteId)) {
      stDealData.notes = stDealData.notes || [];
      stDealData.notes.push({
        id: Date.now(),
        user: currentUser?.displayName || 'จัดซื้อ',
        text: cfg.icon + ' ' + cfg.label + '\n' + comment,
        ts: new Date().toISOString(),
        type: 'po_reply'
      });
      await saveSTDealData();
      renderSTTimeline();
    }

    btn.closest('div[style*="fixed"]')?.remove();
    showPOConfirmation(poStatus, quoteId, cfg, comment);
    toast('บันทึกสถานะและหมายเหตุสำเร็จ', 'success');
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'ยืนยันสถานะ';
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    console.error('submitPOComment error:', e);
  }
}

function showPOConfirmation(poStatus, quoteId, cfg, comment) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(8px)';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:36px;max-width:400px;width:90%;text-align:center;box-shadow:0 32px 80px rgba(0,0,0,0.5)">
      <div style="font-size:48px;margin-bottom:14px">${cfg.icon}</div>
      <h2 style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:6px">อัปเดตสถานะสำเร็จ</h2>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">สถานะสินค้า: <strong style="color:${cfg.color}">${cfg.label}</strong><br><span style="font-size:12px">ทีมขายจะได้รับการแจ้งเตือนแล้ว</span></p>
      ${comment ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text);text-align:left;margin-bottom:16px;line-height:1.6"><span style="font-size:10px;color:var(--muted);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">หมายเหตุที่บันทึก</span>${comment}</div>` : ''}
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:11px;color:var(--muted);margin-bottom:20px">ใบเสนอราคา #${quoteId}</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 28px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--font)">ปิด</button>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 10000);
}

// ============================================================
// BUILD PO EMAIL WITH STATUS BUTTONS — ข้อ 5
// ============================================================
// Override buildPOEmailHTML เพิ่ม status buttons
function buildPOEmailHTML(q, payload) {
  const baseHTML = buildPOEmailHTMLBase(q, payload);
  const baseUrl = 'https://darmmunginsa.github.io/D-ON-NET/salepro/index.html';
  const qid = q.id || stQuoteId || '';

  // Partial และ Unavailable ต้องมี comment ก่อน → ใช้ mailto-style form ใน HTML email
  // วิธีที่ใช้ได้ใน Email: ปุ่ม 2 แบบ
  // 1. Ready / Pending → คลิกได้เลย (ไม่ต้อง comment)
  // 2. Partial / Unavailable → มี input box + ปุ่ม submit (ใช้ link พร้อม anchor hint)
  //    เนื่องจาก Email ไม่รองรับ JS → ใช้ 2 ปุ่มแยก: คลิกปุ่มแล้ว redirect ไปหน้า SalePro
  //    พร้อม query param comment → user พิมพ์ comment ในหน้า SalePro แทน

  const statusButtons = '<div style="font-family:Segoe UI,sans-serif;max-width:560px;margin:16px auto 0;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">'
    + '<div style="background:#1a3a5c;padding:14px 20px">'
    + '<div style="color:#fff;font-size:14px;font-weight:600">📦 แจ้งสถานะความพร้อมของสินค้า</div>'
    + '<div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:3px">กรุณาคลิกปุ่มเพื่อแจ้งสถานะกลับไปยังทีมขาย</div>'
    + '</div>'
    + '<div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + `<a href="${baseUrl}?po_status=Ready&quote_id=${qid}" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-decoration:none;color:#166534;font-size:13px;font-weight:500">✅ พร้อมส่งทั้งหมด</a>`
    + `<a href="${baseUrl}?po_status=Pending&quote_id=${qid}" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;text-decoration:none;color:#92400e;font-size:13px;font-weight:500">⏳ กำลังตรวจสอบ</a>`
    + '</div>'
    + '<div style="padding:0 20px 8px;font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em">ต้องการระบุรายละเอียด</div>'
    + '<div style="padding:0 20px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + `<a href="${baseUrl}?po_status=Partial&quote_id=${qid}&need_comment=1" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-decoration:none;color:#1d4ed8;font-size:13px;font-weight:500;text-align:center">🔷 พร้อมบางส่วน<span style="font-size:10px;font-weight:400;color:#60a5fa">ระบุรายการที่พร้อม/ไม่พร้อม</span></a>`
    + `<a href="${baseUrl}?po_status=Unavailable&quote_id=${qid}&need_comment=1" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;text-decoration:none;color:#991b1b;font-size:13px;font-weight:500;text-align:center">❌ ของไม่พร้อม<span style="font-size:10px;font-weight:400;color:#f87171">ระบุเหตุผลและกำหนดการ</span></a>`
    + '</div>'
    + '<div style="padding:0 20px 16px;font-size:11px;color:#9ca3af;text-align:center">การคลิกจะเปิด SalePro เพื่อยืนยันสถานะ</div>'
    + '</div>';

  return baseHTML + statusButtons;
}

// ============================================================
// OVERRIDE renderSTTimeline & renderSTDocs for closed state (ข้อ 2)
// ============================================================
function renderSTTimeline() {
  const list = document.getElementById('st-timeline-list');
  if (!list) return;
  const notes = (stDealData.notes || []).slice().reverse();
  const isClosed = stDealData.closed;
  if (!notes.length) { list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">ยังไม่มี note — เพิ่มได้เลยครับ</div>'; return; }
  list.innerHTML = notes.map(n => `
    <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start">
      <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0;margin-top:2px">${escHtml((n.user||'?')[0].toUpperCase())}</div>
      <div style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <span style="font-size:12px;font-weight:500;color:var(--text)">${escHtml(n.user||'')}</span>
          <span style="font-size:10px;color:var(--muted);margin-left:auto">${formatDateTime(n.ts)}</span>
          ${n.type==='payment'?'<span class="badge badge-approved" style="font-size:9px">💳 ชำระเงิน</span>':''}
          ${n.type==='doc'?'<span class="badge badge-sent" style="font-size:9px">📎 เอกสาร</span>':''}
          ${n.type==='closed'?'<span class="badge badge-approved" style="font-size:9px">✅ ปิดการขาย</span>':''}
          ${n.type==='procurement'?'<span class="badge" style="background:rgba(0,120,212,0.12);color:#4da3ff;border:1px solid rgba(0,120,212,0.25);font-size:9px">📦 แจ้งจัดซื้อ</span>':''}
          ${n.type==='cancelled'?'<span class="badge badge-cancelled" style="font-size:9px">🚫 ยกเลิกใบ</span>':''}
        ${n.type==='tech'?'<span class="badge" style="background:rgba(168,85,247,0.12);color:#a855f7;border:1px solid rgba(168,85,247,0.25);font-size:9px">🔧 ช่าง</span>':''}
          ${n.type==='custpo'?'<span class="badge badge-poreceived" style="font-size:9px">📋 PO ลูกค้า</span>':''}
          ${n.type==='po_reply'?'<span class="badge" style="background:rgba(96,165,250,0.12);color:#60a5fa;border:1px solid rgba(96,165,250,0.25);font-size:9px">📦 จัดซื้อตอบกลับ</span>':''}
          ${n.type==='reminder'?'<span class="badge" style="background:rgba(251,191,36,0.12);color:var(--amber);border:1px solid rgba(251,191,36,0.25);font-size:9px">🔔 แจ้งเตือน</span>':''}
          ${n.type==='paydue'?'<span class="badge" style="background:rgba(52,211,153,0.12);color:var(--green);border:1px solid rgba(52,211,153,0.25);font-size:9px">📅 กำหนดชำระ</span>':''}

        </div>
        <div style="font-size:12px;color:var(--text);white-space:pre-wrap;line-height:1.6">${escHtml(n.text||'')}</div>
      </div>
    </div>`).join('');
}

// Checklist เอกสารส่งมอบ (Flow ขั้น 8) — เก็บใน stDealData.deliveryChecklist (Settings, ไม่แตะ SP column)
const DELIVERY_CHECKLIST = [
  { key:'delivery', label:'ใบส่งสินค้า' },
  { key:'invoice',  label:'ใบแจ้งหนี้ / ใบวางบิล' },
  { key:'po',       label:'PO ลูกค้า' },
  { key:'contract', label:'สัญญาบริการ (ตามเงื่อนไข)' },
  { key:'service',  label:'Service Record (ตามเงื่อนไข)' },
  { key:'manual',   label:'คู่มือ / Manual (ตามเงื่อนไข)' }
];
async function toggleDeliveryCheck(key) {
  stDealData.deliveryChecklist = stDealData.deliveryChecklist || {};
  stDealData.deliveryChecklist[key] = !stDealData.deliveryChecklist[key];
  renderDeliveryChecklist();
  try { await saveSTDealData(); } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message, 'error'); }
}
function renderDeliveryChecklist() {
  const el = document.getElementById('st-delivery-checklist');
  if (!el) return;
  const chk = stDealData.deliveryChecklist || {};
  const done = DELIVERY_CHECKLIST.filter(c => chk[c.key]).length;
  el.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:12px 14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px">📦 เอกสารส่งมอบ (ส่งมอบ+วางบิล) <span style="color:var(--muted);font-weight:400">${done}/${DELIVERY_CHECKLIST.length}</span></div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${DELIVERY_CHECKLIST.map(c => { const on=!!chk[c.key]; return `<label style="display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;color:${on?'var(--text)':'var(--muted)'}"><input type="checkbox" ${on?'checked':''} onchange="toggleDeliveryCheck('${c.key}')" style="width:auto">${on?'✅':'⬜'} ${c.label}</label>`; }).join('')}
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:8px">ติ๊กเมื่อเตรียม/แนบเอกสารครบก่อนส่งมอบ (เฉพาะที่ตรงกับงาน — บริการ/ติดตั้งค่อยติ๊กสัญญา/Service/คู่มือ)</div>
    </div>`;
}

// ════════ คลังฟอร์มบริษัท (template กลาง · Admin ดูแล) ════════
// เก็บรายการใน Settings list คีย์ "FormTemplates" เป็น JSON; ไฟล์เก็บใน Document Library โฟลเดอร์ FormTemplates
const FORM_TPL_CATS = ['ฟอร์มขาย','ฟอร์มบริการ/ติดตั้ง','ฟอร์มการเงิน/เบิกจ่าย','สัญญา/ข้อตกลง','อื่นๆ'];
function _formTemplates() { try { return JSON.parse(getSettingValue('FormTemplates') || '[]') || []; } catch(e) { return []; } }
async function _saveFormTemplates(arr) { await putSettingValue('FormTemplates', JSON.stringify(arr)); }
function _fmtFileIcon(name) { const e=(String(name||'').split('.').pop()||'').toLowerCase(); if(/xls/.test(e))return '📊'; if(/docx?|rtf/.test(e))return '📝'; if(/pdf/.test(e))return '📄'; return '📎'; }

function renderSTFormLibrary() {
  const box = document.getElementById('st-form-library'); if (!box) return;
  const isAdmin = !!(userRoles.isAdmin);
  const tpls = _formTemplates();
  let h = '<div style="border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:10px 12px">';
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + '<span style="font-size:12px;font-weight:600;color:var(--text)">🗂 คลังฟอร์มบริษัท</span>'
    + '<span style="font-size:10.5px;color:var(--muted)">ดาวน์โหลดไปกรอก แล้วอัปโหลด PDF กลับเข้าดีลด้านล่าง</span>'
    + (isAdmin ? '<button class="btn btn-sm btn-primary" style="margin-left:auto;font-size:11px" onclick="openAddFormTemplate()">+ เพิ่มฟอร์ม</button>' : '')
    + '</div>';
  if (!tpls.length) {
    h += '<div style="font-size:11.5px;color:var(--muted);padding:4px 0">— ยังไม่มีฟอร์มในคลัง'+(isAdmin?' (กด “+ เพิ่มฟอร์ม”)':'')+' —</div>';
  } else {
    FORM_TPL_CATS.forEach(function(cat){
      const inCat = tpls.filter(t=>(t.category||'อื่นๆ')===cat);
      if (!inCat.length) return;
      h += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:6px 0 4px">'+escHtml(cat)+'</div>';
      h += inCat.map(function(t){
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:5px;background:var(--surface)">'
          + '<span style="font-size:15px">'+_fmtFileIcon(t.fileName)+'</span>'
          + '<div style="flex:1;min-width:0"><div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(t.name||t.fileName)+'</div>'
          + '<div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(t.fileName||'')+'</div></div>'
          + '<button class="btn btn-sm" style="font-size:11px;border:1px solid var(--accent2);color:var(--accent2)" onclick="downloadFormTemplate(\''+t.id+'\')">⬇ ดาวน์โหลด</button>'
          + (isAdmin ? '<button onclick="deleteFormTemplate(\''+t.id+'\')" title="ลบฟอร์ม" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px">✕</button>' : '')
          + '</div>';
      }).join('');
    });
  }
  h += '</div>';
  box.innerHTML = h;
}
async function downloadFormTemplate(id) {
  const t = _formTemplates().find(x=>String(x.id)===String(id)); if (!t) return;
  try {
    toast('กำลังเตรียมไฟล์...', 'info');
    if (typeof graphFetchBlobUrl === 'function') {
      const burl = await graphFetchBlobUrl(t.fileUrl);
      const a = document.createElement('a'); a.href = burl; a.download = t.fileName || (t.name+'.xlsx'); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(burl), 4000);
    } else {
      window.open(t.fileUrl, '_blank');   // Google edition: เปิดลิงก์ไฟล์ตรง
    }
  } catch(e) { window.open(t.fileUrl, '_blank'); }
}
let _addFormTplFile = null;
function openAddFormTemplate() {
  const old=document.getElementById('_addFormTpl'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='_addFormTpl';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  const _inp='width:100%;font-size:12px;padding:6px 8px;margin-bottom:10px;background:var(--surface,#181c27);color:var(--text,#e8eaf0);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:6px;font-family:var(--font,inherit)';
  ov.innerHTML='<div style="background:var(--surface2,#1e2333);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:10px;width:440px;max-width:100%;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.5)">'
    +'<div style="padding:12px 16px;border-bottom:1px solid var(--border,rgba(255,255,255,.07));font-weight:600;color:var(--text,#e8eaf0)">🗂 เพิ่มฟอร์มเข้าคลัง</div>'
    +'<div style="padding:14px 16px">'
    +'<div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text,#e8eaf0)">ชื่อฟอร์ม</div>'
    +'<input id="_ftName" placeholder="เช่น ใบส่งมอบงาน, ใบเบิกอุปกรณ์" style="'+_inp+'">'
    +'<div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text,#e8eaf0)">หมวดหมู่</div>'
    +'<select id="_ftCat" style="'+_inp+'">'+FORM_TPL_CATS.map(c=>'<option style="background:var(--surface,#181c27);color:var(--text,#e8eaf0)">'+c+'</option>').join('')+'</select>'
    +'<div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text,#e8eaf0)">ไฟล์ต้นฉบับ (Excel / Word / PDF)</div>'
    +'<button class="btn btn-sm" style="font-size:12px" onclick="document.getElementById(\'st-formtpl-input\').click()">เลือกไฟล์…</button> <span id="_ftFileName" style="font-size:11px;color:var(--muted,#7b8299)">ยังไม่เลือกไฟล์</span>'
    +'<div id="_ftStatus" style="font-size:12px;color:var(--muted,#7b8299);min-height:18px;margin-top:8px"></div>'
    +'</div>'
    +'<div style="padding:12px 16px;border-top:1px solid var(--border,rgba(255,255,255,.07));display:flex;justify-content:flex-end;gap:8px">'
    +'<button class="btn btn-sm" onclick="(function(){var o=document.getElementById(\'_addFormTpl\');if(o)o.remove();_addFormTplFile=null;})()">ยกเลิก</button>'
    +'<button class="btn btn-sm btn-primary" onclick="saveFormTemplate()">บันทึกเข้าคลัง</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  _addFormTplFile=null;
  ov.addEventListener('mousedown',e=>{ if(e.target===ov){ ov.remove(); _addFormTplFile=null; } });
}
function uploadFormTemplateFile(input) {
  const f = input.files && input.files[0]; if(!f) return;
  _addFormTplFile = f;
  const el=document.getElementById('_ftFileName'); if(el)el.textContent=f.name;
  const nm=document.getElementById('_ftName'); if(nm && !nm.value) nm.value = f.name.replace(/\.[^.]+$/,'');
  input.value='';
}
async function saveFormTemplate() {
  const name=(document.getElementById('_ftName')||{}).value||'';
  const cat=(document.getElementById('_ftCat')||{}).value||'อื่นๆ';
  const st=document.getElementById('_ftStatus');
  if(!_addFormTplFile){ if(st)st.innerHTML='<span style="color:var(--red)">กรุณาเลือกไฟล์</span>'; return; }
  if(!name.trim()){ if(st)st.innerHTML='<span style="color:var(--red)">กรุณาตั้งชื่อฟอร์ม</span>'; return; }
  if(st)st.textContent='⏳ กำลังอัปโหลด...';
  try {
    const b64 = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(String(e.target.result).split(',')[1]||''); r.onerror=rej; r.readAsDataURL(_addFormTplFile); });
    const safe = _addFormTplFile.name.replace(/[\\/:*?"<>|]/g,'_');
    const up = await _uploadFileGraph('FormTemplates', Date.now()+'_'+safe, _addFormTplFile.type||'application/octet-stream', b64);
    const arr = _formTemplates();
    arr.push({ id:'ft'+Date.now(), name:name.trim(), category:cat, fileUrl:up.fileUrl, fileName:_addFormTplFile.name, mime:_addFormTplFile.type||'', by:(currentUser&&(currentUser.displayName||currentUser.email))||'', at:new Date().toISOString() });
    await _saveFormTemplates(arr);
    const o=document.getElementById('_addFormTpl'); if(o)o.remove(); _addFormTplFile=null;
    renderSTFormLibrary();
    toast('เพิ่มฟอร์มเข้าคลังแล้ว','success');
  } catch(e) { if(st)st.innerHTML='<span style="color:var(--red)">ไม่สำเร็จ: '+escHtml(e.message)+'</span>'; }
}
async function deleteFormTemplate(id) {
  if(!confirm('ลบฟอร์มนี้ออกจากคลัง?')) return;
  try { await _saveFormTemplates(_formTemplates().filter(t=>String(t.id)!==String(id))); renderSTFormLibrary(); toast('ลบฟอร์มแล้ว','success'); }
  catch(e){ toast('ลบไม่สำเร็จ: '+e.message,'error'); }
}

function renderSTDocs() {
  renderDeliveryChecklist();
  renderSTFormLibrary();
  const list = document.getElementById('st-docs-list');
  if (!list) return;
  const savedDocs = stDealData.docs || [];
  const docTypes = ['สัญญา','PO','Invoice','ใบเสร็จ','ใบส่งของ','เอกสารอื่น'];
  if (!savedDocs.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0 4px">ยังไม่มีเอกสาร</div>';
  } else {
    list.innerHTML = savedDocs.map(d => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;margin-bottom:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2" style="flex-shrink:0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span style="font-size:12px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${escHtml(d.name||'')}</span>
        <input list="doc-type-list" value="${escHtml(d.docType||'')}" onchange="updateSTDocType(${d.id},this.value)" placeholder="ประเภท..." style="background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:2px 6px;font-size:10px;color:var(--text);font-family:var(--font);width:90px">
        ${d.url && d.url.startsWith('http') ? `<a href="${d.url}" target="_blank" rel="noopener" style="color:var(--accent2);font-size:11px;text-decoration:none;padding:2px 6px;border:1px solid rgba(79,142,247,0.2);border-radius:4px" title="เปิดไฟล์">↗</a>` : ''}
      </div>`).join('');
  }
}

function renderPendingDocs() {
  const pendingSection = document.getElementById('st-docs-pending');
  const pendingList = document.getElementById('st-docs-pending-list');
  if (!pendingSection || !pendingList) return;
  if (!stPendingDocs.length) {
    pendingSection.style.display = 'none';
    pendingList.innerHTML = '';
    return;
  }
  pendingSection.style.display = 'block';
  const docTypes = ['สัญญา','PO','Invoice','ใบเสร็จ','ใบส่งของ','เอกสารอื่น'];
  pendingList.innerHTML = stPendingDocs.map(d => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:7px;margin-bottom:6px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" style="flex-shrink:0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="font-size:12px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${escHtml(d.name||'')}</span>
      <input list="doc-type-list" value="${escHtml(d.docType||'')}" onchange="updatePendingDocType(${d.id},this.value)" placeholder="ประเภท..." style="background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:2px 6px;font-size:10px;color:var(--text);font-family:var(--font);width:90px">
      <button class="action-btn" onclick="removePendingDoc(${d.id})" style="color:var(--red);flex-shrink:0" title="นำออก"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div>`).join('');
}

// ============================================================
// OVERRIDE confirmCloseDeal เพิ่ม POStatus check (ข้อ 3 เสริม)
// ============================================================
async function confirmCloseDeal() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const isPaid = (q.PaidAmount||0) >= (q.TotalAmount||1) && (q.TotalAmount||0) > 0;
  if (!isPaid) { toast('ยังไม่ได้รับชำระเงินครบ — ไม่สามารถปิดการขายได้', 'error'); return; }
  if (!confirm('ยืนยันปิดการขาย?\nหลังจากนี้จะไม่สามารถบันทึกชำระหรือแจ้งจัดซื้อเพิ่มได้')) return;

  stDealData.closed = true;
  stDealData.closedAt = new Date().toISOString();
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({ id: Date.now(), user: currentUser?.displayName||'User', text: 'ปิดการขายแล้ว', ts: new Date().toISOString(), type: 'closed' });
  await saveSTDealData();

  document.getElementById('st-status-badge').innerHTML = '<span class="badge badge-approved" style="font-size:10px">✓ ปิดการขายแล้ว</span>';
  applyTrackerVisibility(q); // ซ่อน tab และปุ่มหลังปิด
  renderSTTimeline();

  const cdQ = quotesData.find(x => x.id === stQuoteId);
  if (cdQ) cdQ.DealStatus = serializeDealStatus(stDealData);
  renderDash(); renderQuotes();
  toast('✓ ปิดการขายสำเร็จ', 'success');
}

