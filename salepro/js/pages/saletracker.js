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
  ['timeline','docs','payment','procurement','custpo','tech','expense'].forEach(t => {
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
}

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
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text)">${escHtml(e.detail||'-')}${e.by?`<div style="font-size:10px;color:var(--muted)">โดย ${escHtml(e.by)}</div>`:''}${e.receiptUrl?`<div style="margin-top:3px"><a href="${e.receiptUrl}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent2);text-decoration:none;display:inline-flex;align-items:center;gap:3px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>🧾 ดูใบเสร็จ</a></div>`:(e._src==='sale'?(e.receiptError?`<div style="margin-top:3px;font-size:10px;color:var(--red)">⚠ แนบรูปไม่สำเร็จ: ${escHtml(e.receiptError)}</div>`:`<div style="margin-top:3px;font-size:10px;color:var(--amber)">⚠ ไม่มีรูปแนบ</div>`):'')}</td>
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
      pays.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:12px">
        <span style="color:var(--green);font-family:var(--mono)">${fmt(p.AmountPaid||0)}</span>
        <span style="color:var(--muted)">${fmtDate(p.PaymentDate)}</span>
        <span class="badge badge-draft" style="font-size:10px">${p.PaymentMethod||''}</span>
        ${(+p.WHTAmount>0)?`<span style="color:var(--amber);font-size:11px" title="ลูกค้าหัก ณ ที่จ่าย ${p.WHTPercent||''}%">หัก ${fmt(p.WHTAmount)}</span>`:''}
        ${p.Reference?`<span style="color:var(--muted);font-size:11px">${escHtml(p.Reference)}</span>`:''}
        ${p.SlipURL && p.SlipURL.startsWith('http')?`<a href="${p.SlipURL}" target="_blank" rel="noopener" style="color:var(--accent2);font-size:11px;margin-left:auto;padding:2px 6px;border:1px solid rgba(79,142,247,0.2);border-radius:4px">📎 สลิป ↗</a>`:''}
      </div>`).join('');
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
  try{const s=localStorage.getItem('po_recipients_'+(currentUser?.email||''));poRecipients=s?JSON.parse(s):[];}catch(e){poRecipients=[];}
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
  try{localStorage.setItem('po_recipients_'+(currentUser?.email||''),JSON.stringify(poRecipients));}catch(e){}
  try{
    toast('กำลังเปิด Email...','info');
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
    const mailtoUrl='mailto:'+valid.join(',')+'?subject='+subject+'&body='+body;
    window.open(mailtoUrl,'_blank');
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
    toast('✅ เปิด Email client สำเร็จ — กรุณาส่ง Email จาก client','success');
  }catch(e){toast('เปิด Email ไม่สำเร็จ: '+e.message,'error');}
}
// ---- CLOSE DEAL ----


