// ============================================================
// CONTRACTS — ทะเบียน/ติดตามสัญญา + แจ้งเตือนก่อนหมดอายุ
// เก็บในลิสต์แยก CONFIG.lists.contracts (1 แถว = 1 สัญญา, Value = JSON)
// ============================================================
let contractsData = [];        // [{spId, id, invNo, party, name, vendorTax, poRef, start, end, billing, value, coordinator, alertDays, alertEmails, quoteId, manualDisbursed, note, remindSentFor}]
let editingContractId = null;  // spId ที่กำลังแก้

async function loadContracts() {
  try {
    const items = await getListItems(CONFIG.lists.contracts);
    contractsData = items.map(it => { let o={}; try{ o=JSON.parse(it.Value||'{}')||{}; }catch(e){} return { ...o, spId: it.id }; });
  } catch(e) { contractsData = []; }
  // เตรียม paymentsCache ไว้คำนวณยอดเบิกจ่ายจากการชำระ
  try { if (typeof paymentsCache !== 'undefined' && !paymentsCache) paymentsCache = await getListItems(CONFIG.lists.payments); } catch(e) {}
  return contractsData;
}

// ── คำนวณ ──
function _ctToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function contractDaysRemaining(c) {
  if (!c.end) return null;
  const end = new Date(c.end + 'T00:00:00'); if (isNaN(end)) return null;
  return Math.ceil((end - _ctToday()) / 86400000);
}
function contractAcked(c) { return !!(c.ackFor && c.end && c.ackFor === c.end); }   // รับทราบแล้วสำหรับรอบสิ้นสุดปัจจุบัน
async function ackContract(spId) {
  const c = contractsData.find(x => String(x.spId) === String(spId)); if (!c) return;
  c.ackFor = c.end;
  try { await updateListItem(CONFIG.lists.contracts, spId, { Value: JSON.stringify(c) }); toast('🔕 รับทราบแล้ว — ปิดแจ้งเตือนสัญญานี้','success'); }
  catch(e) { toast('ไม่สำเร็จ: '+e.message,'error'); return; }
  renderContracts();
}
function contractStatus(c) {
  const d = contractDaysRemaining(c);
  if (d === null) return { key:'active', label:'—', color:'var(--muted)' };
  if (d < 0) return { key:'expired', label:'หมดอายุ', color:'var(--red)' };
  const alert = +c.alertDays || 30;
  if (d <= alert) return { key:'expiring', label:'ใกล้หมดอายุ', color:'var(--amber)' };
  return { key:'active', label:'ปกติ', color:'var(--green)' };
}
// รายการ id ใบเสนอราคาที่ผูก (รองรับหลายใบ — เก็บคั่นด้วยจุลภาคใน quoteId)
function contractQuoteIds(c) {
  return String(c && c.quoteId || '').split(',').map(s => s.trim()).filter(Boolean);
}
// ยอดเบิกจ่ายสะสม: ถ้าผูกใบเสนอราคา → ผลรวมการชำระของทุกใบที่ผูก (Payments) ไม่งั้นใช้ค่าที่กรอกเอง
function contractDisbursed(c) {
  const ids = contractQuoteIds(c);
  if (ids.length && typeof paymentsCache !== 'undefined' && paymentsCache) {
    return paymentsCache.filter(p => ids.indexOf(String(p.QuoteID)) !== -1).reduce((s,p) => s + (+p.AmountPaid || 0), 0);
  }
  return +c.manualDisbursed || 0;
}

// เปิดดูใบเสนอราคาที่ผูกกับสัญญา (จากหน้าทะเบียนสัญญา)
function viewContractQuote(quoteId) {
  const _q = (typeof quotesData !== 'undefined' ? quotesData : []).find(x => String(x.id) === String(quoteId));
  if (!_q) { if (typeof toast === 'function') toast('ไม่พบใบเสนอราคาที่ผูกไว้ (อาจไม่มีสิทธิ์เข้าถึง)', 'error'); return; }
  if (typeof showPDFForQuote === 'function') showPDFForQuote(_q.id);
  else if (typeof toast === 'function') toast('เปิดดูใบเสนอราคาไม่ได้', 'error');
}

