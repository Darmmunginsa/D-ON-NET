// ============================================================
// RECURRING QUOTES — ออกใบเสนอราคาซ้ำอัตโนมัติ (รายเดือน / รายปี)
// ─ ใช้สำหรับงาน long-term / subscription ที่ต้องออกใบเสนอราคาเองทุกเดือน/ปี
// ─ เลขที่ใบ "run ตามระบบ" (ไม่ใช่ Revise) ด้วย _nextQuoteNo()
// ─ เก็บตารางเวลาเป็น JSON ใน Settings list: Recurring_<quoteId>
//     { enabled, freq:'monthly'|'yearly', nextDate:'YYYY-MM-DD', endDate:'',
//       emails:[...], status:'Draft', lastIssued:'', count:0 }
// ─ ตรวจ + ออกใบตอน syncAll() (เหมือน checkExpiriesDue) — ไม่สร้างคอลัมน์ใหม่
// ============================================================

// per-quote settings ที่ต้องคัดลอกไปใบใหม่ (ยกเว้น DealStatus_/Recurring_/QuoteParent_)
const _REC_CLONE_PREFIXES = [
  'QuoteItemExtra','QuoteRowH','QuoteCols','ZoneFonts','QuoteSpacing',
  'QuoteDocEN','QuoteValidity','QuoteDisc','QuoteFax','QuoteTag','QuoteSource'
];

function getRecurring(quoteId) {
  try {
    const it = (_settingsCache || []).find(i => i.Title === 'Recurring_' + quoteId);
    if (it && it.Value) return JSON.parse(it.Value) || null;
  } catch(e) {}
  return null;
}
function hasRecurring(quoteId) { const r = getRecurring(quoteId); return !!(r && r.enabled); }
async function saveRecurring(quoteId, obj) { await putSettingValue('Recurring_' + quoteId, JSON.stringify(obj)); }

// เดินวันถัดไป +1 เดือน / +1 ปี (รักษา "วันที่" ถ้าสิ้นเดือนไม่พอจะปัดมาวันสุดท้ายของเดือน)
function _recAdvance(dateStr, freq) {
  const d = new Date(dateStr + 'T00:00:00'); if (isNaN(d)) return dateStr;
  const day = d.getDate();
  if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else { d.setDate(1); d.setMonth(d.getMonth() + 1); const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); d.setDate(Math.min(day, last)); }
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _recFreqLabel(f) { return f === 'yearly' ? 'รายปี' : 'รายเดือน'; }

// ── MODAL ────────────────────────────────────────────────
let _recQuoteId = null;
function openRecurringModal(quoteId) {
  const q = quotesData.find(x => String(x.id) === String(quoteId));
  if (!q) return;
  _recQuoteId = quoteId;
  const r = getRecurring(quoteId) || {};
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('rec-quote-label').textContent = (q.Title || '') + ' — ' + (q.ClientName || '-');
  document.getElementById('rec-enabled').checked = r.enabled !== false && !!r.freq ? true : (r.enabled === true);
  document.getElementById('rec-freq').value = r.freq || 'monthly';
  document.getElementById('rec-next').value = r.nextDate || _recAdvance(today, r.freq || 'monthly');
  document.getElementById('rec-end').value = r.endDate || '';
  document.getElementById('rec-status').value = r.status || 'Draft';
  document.getElementById('rec-emails').value = (r.emails || [q.SaleEmail].filter(Boolean)).join(', ');
  const info = document.getElementById('rec-info');
  if (r.enabled && r.nextDate) info.textContent = 'ออกไปแล้ว ' + (r.count||0) + ' ครั้ง' + (r.lastIssued?(' · ล่าสุด '+r.lastIssued):'') + ' · ครั้งถัดไป ' + r.nextDate;
  else info.textContent = 'ยังไม่ได้ตั้งเวลา — ระบบจะออกใบใหม่อัตโนมัติตามรอบที่กำหนด (เลขที่รันต่อจากระบบ ไม่ใช่ Revise)';
  document.getElementById('rec-remove-btn').style.display = r.enabled ? 'inline-block' : 'none';
  document.getElementById('rec-issue-btn').style.display = r.enabled ? 'inline-block' : 'none';
  openModal('recurring-modal');
}