async function saveSTDealData(){
  try{
    const toSave={...stDealData,
      docs:(stDealData.docs||[]).map(d=>({id:d.id,name:d.name,docType:d.docType,url:d.url,ts:d.ts})),
      custPOs:(stDealData.custPOs||[]).map(p=>({id:p.id,poNumber:p.poNumber,poDate:p.poDate,note:p.note,fileName:p.fileName,fileUrl:p.fileUrl||'',savedBy:p.savedBy,ts:p.ts}))
    };
    const val=serializeDealStatus(toSave);
    await putStoredDealStatus(stQuoteId, val);   // เก็บใน Settings list — ไม่แตะ quotation item
    const q=quotesData.find(x=>x.id===stQuoteId);if(q)q.DealStatus=val;
  }catch(e){toast('บันทึก DealStatus ไม่สำเร็จ: '+e.message,'error');}
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
            ? '<a href="' + p.fileUrl + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent2);text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(79,142,247,0.1);border-radius:5px;border:1px solid rgba(79,142,247,0.2)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> ' + escHtml(p.fileName) + '</a>'
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
  if (on && !dm.rows.length) dm.rows.push({ no:'', desc:'', qty:'', price:'', amount:'' });
  const box = document.getElementById('cpo-manual-box'); if (box) box.style.display = on ? '' : 'none';
  renderDocManualRows();
  saveSTDealData();
}
function renderDocManualRows() {
  const tb = document.getElementById('cpo-manual-rows'); if (!tb) return;
  const dm = _docManual();
  const inp = (i,f,v,ph,align) => '<input value="'+escHtml(String(v||''))+'" oninput="updateDocManualCell('+i+',\''+f+'\',this.value)" placeholder="'+(ph||'')+'" style="width:100%;font-size:11px;text-align:'+(align||'left')+'">';
  tb.innerHTML = dm.rows.map((r,i) =>
    '<tr>'
    + '<td style="padding:2px">'+inp(i,'no',r.no,'','center')+'</td>'
    + '<td style="padding:2px"><textarea oninput="updateDocManualCell('+i+',\'desc\',this.value);_autoGrow(this)" placeholder="รายละเอียด..." rows="1" style="width:100%;font-size:11px;min-height:1.7em;overflow:hidden;resize:none;line-height:1.4">'+escHtml(String(r.desc||''))+'</textarea></td>'
    + '<td style="padding:2px">'+inp(i,'qty',r.qty,'','center')+'</td>'
    + '<td style="padding:2px">'+inp(i,'price',r.price,'','center')+'</td>'
    + '<td style="padding:2px"><input value="'+escHtml(String(r.amount||''))+'" oninput="updateDocManualCell('+i+',\'amount\',this.value)" onblur="blurDocManualAmount(this,'+i+')" placeholder="0.00" style="width:100%;font-size:11px;text-align:right"></td>'
    + '<td style="padding:2px;text-align:center"><button onclick="removeDocManualRow('+i+')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px" title="ลบแถว">✕</button></td>'
    + '</tr>'
  ).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:6px;font-size:11px">— ยังไม่มีแถว กด "+ เพิ่มแถว" —</td></tr>';
  // ปรับความสูง textarea รายการให้พอดีเนื้อหาตอนเปิดมา
  [...tb.querySelectorAll('textarea')].forEach(_autoGrow);
}
function _autoGrow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; }
function addDocManualRow() { _docManual().rows.push({ no:'', desc:'', qty:'', price:'', amount:'' }); renderDocManualRows(); saveSTDealData(); }
function removeDocManualRow(i) { const dm=_docManual(); dm.rows.splice(i,1); renderDocManualRows(); saveSTDealData(); }
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