function renderContracts() {
  renderContractReminders();
  const body = document.getElementById('contracts-body'); if (!body) return;
  const q = (document.getElementById('ct-search')?.value || '').toLowerCase();
  const sf = document.getElementById('ct-filter-status')?.value || '';
  let list = contractsData.filter(c =>
    !q || (c.party||'').toLowerCase().includes(q) || (c.name||'').toLowerCase().includes(q) || (c.poRef||'').toLowerCase().includes(q) || (c.invNo||'').toLowerCase().includes(q));
  if (sf) list = list.filter(c => contractStatus(c).key === sf);
  // เรียง: ใกล้หมด/หมดอายุ ขึ้นก่อน (ตามวันคงเหลือน้อยสุด)
  list = list.slice().sort((a,b) => { const da=contractDaysRemaining(a), db=contractDaysRemaining(b); return (da===null?1e9:da) - (db===null?1e9:db); });
  body.innerHTML = list.length ? list.map(c => {
    const val = +c.value || 0, disb = contractDisbursed(c), remain = val - disb, pct = val > 0 ? (disb/val*100) : 0;
    const d = contractDaysRemaining(c), st = contractStatus(c);
    const pctColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)';
    return `<tr>
      <td style="font-family:var(--mono);font-size:11px">${escHtml(c.invNo||'—')}</td>
      <td style="font-weight:500">${escHtml(c.party||'')}</td>
      <td>${escHtml(c.name||'')}</td>
      <td style="font-family:var(--mono);font-size:11px">${escHtml(c.poRef||'')}</td>
      <td style="font-size:11px">${(function(){ const ids=contractQuoteIds(c); if(!ids.length) return '<span style="color:var(--muted)">—</span>'; const qd=(typeof quotesData!=='undefined'?quotesData:[]); return ids.map(function(qid){ const _q=qd.find(x=>String(x.id)===String(qid)); const _t=_q?(_q.Title||('#'+qid)):('#'+qid); return '<a href="#" onclick="viewContractQuote(\''+escHtml(qid)+'\');return false" style="color:var(--accent2);font-family:var(--mono);text-decoration:underline;white-space:nowrap" title="เปิดดูใบเสนอราคา">'+escHtml(_t)+'</a>'; }).join('<br>'); })()}</td>
      <td style="font-size:11px;color:var(--muted)">${c.start?fmtDate(c.start):'—'}</td>
      <td style="font-size:11px">${c.end?fmtDate(c.end):'—'}</td>
      <td style="font-size:12px">${escHtml(c.billing||'')}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmt(val)}</td>
      <td style="font-size:12px">${escHtml(c.coordinator||'')}</td>
      <td style="text-align:center;font-size:12px">${(+c.alertDays||30)} วัน</td>
      <td style="text-align:center;font-family:var(--mono);color:${st.color}">${d===null?'—':d}</td>
      <td><span class="badge" style="background:${st.color}22;color:${st.color};font-size:10px">${st.label}</span>${contractAcked(c)?' <span title="รับทราบแล้ว — ปิดแจ้งเตือน">🔕</span>':''}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmt(disb)}${c.quoteId?' <span style="font-size:9px;color:var(--accent2)" title="ดึงจากการชำระอัตโนมัติ">⛓</span>':''}</td>
      <td style="text-align:right;font-family:var(--mono);color:${remain<0?'var(--red)':'var(--text)'}">${fmt(remain)}</td>
      <td style="text-align:center;font-family:var(--mono);color:${pctColor}">${pct.toFixed(0)}%</td>
      <td style="white-space:nowrap"><button class="action-btn" onclick="editContract('${c.spId}')" title="แก้ไข"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="17" style="text-align:center;padding:32px;color:var(--muted)">ยังไม่มีสัญญา — กด "เพิ่มสัญญา"</td></tr>';
}

// การ์ดเตือนสัญญาใกล้หมด (บนหน้าสัญญา)
function renderContractReminders() {
  const el = document.getElementById('ct-reminders'); if (!el) return;
  const due = contractsData.filter(c => { const d = contractDaysRemaining(c); return d !== null && d <= (+c.alertDays||30) && !contractAcked(c); })
    .sort((a,b) => contractDaysRemaining(a) - contractDaysRemaining(b));
  const ackedCount = contractsData.filter(c => { const d = contractDaysRemaining(c); return d !== null && d <= (+c.alertDays||30) && contractAcked(c); }).length;
  if (!due.length) { el.innerHTML = ackedCount ? `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">🔕 รับทราบแล้ว ${ackedCount} สัญญา (ปิดแจ้งเตือนไว้)</div>` : ''; return; }
  el.innerHTML = `<div class="card" style="border-color:var(--amber);margin-bottom:14px"><div style="padding:12px 16px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--amber)">🔔 สัญญาที่ใกล้หมดอายุ / หมดอายุ (${due.length})${ackedCount?` · <span style="color:var(--muted);font-weight:400">รับทราบแล้ว ${ackedCount}</span>`:''}</div>
    ${due.map(c => { const d=contractDaysRemaining(c); return `<div style="font-size:12px;padding:4px 0;display:flex;gap:10px;align-items:center"><span style="min-width:150px;font-weight:500">${escHtml(c.party||'')}</span><span style="flex:1;color:var(--muted)">${escHtml(c.name||'')}</span><span style="color:${d<0?'var(--red)':'var(--amber)'};white-space:nowrap">${d<0?('เลย '+Math.abs(d)+' วัน'):('อีก '+d+' วัน')} · ${c.end?fmtDate(c.end):''}</span><button class="btn btn-sm" onclick="ackContract('${c.spId}')" title="ปิดแจ้งเตือนสัญญานี้" style="white-space:nowrap;font-size:11px">🔕 รับทราบ</button></div>`; }).join('')}
  </div></div>`;
}

// ── ฟอร์ม ──
// ใบเสนอราคาที่ "ได้รับ PO แล้ว" — Status = PO Received หรือมี custPO บันทึกไว้ (รวมดีลที่ปิดหลังได้ PO)
function _isQuotePOReceived(q) {
  if (q.Status === 'PO Received') return true;
  try {
    if (typeof parseDealStatus === 'function') {
      const ds = parseDealStatus(q.DealStatus);
      if (ds && Array.isArray(ds.custPOs) && ds.custPOs.length) return true;
    }
  } catch(e) {}
  return false;
}
function _fillContractQuoteOptions(selIds) {
  const box = document.getElementById('ct-quote-list'); if (!box) return;
  const chosen = Array.isArray(selIds) ? selIds.map(String) : String(selIds||'').split(',').map(s=>s.trim()).filter(Boolean);
  // id ที่ถูกผูกกับสัญญา "อื่น" ไปแล้ว → กันผูกซ้ำ (ข้ามสัญญาที่กำลังแก้อยู่)
  const usedByOthers = new Set();
  (contractsData || []).forEach(cc => {
    if (String(cc.spId) === String(editingContractId)) return;
    contractQuoteIds(cc).forEach(id => usedByOthers.add(String(id)));
  });
  const rows = (typeof quotesData !== 'undefined' ? quotesData : []).slice()
    .filter(qq => {
      const id = String(qq.id);
      if (chosen.indexOf(id) !== -1) return true;   // ผูกกับสัญญานี้อยู่แล้ว — แสดงเสมอ
      if (usedByOthers.has(id)) return false;        // ผูกกับสัญญาอื่นแล้ว — ซ่อน
      return _isQuotePOReceived(qq);                 // เหลือเฉพาะที่ได้รับ PO แล้ว
    })
    .sort((a,b)=>String(b.Title||'').localeCompare(String(a.Title||'')))
    .map(qq => `<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer;border-bottom:1px solid var(--border2,#eee)"><input type="checkbox" class="ct-quote-cb" value="${escHtml(String(qq.id))}"${chosen.indexOf(String(qq.id))!==-1?' checked':''} style="width:15px;height:15px;flex-shrink:0"><span><b style="font-family:var(--mono)">${escHtml(qq.Title||'')}</b> — ${escHtml(qq.ClientName||'')}</span></label>`).join('');
  box.innerHTML = rows || '<div style="color:var(--muted);padding:6px">— ไม่มีใบเสนอราคาที่ได้รับ PO ให้เลือก —</div>';
}
function openAddContract() {
  editingContractId = null;
  document.getElementById('ctm-title').textContent = 'เพิ่มสัญญา';
  ['ct-invno','ct-party','ct-name','ct-vendortax','ct-poref','ct-start','ct-end','ct-value','ct-coordinator','ct-alertemails','ct-manualdisbursed','ct-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ct-alertdays').value = 30;
  document.getElementById('ct-billing').value = 'รายปี';
  _fillContractQuoteOptions('');
  const _ak=document.getElementById('ct-acked'); if(_ak) _ak.checked=false;
  document.getElementById('ct-delete-btn').style.display = 'none';
  openModal('contract-modal');
}
function editContract(spId) {
  const c = contractsData.find(x => String(x.spId) === String(spId)); if (!c) return;
  editingContractId = spId;
  document.getElementById('ctm-title').textContent = 'แก้ไขสัญญา';
  const _s=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v==null?'':v;};
  _s('ct-invno',c.invNo); _s('ct-party',c.party); _s('ct-name',c.name); _s('ct-vendortax',c.vendorTax);
  _s('ct-poref',c.poRef); _s('ct-start',c.start); _s('ct-end',c.end); _s('ct-value',c.value);
  _s('ct-coordinator',c.coordinator); _s('ct-alertdays',c.alertDays||30); _s('ct-alertemails',c.alertEmails);
  _s('ct-manualdisbursed',c.manualDisbursed); _s('ct-note',c.note);
  document.getElementById('ct-billing').value = c.billing || 'รายปี';
  _fillContractQuoteOptions(c.quoteId||'');
  const _ak=document.getElementById('ct-acked'); if(_ak) _ak.checked=contractAcked(c);
  document.getElementById('ct-delete-btn').style.display = '';
  openModal('contract-modal');
}
async function saveContract() {
  const g = id => document.getElementById(id)?.value || '';
  if (!g('ct-party').trim() && !g('ct-name').trim()) { toast('กรุณาระบุคู่สัญญา หรือชื่อสัญญา','error'); return; }
  const obj = {
    id: editingContractId ? (contractsData.find(x=>String(x.spId)===String(editingContractId))?.id || 'CT'+Date.now()) : 'CT'+Date.now(),
    invNo:g('ct-invno').trim(), party:g('ct-party').trim(), name:g('ct-name').trim(), vendorTax:g('ct-vendortax').trim(),
    poRef:g('ct-poref').trim(), start:g('ct-start'), end:g('ct-end'), billing:g('ct-billing'),
    value:+g('ct-value')||0, coordinator:g('ct-coordinator').trim(), alertDays:+g('ct-alertdays')||30,
    alertEmails:g('ct-alertemails').trim(), quoteId:[...document.querySelectorAll('#ct-quote-list .ct-quote-cb:checked')].map(cb=>cb.value).filter(Boolean).join(','), manualDisbursed:+g('ct-manualdisbursed')||0,
    note:g('ct-note').trim()
  };
  // เก็บ remindSentFor เดิมไว้ (กันเมลซ้ำ) — รีเซ็ตถ้าวันสิ้นสุดเปลี่ยน
  const old = editingContractId ? contractsData.find(x=>String(x.spId)===String(editingContractId)) : null;
  obj.remindSentFor = (old && old.remindSentFor === obj.end) ? old.remindSentFor : '';
  obj.ackFor = document.getElementById('ct-acked')?.checked ? obj.end : '';   // รับทราบ = ผูกกับวันสิ้นสุดรอบนี้
  const value = JSON.stringify(obj);
  try {
    toast('กำลังบันทึก...','info');
    if (editingContractId) { await updateListItem(CONFIG.lists.contracts, editingContractId, { Title: obj.party||obj.name, Value: value }); }
    else { await createListItem(CONFIG.lists.contracts, { Title: obj.party||obj.name, Value: value }); }
    closeModal('contract-modal');
    await loadContracts(); renderContracts();
    toast('บันทึกสัญญาแล้ว','success');
  } catch(e) { toast('บันทึกไม่สำเร็จ: '+e.message,'error'); }
}
async function deleteContract() {
  if (!editingContractId) return;
  const c = contractsData.find(x=>String(x.spId)===String(editingContractId));
  if (!confirm('ลบสัญญา "'+(c?.party||c?.name||'')+'" ?')) return;
  try {
    await deleteListItem(CONFIG.lists.contracts, editingContractId);
    closeModal('contract-modal');
    await loadContracts(); renderContracts();
    toast('ลบสัญญาแล้ว','success');
  } catch(e) { toast('ลบไม่สำเร็จ: '+e.message,'error'); }
}