function _recParseEmails(raw) {
  return (raw || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
}

async function saveRecurringFromModal() {
  if (!_recQuoteId) return;
  const enabled = document.getElementById('rec-enabled').checked;
  const freq = document.getElementById('rec-freq').value;
  const nextDate = document.getElementById('rec-next').value;
  const endDate = document.getElementById('rec-end').value || '';
  const status = document.getElementById('rec-status').value || 'Draft';
  const emails = _recParseEmails(document.getElementById('rec-emails').value);
  if (enabled && !nextDate) { toast('กรุณาระบุวันที่ออกครั้งถัดไป', 'error'); return; }
  const prev = getRecurring(_recQuoteId) || {};
  const obj = { enabled, freq, nextDate, endDate, status, emails,
    lastIssued: prev.lastIssued || '', count: prev.count || 0 };
  try {
    toast('กำลังบันทึก...', 'info');
    await saveRecurring(_recQuoteId, obj);
    toast(enabled ? '✅ ตั้งออกซ้ำ' + _recFreqLabel(freq) + 'แล้ว' : 'ปิดการออกซ้ำแล้ว', 'success');
    closeModal('recurring-modal');
    if (typeof renderQuotes === 'function') renderQuotes();
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

async function removeRecurring() {
  if (!_recQuoteId) return;
  if (!confirm('ยกเลิกการออกใบเสนอราคาซ้ำอัตโนมัติของใบนี้?')) return;
  const prev = getRecurring(_recQuoteId) || {};
  prev.enabled = false;
  try { await saveRecurring(_recQuoteId, prev); toast('ยกเลิกแล้ว', 'success'); closeModal('recurring-modal'); if (typeof renderQuotes==='function') renderQuotes(); }
  catch(e) { toast('ไม่สำเร็จ: ' + e.message, 'error'); }
}

// ออกใบเดี๋ยวนี้ (ปุ่มทดสอบ) — ออก 1 ใบตามค่าปัจจุบัน
async function issueRecurringNow() {
  if (!_recQuoteId) return;
  const q = quotesData.find(x => String(x.id) === String(_recQuoteId));
  const sched = getRecurring(_recQuoteId);
  if (!q || !sched) { toast('ยังไม่ได้บันทึกตารางเวลา', 'error'); return; }
  if (!confirm('ออกใบเสนอราคาใหม่จากใบนี้ทันที (เลขที่รันต่อจากระบบ)?')) return;
  try {
    toast('กำลังออกใบใหม่...', 'info');
    const allItems = await getListItems(CONFIG.lists.quoteItems);
    const newNo = await _issueRecurring(q, sched, allItems, true);
    await saveRecurring(_recQuoteId, sched);
    closeModal('recurring-modal');
    toast('✅ ออกใบใหม่ ' + newNo + ' แล้ว', 'success');
    if (typeof renderQuotes === 'function') renderQuotes();
  } catch(e) { toast('ออกใบไม่สำเร็จ: ' + e.message, 'error'); }
}

// ── ตัวสร้างใบใหม่ 1 ใบ จากใบต้นทาง (คืนค่าเลขที่ใบใหม่) ──
async function _issueRecurring(src, sched, allItems, manual) {
  const srcId = src.id;
  const today = new Date().toISOString().split('T')[0];
  const newNo = _nextQuoteNo(src.SaleName || src.SaleEmail || '');
  // 1) สร้าง header ใบใหม่ (ก๊อปจากต้นทาง, เปลี่ยนเลขที่/วันที่/สถานะ)
  const fields = {
    Title: newNo,
    ClientName: src.ClientName || '(ไม่ระบุ)', ContactPerson: src.ContactPerson || '',
    Phone: src.Phone || '', Email: src.Email || '',
    QuoteDate: today, PaymentMethod: src.PaymentMethod || '',
    SubTotal: +src.SubTotal || 0, DiscountPct: +src.DiscountPct || 0, TotalAmount: +src.TotalAmount || 0,
    Status: sched.status || 'Draft',
    ApproverEmail: src.ApproverEmail || '', ApproverName: src.ApproverName || '',
    Note: src.Note || '', Terms: src.Terms || '',
    SaleName: src.SaleName || '', SaleTel: src.SaleTel || '', SaleEmail: src.SaleEmail || '',
    CustomerAddress: src.CustomerAddress || '', CustomerTaxID: src.CustomerTaxID || '', CustomerTel: src.CustomerTel || ''
  };
  const created = await createListItem(CONFIG.lists.quotations, fields);
  const newId = created.id;
  // ให้ _nextQuoteNo ครั้งถัดไป (ถ้าออกหลายใบในรอบเดียว) นับต่อได้ถูก
  quotesData.push({ id: newId, Title: newNo, SaleName: src.SaleName||'', SaleEmail: src.SaleEmail||'', Status: fields.Status, ClientName: fields.ClientName });
  // 2) ก๊อปรายการ (line items)
  const items = (allItems || []).filter(i => String(i.QuoteID) === String(srcId));
  for (const it of items) {
    await createListItem(CONFIG.lists.quoteItems, {
      Title: it.Title || '', QuoteID: newId,
      Quantity: +it.Quantity || 0, Unit: it.Unit || '', UnitPrice: +it.UnitPrice || 0,
      DiscountPct: +it.DiscountPct || 0, LineTotal: +it.LineTotal || 0, Description: it.Description || ''
    });
  }
  // 3) ก๊อป per-quote settings (รูปแบบเอกสาร/คอลัมน์/ฟอนต์ ฯลฯ)
  for (const pfx of _REC_CLONE_PREFIXES) {
    const s = (_settingsCache || []).find(i => i.Title === pfx + '_' + srcId);
    if (s && s.Value != null && s.Value !== '') { try { await putSettingValue(pfx + '_' + newId, s.Value); } catch(e) {} }
  }
  // 4) ผูกความสัมพันธ์กับใบต้นทาง (สายเดียวกัน)
  try { if (typeof saveQuoteParent === 'function') await saveQuoteParent(newId, srcId); } catch(e) {}
  // 5) อัปเดตตารางเวลา (เลื่อนรอบถัดไป)
  sched.lastIssued = today;
  sched.count = (sched.count || 0) + 1;
  if (!manual) {
    sched.nextDate = _recAdvance(sched.nextDate || today, sched.freq);
    if (sched.endDate && sched.nextDate > sched.endDate) sched.enabled = false;
  }
  // 6) แจ้งเตือนทางเมล
  const emails = (sched.emails || []).filter(Boolean);
  if (emails.length) {
    const subject = '[SalePro] 🔁 สร้างใบเสนอราคาอัตโนมัติ ' + newNo + ' — ' + (src.ClientName || '');
    const body = 'ระบบได้สร้างใบเสนอราคาใหม่อัตโนมัติ (' + _recFreqLabel(sched.freq) + ')\n'
      + '────────────────────────\n'
      + 'เลขที่ใบใหม่: ' + newNo + '\n'
      + 'ลูกค้า: ' + (src.ClientName || '-') + '\n'
      + 'มูลค่า: ' + (fields.TotalAmount).toLocaleString('th-TH') + ' บาท\n'
      + 'สถานะ: ' + fields.Status + (fields.Status === 'Draft' ? ' (ร่าง — โปรดตรวจสอบก่อนส่งลูกค้า)' : '') + '\n'
      + 'ออกจากใบต้นแบบ: ' + (src.Title || '') + '\n'
      + '────────────────────────\n'
      + 'โปรดเข้าระบบ SalePro เพื่อตรวจสอบและส่งให้ลูกค้า';
    for (const to of emails) { try { await _sendMailGraph(to, subject, body); } catch(err) { console.warn('recurring mail ' + to + ' failed:', err.message); } }
  }
  // 7) บันทึก timeline ของใบต้นทาง
  try {
    const ds = parseDealStatus(src.DealStatus);
    ds.notes = ds.notes || [];
    ds.notes.push({ id: Date.now(), user: 'ระบบ', ts: new Date().toISOString(), type: 'recurring',
      text: '🔁 ออกใบเสนอราคาอัตโนมัติ (' + _recFreqLabel(sched.freq) + '): ' + newNo + (emails.length?(' → แจ้ง '+emails.join(', ')):'') });
    const val = serializeDealStatus(ds); await putStoredDealStatus(srcId, val); src.DealStatus = val;
  } catch(e) {}
  return newNo;
}

// ── ตรวจ + ออกใบที่ถึงกำหนด (เรียกตอน syncAll) ──
let _recChecked = false;
async function checkRecurringDue() {
  if (_recChecked || !currentUser) return;
  _recChecked = true;
  const today = new Date().toISOString().split('T')[0];
  // หาตารางเวลาที่ถึงกำหนดก่อน (กันโหลด quoteItems โดยไม่จำเป็น)
  const due = [];
  (_settingsCache || []).forEach(i => {
    if (!/^Recurring_/.test(i.Title || '')) return;
    let s; try { s = JSON.parse(i.Value || '{}'); } catch(e) { return; }
    if (!s || !s.enabled || !s.freq || !s.nextDate) return;
    if (s.nextDate > today) return;                       // ยังไม่ถึงรอบ
    if (s.endDate && s.nextDate > s.endDate) return;      // เกินวันสิ้นสุด
    const qid = i.Title.slice('Recurring_'.length);
    const q = quotesData.find(x => String(x.id) === String(qid));
    if (q) due.push({ qid, q, sched: s });
  });
  if (!due.length) return;
  let issued = 0;
  let allItems = null;
  try { allItems = await getListItems(CONFIG.lists.quoteItems); } catch(e) { allItems = []; }
  for (const d of due) {
    try {
      const newNo = await _issueRecurring(d.q, d.sched, allItems, false);
      await saveRecurring(d.qid, d.sched);
      issued++;
      console.log('recurring issued:', newNo, 'from', d.q.Title);
    } catch(e) { console.warn('recurring issue failed for ' + d.qid + ':', e.message); }
  }
  if (issued) {
    toast('🔁 ออกใบเสนอราคาอัตโนมัติ ' + issued + ' ใบแล้ว', 'success');
    try { if (typeof syncAll === 'function') { /* reload เบา ๆ โดย render */ } renderQuotes(); renderDash(); } catch(e) {}
  }
}