// ── ขอข้ามการรับ PO (ต้องผ่านการอนุมัติจาก Approver ก่อนออกเอกสารได้) ──
function _stTimeline(text, type) {
  stDealData.notes = stDealData.notes || [];
  stDealData.notes.push({ id: Date.now(), user: (currentUser && (currentUser.displayName || currentUser.email)) || 'User', text: text, ts: new Date().toISOString(), type: type || 'note' });
}
async function requestPOWaiver() {
  const reason = (prompt('เหตุผลที่ต้องข้ามการรับ PO ลูกค้า (จะส่งให้ผู้อนุมัติพิจารณา):', '') || '').trim();
  if (!reason) { toast('กรุณาระบุเหตุผล', 'error'); return; }
  stDealData.poWaiver = { status: 'pending', reason: reason, by: (currentUser && (currentUser.displayName || currentUser.email)) || 'User', at: new Date().toISOString() };
  _stTimeline('📝 ขอข้ามการรับ PO ลูกค้า — รออนุมัติ (เหตุผล: ' + reason + ')', 'custpo');
  await saveSTDealData();
  renderCustPOTab(); renderSTTimeline();
  toast('ส่งคำขอข้าม PO แล้ว — รอผู้อนุมัติพิจารณา', 'success');
  // แจ้งผู้อนุมัติ (ถ้ามีฟังก์ชันส่งเมล)
  try { const q = quotesData.find(x => x.id === stQuoteId); if (q && typeof sendPOReceivedEmail === 'function') sendPOReceivedEmail(q, '(ขอข้าม PO — รออนุมัติ)').catch(function(){}); } catch(e) {}
}
async function approvePOWaiver() {
  if (!(userRoles.isApprover || userRoles.isAdmin)) { toast('เฉพาะผู้อนุมัติเท่านั้น', 'error'); return; }
  const w = stDealData.poWaiver; if (!w || w.status !== 'pending') return;
  if (!confirm('อนุมัติให้ "ข้ามการรับ PO" สำหรับดีลนี้? ระบบจะเปลี่ยนสถานะเป็น PO Received และออกเอกสารได้')) return;
  w.status = 'approved';
  w.approvedBy = (currentUser && (currentUser.displayName || currentUser.email)) || 'Approver';
  w.approvedAt = new Date().toISOString();
  _stTimeline('✅ อนุมัติให้ข้ามการรับ PO โดย ' + w.approvedBy, 'custpo');
  await saveSTDealData();
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
  _stTimeline('✕ ปฏิเสธคำขอข้ามการรับ PO โดย ' + ((currentUser && (currentUser.displayName || currentUser.email)) || 'Approver'), 'custpo');
  delete stDealData.poWaiver;
  await saveSTDealData();
  renderCustPOTab(); renderSTTimeline();
  toast('ปฏิเสธคำขอแล้ว', 'success');
}
async function cancelPOWaiver() {
  const w = stDealData.poWaiver; if (!w || w.status !== 'pending') return;
  if (!confirm('ยกเลิกคำขอข้าม PO?')) return;
  delete stDealData.poWaiver;
  await saveSTDealData();
  renderCustPOTab(); renderSTTimeline();
  toast('ยกเลิกคำขอแล้ว', 'success');
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
  const items = await getQuoteItemsForST();
  const po = (stDealData.custPOs || [])[0] || {};
  const co = companySettings || {};
  const referNote = (stDealData.docReferNote || {})[kind] || '';
  const html = buildCustomerDocHTML(kind, copy, q, items, po, co, stDealData.docManual || null, referNote);
  printViaIframe(html);
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
  // หัวบริษัท — ดึงจากหน้า "ตั้งค่าบริษัท" (แก้ในแอปได้เลย) ถ้าเว้นว่างใช้ค่าเริ่มต้น
  const _cs = (typeof companySettings !== 'undefined' && companySettings) ? companySettings : {};
  const CO_NAME_TH = _cs.CompanyName   || 'บริษัท ไอที เซอร์วิสเซส จำกัด';
  const CO_NAME_EN = _cs.CompanyNameEn || 'IT SERVICES CO.,LTD.';
  const CO_ADDR_TH_L = 'สำนักงานใหญ่', CO_ADDR_TH_V = _cs.Address   || '168/8 ถนนพัฒนาชนบท 3 แขวงคลองสองต้นนุ่น เขตลาดกระบัง กรุงเทพมหานคร 10520';
  const CO_ADDR_EN_L = 'HEAD OFFICE',  CO_ADDR_EN_V = _cs.AddressEn || '168/8 Patthana Chonabot 3 Rd, Khlong Song Ton Nun Sub District, Lat Krabang District, Bangkok 10520';
  const CO_TEL = _cs.Phone || '02-108-6113', CO_FAX = _cs.Fax || _cs.Phone || '02-108-6113', CO_TAXID = _cs.TaxID || '0105559006113';
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

  const subTotal = items.reduce((s,it)=>{ const d=parseFloat(it.DiscountPct||0)/100; return s + parseFloat(it.Quantity||0)*parseFloat(it.UnitPrice||0)*(1-d); }, 0);
  const vatAmt = subTotal * 0.07;
  const grand = subTotal + vatAmt;
  const bahtWords = (typeof bahtText === 'function') ? bahtText(grand) : '';

  // แถวรายการ + เติมแถวว่างให้ตารางเต็มหน้า
  const cellB = 'border-right:1px solid '+NAVY+'55;';
  const _mHas = r => ['no','desc','qty','price','amount'].some(f => String(r[f]||'').trim());
  const _manualRows = (manual && manual.on && Array.isArray(manual.rows)) ? manual.rows.filter(_mHas) : [];
  const _manualOn = _manualRows.length > 0;
  let rows;
  if (_manualOn) {
    // โหมด Manual: กรอกรายการเองทีละคอลัมน์ (ไม่ดึงจากใบเสนอราคา) — ยอดรวมด้านล่างยังคำนวณจากใบเสนอราคาเดิม
    rows = _manualRows.map(r =>
      '<tr style="vertical-align:top">'
      +'<td style="padding:5px 6px;text-align:center;'+cellB+'">'+esc(r.no||'')+'</td>'
      +'<td style="padding:5px 10px;'+cellB+'white-space:pre-line;line-height:1.5">'+esc(r.desc||'')+'</td>'
      +'<td style="padding:5px 8px;text-align:center;'+cellB+'">'+esc(r.qty||'')+'</td>'
      +(noPrice ? ''
        : '<td style="padding:5px 10px;text-align:center;'+cellB+'font-family:'+F_NUM+'">'+esc(r.price||'')+'</td>'
          +'<td style="padding:5px 10px;text-align:right;font-family:'+F_NUM+'">'+_fmtAmt(r.amount)+'</td>')
      +'</tr>'
    ).join('');
  } else {
    rows = items.map((it,i)=>{
      const d=parseFloat(it.DiscountPct||0)/100, line=parseFloat(it.Quantity||0)*parseFloat(it.UnitPrice||0)*(1-d);
      return '<tr style="vertical-align:top">'
        +'<td style="padding:5px 6px;text-align:center;'+cellB+'">'+(i+1)+'</td>'
        +'<td style="padding:5px 10px;'+cellB+'"><div style="font-weight:500">'+esc(it.Title||it.Description||'-')+'</div>'+((it.Description&&it.Title)?'<div style="font-size:10px;color:#555;margin-top:2px;white-space:pre-line;line-height:1.5">'+esc(it.Description)+'</div>':'')+'</td>'
        +'<td style="padding:5px 8px;text-align:center;'+cellB+'">'+fmt2(it.Quantity||0)+'</td>'
        +(noPrice ? ''
          : '<td style="padding:5px 10px;text-align:right;'+cellB+'font-family:'+F_NUM+'">'+fmt2(it.UnitPrice||0)+'</td>'
            +'<td style="padding:5px 10px;text-align:right;font-family:'+F_NUM+'">'+fmt2(line)+'</td>')
        +'</tr>';
    }).join('');
  }
  // แถว filler ที่ "ดิ้น" ยืดเต็มพื้นที่ที่เหลือ (height:100%) — ดันยอดรวมไปชิดล่าง เส้นคอลัมน์ต่อเนื่อง
  // E.&O.E. อยู่ล่างสุดของคอลัมน์ "รายการ/DESCRIPTION" (ไม่แยกเป็นแถวเต็มความกว้าง)
  const _refNote = String(referNote||'').trim();
  const fillerRow = '<tr style="height:100%"><td style="'+cellB+'">&nbsp;</td>'
    +'<td style="'+cellB+';vertical-align:bottom;padding:0 10px 4px">'
      +(_refNote?'<div style="text-align:left;font-size:12px;color:#1a1a2e;margin-bottom:5px;white-space:pre-line;line-height:1.5">'+esc(_refNote)+'</div>':'')
      +'<div style="text-align:center;font-size:10px;color:#777">ผิด ตก ยกเว้น E. &amp; O.E.</div>'
    +'</td>'
    +'<td style="'+cellB+'"></td>'+(noPrice?'':'<td style="'+cellB+'"></td><td></td>')+'</tr>';

  const colspanFull = noPrice ? 3 : 5;
  const logoHtml = (co.LogoURL||co.LogoBase64) ? '<img src="'+(co.LogoBase64||co.LogoURL)+'" style="max-height:85px;max-width:115px;object-fit:contain"/>' : '';

  // กล่องหัวข้อ (ป้ายสำเนา + เอกสารออกเป็นชุด + ไม่ใช่ใบกำกับภาษี)
  const copyBox = '<div style="text-align:right;flex-shrink:0;white-space:nowrap">'
    +'<div style="display:inline-block;background:'+NAVY+';color:#fff;border-radius:16px;padding:6px 22px;font-weight:700;font-size:15px;white-space:nowrap">'+copy.recip+'</div>'
    +'<div style="margin-top:34px">'
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

  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"/>'
    +'<title>'+esc(titleTh)+' '+docNo+'</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Sarabun","Segoe UI",sans-serif;font-size:12px;color:#1a1a2e;background:#fff;padding:24px}thead{display:table-header-group}.doc-foot{page-break-inside:avoid}@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:5mm}button{display:none!important}}</style>'
    +'</head><body><div style="width:200mm;max-width:100%;margin:0 auto;min-height:285mm;display:flex;flex-direction:column">'
    // header — กล่องสำเนา "ลอย" มุมขวาบน (absolute) เพื่อไม่ให้เบียดกับที่อยู่
    +'<div style="position:relative;display:flex;align-items:flex-start;gap:12px">'
    +logoHtml
    +'<div style="flex:1;min-width:0">'
    +(co.HeaderNameImage
      // ใช้ภาพชื่อบริษัท (ระยะห่างเป๊ะแบบฟอร์มจริง) — ดึง/ย่นตามขนาด กว้าง/สูง ที่ตั้งไว้
      ? '<img src="'+co.HeaderNameImage+'" style="'+(co.HeaderNameW?('width:'+(+co.HeaderNameW)+'px;'):'')+(co.HeaderNameH?('height:'+(+co.HeaderNameH)+'px;'):'height:auto;')+((co.HeaderNameW&&co.HeaderNameH)?'object-fit:fill;':'object-fit:contain;')+'display:block"/>'
      // ไม่มีภาพ → ใช้ข้อความ + ปรับ letter-spacing ให้ยาวเสมอกัน (สคริปต์ท้ายเอกสาร)
      : '<div style="display:inline-block">'
        +'<div id="_cnTh" style="font-family:'+F_HEAD+';font-size:21px;font-weight:700;color:'+NAVY+';line-height:1.1;letter-spacing:-0.3px;white-space:nowrap">'+CO_NAME_TH+'</div>'
        +'<div id="_cnEn" style="font-family:'+F_HEAD+';font-size:16px;font-weight:700;color:'+NAVY+';line-height:1.15;white-space:nowrap;-webkit-text-stroke:0.35px '+NAVY+'">'+CO_NAME_EN+'</div>'
        +'</div>')
    +'<table style="border-collapse:collapse;margin-top:3px;font-family:'+F_ADDR+'"><tbody>'
    +'<tr><td style="font-size:17px;color:#222;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_TH_L+'</td><td style="font-size:17px;color:#222;vertical-align:top;padding:0 5px;line-height:1.1">:</td><td style="font-size:17px;color:#222;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_TH_V+'</td></tr>'
    +'<tr><td style="font-size:17px;color:#333;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_EN_L+'</td><td style="font-size:17px;color:#333;vertical-align:top;padding:0 5px;line-height:1.1">:</td><td style="font-size:17px;color:#333;white-space:nowrap;vertical-align:top;line-height:1.1">'+CO_ADDR_EN_V+'</td></tr>'
    +'</tbody></table>'
    +'<div style="font-family:'+F_ADDR+';font-size:17px;color:#333;margin-top:2px">TEL. '+CO_TEL+' &nbsp;&nbsp; FAX. '+CO_FAX+'</div>'
    +'</div>'
    +'<div style="position:absolute;top:0;right:0">'+copyBox+'</div></div>'
    // tax id + title pill + no
    +'<div style="display:flex;justify-content:space-between;align-items:flex-end;margin:8px 0 10px">'
    +'<div style="font-size:11px;color:#1a1a2e">เลขประจำตัวผู้เสียภาษีอากร '+CO_TAXID+'</div>'
    +'<div style="background:'+NAVY+';color:#fff;border-radius:16px;padding:6px 22px;text-align:center"><div style="font-size:15px;font-weight:700">'+esc(titleTh)+'</div><div style="font-size:9px;letter-spacing:0.05em">'+titleEn+'</div></div>'
    +'<div style="font-size:11px;text-align:right"><b>เลขที่</b><br>NO. '+esc(docNo)+'</div>'
    +'</div>'
    // customer + info — 2 กล่องแยก (กรอบมน)
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
    +'<div style="flex:1">'+infoBox+'</div></div>'
    // items table — กรอบโค้งมุม + ตารางยืดเต็ม wrapper (flex:1 ให้ table grow, filler row ดันยอดรวมชิดล่าง)
    +'<div style="flex:1;border:1px solid '+NAVY+';border-radius:10px;overflow:hidden;display:flex;flex-direction:column">'
    +'<table style="width:100%;flex:1;border-collapse:collapse">'
    +'<thead><tr style="background:'+NAVY+';color:#fff;font-size:11px">'
    +'<th style="padding:6px 6px;width:42px;border-right:1px solid #fff5">ลำดับ<br><span style="font-weight:400;font-size:9px">ITEM</span></th>'
    +'<th style="padding:6px 10px;border-right:1px solid #fff5">รายการ<br><span style="font-weight:400;font-size:9px">DESCRIPTION</span></th>'
    +'<th style="padding:6px 8px;width:70px;border-right:1px solid #fff5">จำนวน<br><span style="font-weight:400;font-size:9px">QUANTITY</span></th>'
    +(noPrice?''
      :'<th style="padding:6px 8px;width:95px;border-right:1px solid #fff5">ราคาต่อหน่วย<br><span style="font-weight:400;font-size:9px">UNIT PRICE</span></th>'
       +'<th style="padding:6px 8px;width:105px">จำนวนเงิน<br><span style="font-weight:400;font-size:9px">AMOUNT</span></th>')
    +'</tr></thead><tbody>'+rows+fillerRow
    // ── หมายเหตุ + ยอดรวม เป็นแถวต่อในตารางเดียวกัน (เส้นคอลัมน์ตรงกับด้านบน) ──
    +(noPrice
      ? '<tr><td colspan="3" style="border:1px solid '+NAVY+';padding:8px 10px;font-size:10px;line-height:1.55;color:#333;vertical-align:top">'+NOTE_TERMS+'</td></tr>'
      : '<tr>'
        +'<td colspan="3" rowspan="3" style="border:1px solid '+NAVY+';padding:8px 10px;vertical-align:top">'+NOTE_TERMS+'<div style="margin-top:8px;font-size:11px;border-top:1px solid '+NAVY+'55;padding-top:5px;text-align:center;font-weight:600">'+esc(bahtWords)+'</div></td>'
        +'<td style="background:'+NAVY+';color:#fff;border:1px solid '+NAVY+';padding:6px 10px;font-size:11px"><b>รวมเงิน</b> TOTAL</td>'
        +'<td style="border:1px solid '+NAVY+';padding:6px 10px;text-align:right;font-family:'+F_NUM+'">'+fmt2(subTotal)+'</td></tr>'
        +'<tr><td style="background:'+NAVY+';color:#fff;border:1px solid '+NAVY+';padding:6px 10px;font-size:11px"><b>ภาษีมูลค่าเพิ่ม</b> PLUS VAT</td>'
        +'<td style="border:1px solid '+NAVY+';padding:6px 10px;text-align:right;font-family:'+F_NUM+'">'+fmt2(vatAmt)+'</td></tr>'
        +'<tr><td style="background:'+NAVY+';color:#fff;border:1px solid '+NAVY+';padding:7px 10px;font-size:11px"><b>ยอดเงินสุทธิ</b> GRAND TOTAL</td>'
        +'<td style="border:1px solid '+NAVY+';padding:7px 10px;text-align:right;font-family:'+F_NUM+';font-weight:700;font-size:14px">'+fmt2(grand)+'</td></tr>')
    +'</tbody></table></div>'
    // footer signatures
    +'<div class="doc-foot" style="margin-top:12px">'+footer+'</div>'
    +'<div style="text-align:center;margin-top:16px;padding-top:10px;border-top:1px dashed #ccc"><button onclick="window.print()" style="padding:8px 24px;background:'+NAVY+';color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨 พิมพ์ / บันทึก PDF</button></div>'
    +'</div>'
    // ปรับความยาวชื่อบริษัท 2 แถวให้เสมอกัน: ยืด letter-spacing ของอังกฤษให้เท่าความกว้างของไทย
    +'<script>(function(){function eq(){var th=document.getElementById("_cnTh"),en=document.getElementById("_cnEn");if(!th||!en)return;en.style.letterSpacing="0px";var t=th.getBoundingClientRect().width,e=en.getBoundingClientRect().width,n=(en.textContent||"").length;if(n>1){var ls=(t-e)/(n-1);if(ls<-0.6)ls=-0.6;if(ls>6)ls=6;en.style.letterSpacing=ls+"px";}}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(eq);}eq();setTimeout(eq,120);})();<\/script>'
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

async function sendApprovalRequestEmail(q, attachment) {
  const to = q.ApproverEmail || '';
  if (!to || !to.includes('@')) return;
  const subject = '[ใบเสนอราคา] ' + (q.Title||'') + ' — ' + (q.ClientName||'');
  const body = '🔔 มีใบเสนอราคารออนุมัติ (แนบไฟล์ PDF ใบเสนอราคาไว้ด้านล่าง)\n\n'
    + 'ใบเสนอราคา : ' + (q.Title||'') + '\n'
    + 'ลูกค้า      : ' + (q.ClientName||'') + '\n'
    + 'มูลค่ารวม   : ' + fmt(q.TotalAmount||0) + '\n'
    + 'ผู้จัดทำ    : ' + (q.SaleName||q.SaleEmail||'') + '\n\n'
    + 'กรุณาเข้าสู่ระบบ SalePro เพื่ออนุมัติหรือปฏิเสธใบเสนอราคา';
  await apiPost('sendEmail', '_', null, { to, subject, body, attachments: attachment ? [attachment] : [] });
}

async function sendApprovalResultEmail(q, status, comment) {
  const to = q.SaleEmail || '';
  if (!to || !to.includes('@')) return;
  const isApproved = status === 'Approved';
  // ใช้หัวเรื่องฐานเดียวกับอีเมลขออนุมัติ + RE: เพื่อให้ร้อยอยู่เธรดเดียวกัน
  const subject = 'RE: [ใบเสนอราคา] ' + (q.Title||'') + ' — ' + (q.ClientName||'');
  const body = (isApproved ? '✅ ใบเสนอราคาของคุณได้รับการอนุมัติแล้ว' : '❌ ใบเสนอราคาของคุณถูกปฏิเสธ') + '\n\n'
    + 'ใบเสนอราคา : ' + (q.Title||'') + '\n'
    + 'ลูกค้า      : ' + (q.ClientName||'') + '\n'
    + 'มูลค่ารวม   : ' + fmt(q.TotalAmount||0) + '\n'
    + 'อนุมัติโดย  : ' + (q.ApproverName||q.ApproverEmail||'') + '\n'
    + (comment ? '\nความคิดเห็น:\n' + comment : '');
  await apiPost('sendEmail', '_', null, { to, subject, body });
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
    + '<div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px">SalePro · iT Services Co., Ltd.</div>'
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
    + '<a href="https://itservices.co.th/salepro/index.html" style="display:inline-block;background:#1a3a5c;color:#fff;text-decoration:none;padding:11px 28px;border-radius:8px;font-size:13px;font-weight:600">เข้าระบบ SalePro →</a>'
    + '</div></div>'
    + '<div style="padding:14px 28px;text-align:center;border-top:1px solid #e5e7eb;background:#f9fafb">'
    + '<div style="font-size:11px;color:#9ca3af">iT Services Co., Ltd. · อีเมลนี้ส่งอัตโนมัติจาก SalePro</div>'
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
  const baseUrl = 'https://itservices.co.th/salepro/index.html';
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

function renderSTDocs() {
  renderDeliveryChecklist();
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