// ── นำเข้าจาก Excel (วาง TSV) ──
function _ctParseDate(s) {
  s = String(s || '').trim(); if (!s) return '';
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) { let y=+m[1]; if (y>2400) y-=543; return y + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[3]).padStart(2,'0'); }
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) { let d=String(m[1]).padStart(2,'0'), mo=String(m[2]).padStart(2,'0'), y=+m[3]; if (y<100) y+=2000; if (y>2400) y-=543; return y + '-' + mo + '-' + d; }
  return '';
}
function _ctParseNum(s) { return parseFloat(String(s||'').replace(/[^0-9.\-]/g,'')) || 0; }
function _parseContractPaste(text) {
  const rows = String(text||'').split(/\r?\n/).map(l => l.replace(/\s+$/,'')).filter(l => l.trim());
  const out = [];
  rows.forEach(line => {
    const cells = line.split('\t').map(c => c.trim());
    if (cells.length < 2) return;
    const c0 = (cells[0]||'').toLowerCase();
    // ข้ามหัวตาราง
    if (/เลขที่|inv|คู่สัญญา|ชื่อสัญญา/.test(cells[0]) && /คู่สัญญา|ผู้ขาย|ชื่อ/.test(cells[1]||'')) return;
    const o = {
      id: 'CT' + Date.now() + '_' + out.length,
      invNo: cells[0]||'', party: cells[1]||'', name: cells[2]||'', vendorTax: cells[3]||'',
      poRef: cells[4]||'', start: _ctParseDate(cells[5]), end: _ctParseDate(cells[6]),
      billing: cells[7]||'รายปี', value: _ctParseNum(cells[8]), coordinator: cells[9]||'',
      alertDays: cells[10] ? (parseInt(cells[10],10)||30) : 30, alertEmails: '', quoteId: '',
      manualDisbursed: 0, note: cells[11]||'', remindSentFor: ''
    };
    if (o.party || o.name) out.push(o);
  });
  return out;
}
let _ctImportRows = [];
function openContractImport() {
  _ctImportRows = [];
  const t = document.getElementById('ct-import-text'); if (t) t.value = '';
  document.getElementById('ct-import-preview').innerHTML = '';
  document.getElementById('ct-import-btn').disabled = true;
  openModal('contract-import-modal');
}
function previewContractImport() {
  _ctImportRows = _parseContractPaste(document.getElementById('ct-import-text')?.value || '');
  const el = document.getElementById('ct-import-preview');
  document.getElementById('ct-import-btn').disabled = !_ctImportRows.length;
  if (!_ctImportRows.length) { el.innerHTML = '<span style="color:var(--muted)">ยังไม่พบข้อมูลที่นำเข้าได้</span>'; return; }
  el.innerHTML = `<div style="color:var(--green);font-weight:600;margin-bottom:4px">พร้อมนำเข้า ${_ctImportRows.length} สัญญา — ตรวจตัวอย่าง 3 แถวแรก:</div>` +
    '<div style="max-height:150px;overflow:auto;border:1px solid var(--border);border-radius:6px"><table style="width:100%;font-size:11px"><thead><tr><th>คู่สัญญา</th><th>ชื่อสัญญา</th><th>เริ่ม</th><th>สิ้นสุด</th><th style="text-align:right">มูลค่า</th><th style="text-align:center">เตือน</th></tr></thead><tbody>' +
    _ctImportRows.slice(0,3).map(r=>`<tr><td>${escHtml(r.party)}</td><td>${escHtml(r.name)}</td><td>${r.start||'<span style="color:var(--red)">?</span>'}</td><td>${r.end||'<span style="color:var(--red)">?</span>'}</td><td style="text-align:right">${fmt(r.value)}</td><td style="text-align:center">${r.alertDays}ว.</td></tr>`).join('') +
    '</tbody></table></div>';
}
async function confirmContractImport() {
  if (!_ctImportRows.length) return;
  const btn = document.getElementById('ct-import-btn'); if (btn) btn.disabled = true;
  let ok = 0, fail = 0;
  toast('กำลังนำเข้า '+_ctImportRows.length+' สัญญา...','info');
  for (const o of _ctImportRows) {
    try { await createListItem(CONFIG.lists.contracts, { Title: o.party||o.name, Value: JSON.stringify(o) }); ok++; }
    catch(e) { fail++; console.warn('import contract fail', e.message); }
  }
  closeModal('contract-import-modal');
  await loadContracts(); renderContracts();
  toast('นำเข้าสำเร็จ '+ok+' สัญญา'+(fail?(' · ล้มเหลว '+fail):''), fail?'error':'success');
}

// ── แจ้งเตือนอัตโนมัติตอน sync — ส่งเมลครั้งเดียวต่อรอบสิ้นสุดสัญญา ──
async function checkContractsDue() {
  try {
    if (!contractsData.length) { try { await loadContracts(); } catch(e) { return; } }
    for (const c of contractsData) {
      const d = contractDaysRemaining(c);
      if (d === null) continue;
      const alert = +c.alertDays || 30;
      if (d > alert) continue;                       // ยังไม่ถึงช่วงเตือน
      if (contractAcked(c)) continue;                // รับทราบแล้ว → ไม่ส่ง
      if (c.remindSentFor === c.end) continue;       // ส่งไปแล้วสำหรับรอบนี้
      const emails = (c.alertEmails||'').split(/[,\n;]+/).map(s=>s.trim()).filter(s=>s.includes('@'));
      if (!emails.length) continue;
      const subject = `[แจ้งเตือนสัญญา] ${c.party||c.name} ${d<0?'หมดอายุแล้ว':'ใกล้หมดอายุ ('+d+' วัน)'}`;
      const body = `<div style="font-family:sans-serif;font-size:14px;color:#222">
        <p>เรียน ${escHtml(c.coordinator||'ผู้เกี่ยวข้อง')}</p>
        <p>สัญญาต่อไปนี้${d<0?('<b style="color:#c0392b">หมดอายุแล้ว '+Math.abs(d)+' วัน</b>'):('จะครบกำหนดในอีก <b>'+d+' วัน</b>')}</p>
        <table style="border-collapse:collapse;font-size:13px">
          <tr><td style="padding:2px 10px 2px 0;color:#666">คู่สัญญา/ผู้ขาย</td><td><b>${escHtml(c.party||'')}</b></td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666">ชื่อสัญญา</td><td>${escHtml(c.name||'')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666">เลขที่ INV</td><td>${escHtml(c.invNo||'-')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666">PO อ้างอิง</td><td>${escHtml(c.poRef||'-')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666">วันสิ้นสุดสัญญา</td><td><b>${c.end?fmtDate(c.end):'-'}</b></td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666">มูลค่าสัญญา</td><td>${fmt(+c.value||0)} บาท</td></tr>
        </table>
        <p style="color:#888;font-size:12px">— แจ้งเตือนอัตโนมัติจากระบบ SalePro</p></div>`;
      let sent = false;
      for (const to of emails) { try { await _sendMailGraph(to, subject, body); sent = true; } catch(e) { console.warn('contract mail fail', to, e.message); } }
      if (sent) {
        c.remindSentFor = c.end;
        try { await updateListItem(CONFIG.lists.contracts, c.spId, { Value: JSON.stringify(c) }); } catch(e) {}
      }
    }
  } catch(e) { console.warn('checkContractsDue:', e.message); }
}
