// ============================================================
// DATA LAYER — Google Apps Script (Sheets/Drive/Gmail)
// คงชื่อฟังก์ชันเดิม (getListItems/createListItem/updateListItem/deleteListItem/
// deleteWhere/apiPost/apiGet) เพื่อให้โค้ดหน้าเพจไม่ต้องแก้
// ============================================================

// ── Save overlay (กัน user กดซ้ำ/เปลี่ยนหน้าระหว่างบันทึก) ──
let _saveN = 0, _saveHadErr = false, _saveEndT = null, _saveHideT = null;
function _saveOverlayEl() {
  let o = document.getElementById('save-ov');
  if (!o) {
    o = document.createElement('div'); o.id = 'save-ov';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(10,16,28,.45)';
    o.innerHTML = '<div style="background:var(--card,#161f30);border:1px solid var(--border,#26324a);border-radius:14px;padding:20px 26px;min-width:250px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,.45)">'
      + '<div id="save-ov-msg" style="color:var(--text,#e7ecf5);font-size:14px;font-weight:600;margin-bottom:12px">กำลังบันทึก…</div>'
      + '<div style="height:7px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden"><div id="save-ov-bar" style="height:100%;width:40%;border-radius:4px;background:var(--accent2,#6aa6e0)"></div></div>'
      + '<div id="save-ov-hint" style="color:var(--muted,#9aa6ba);font-size:11px;margin-top:10px">กรุณารอสักครู่ — อย่าปิดหรือเปลี่ยนหน้า</div></div>';
    document.body.appendChild(o);
    if (!document.getElementById('save-ov-style')) { const st = document.createElement('style'); st.id = 'save-ov-style'; st.textContent = '@keyframes saveslide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}'; document.head.appendChild(st); }
  }
  return o;
}
function _showSaving() {
  clearTimeout(_saveHideT); clearTimeout(_saveEndT);
  const o = _saveOverlayEl();
  const bar = document.getElementById('save-ov-bar'), msg = document.getElementById('save-ov-msg'), hint = document.getElementById('save-ov-hint');
  if (bar) { bar.style.animation = 'saveslide 0.9s ease-in-out infinite'; bar.style.width = '40%'; bar.style.background = 'var(--accent2,#6aa6e0)'; }
  if (msg) { msg.textContent = 'กำลังบันทึก…'; msg.style.color = 'var(--text,#e7ecf5)'; }
  if (hint) hint.style.display = 'block';
  o.style.display = 'flex';
}
function _finishSaving(ok) {
  const o = document.getElementById('save-ov'); if (!o) return;
  const bar = document.getElementById('save-ov-bar'), msg = document.getElementById('save-ov-msg'), hint = document.getElementById('save-ov-hint');
  if (bar) { bar.style.animation = 'none'; bar.style.width = '100%'; bar.style.background = ok ? 'var(--green,#34d399)' : 'var(--red,#f87171)'; }
  if (msg) { msg.textContent = ok ? 'บันทึกสำเร็จ ✓' : 'บันทึกไม่สำเร็จ ✕ — ลองใหม่'; msg.style.color = ok ? 'var(--green,#34d399)' : 'var(--red,#f87171)'; }
  if (hint) hint.style.display = 'none';
  _saveHideT = setTimeout(() => { o.style.display = 'none'; }, ok ? 650 : 1800);
}
function _saveStart() { _saveN++; _showSaving(); }
function _saveEnd(ok) {
  _saveN = Math.max(0, _saveN - 1);
  if (!ok) _saveHadErr = true;
  clearTimeout(_saveEndT);
  _saveEndT = setTimeout(() => { if (_saveN === 0) { _finishSaving(!_saveHadErr); _saveHadErr = false; } }, 130);
}

// เรียก Apps Script web app — ใช้ content-type text/plain เพื่อเลี่ยง CORS preflight
// มี auto-retry กัน CORS/redirect ของ Apps Script หลุดเป็นครั้งคราว
function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
// wrapper: โชว์ progress overlay เฉพาะ action ที่ "เขียนข้อมูล" (ไม่ใช่ list)
var _quietWrite = false;   // true = บันทึกเงียบ (ไม่โชว์ save bar) — ใช้กับ auto-save ตอนพิมพ์/เลือก
async function _call(payload) {
  const write = payload && payload.action && payload.action !== 'list' && payload.action !== 'multiList' && !_quietWrite;
  if (!write) return _callRaw(payload);
  _saveStart(); let ok = false;
  try { const d = await _callRaw(payload); ok = true; return d; }
  finally { _saveEnd(ok); }
}
async function _callRaw(payload) { return GatewayClient.call(CONFIG.appsScriptUrl,payload); }

// แปลงชนิดข้อมูลตัวเลข/บูลีน ให้เก็บใน Sheet เป็นค่าที่ถูกต้อง
// หมายเหตุ: ห้ามใส่ฟิลด์ที่เป็น "id อ้างอิง" (เช่น QuoteID) เพราะ Google version ใช้ UUID
// ถ้าแปลงเป็นตัวเลข Number(uuid)=NaN → เก็บเป็น 0 → ความสัมพันธ์ขาด
const _NUMERIC_FIELDS = new Set([
  'SubTotal','DiscountPct','TotalAmount','PaidAmount','DealClosedValue',
  'Quantity','UnitPrice','LineTotal','SortOrder','AmountPaid','Price'
]);
const _BOOLEAN_FIELDS = new Set(['DealClosed','CancelNotified','IsActive']);
function _coerceFields(fields) {
  const out = {};
  for (const k in fields) {
    let v = fields[k];
    if (v === undefined) continue;
    if (_NUMERIC_FIELDS.has(k)) {
      if (v === '' || v === null) continue;
      const n = Number(v); out[k] = isNaN(n) ? 0 : n;
    } else if (_BOOLEAN_FIELDS.has(k)) {
      out[k] = (v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes');
    } else { out[k] = v; }
  }
  return out;
}

// ── CRUD (list = ชื่อแท็บจาก CONFIG.lists) ──
async function getListItems(list) {
  const d = await _call({ action: 'list', list });
  return d.items || [];
}
// อ่านหลายแท็บในครั้งเดียว → { listName: items[] }  (ลด round-trip ตอน sync)
// ถ้า Apps Script ยังไม่รองรับ (ยังไม่ redeploy) → fallback โหลดทีละตัว
async function getListItemsMulti(lists) {
  try { const d = await _call({ action: 'multiList', lists }); if (d && d.lists) return d.lists; }
  catch (e) { console.warn('multiList ไม่รองรับ → fallback:', e.message); }
  const out = {};
  for (const l of lists) { out[l] = await getListItems(l).catch(() => []); }
  return out;
}
async function createListItem(list, fields) {
  const d = await _call({ action: 'create', list, fields: _coerceFields(fields) });
  return d.item || { id: d.id, ...fields };
}
// เขียนหลายแถวในครั้งเดียว (เร็วกว่าวน createListItem มาก) — คืน array ของ item ที่สร้าง
// ถ้า Apps Script ยังไม่รองรับ (ยังไม่ redeploy) → fallback วนสร้างทีละแถว
async function createListItemsBulk(list, rowsArray) {
  if (!rowsArray || !rowsArray.length) return [];
  const rows = rowsArray.map(f => _coerceFields(f));
  try { const d = await _call({ action: 'batchCreate', list, rows }); if (d && d.items) return d.items; }
  catch (e) { console.warn('batchCreate ไม่รองรับ → fallback:', e.message); }
  const out = [];
  for (const r of rowsArray) { out.push(await createListItem(list, r)); }
  return out;
}
async function updateListItem(list, itemId, fields) {
  return _call({ action: 'update', list, id: itemId, fields: _coerceFields(fields) });
}
async function deleteListItem(list, itemId) {
  return _call({ action: 'delete', list, id: itemId });
}
async function deleteWhere(list, field, value) {
  const d = await _call({ action: 'deleteWhere', list, field, value });
  return { deleted: d.deleted || 0 };
}

// ── Email / Upload ──
// สร้าง MIME (RFC822) แล้ว base64url สำหรับ Gmail API
function _mimeB64(str){ return btoa(unescape(encodeURIComponent(str))); }
function _mimeWrap(b64){ return b64.replace(/(.{76})/g, '$1\r\n'); }
function _encHeader(s){ return '=?UTF-8?B?' + _mimeB64(String(s||'')) + '?='; }
function _buildRawEmail(from, fromName, to, subject, body, attachments){
  const isHtml = /<[a-z][\s\S]*>/i.test(body||'');
  const nl='\r\n';
  const atts=(attachments||[]).filter(a=>a&&(a.contentBytes||a.base64));
  const fromHdr = fromName ? (_encHeader(fromName)+' <'+from+'>') : from;
  let h='From: '+fromHdr+nl+'To: '+to+nl+'Subject: '+_encHeader(subject)+nl+'MIME-Version: 1.0'+nl;
  const bodyB64=_mimeWrap(_mimeB64(body||''));
  const bodyPart='Content-Type: text/'+(isHtml?'html':'plain')+'; charset="UTF-8"'+nl+'Content-Transfer-Encoding: base64'+nl+nl+bodyB64;
  let mime;
  if(!atts.length){ mime=h+bodyPart; }
  else {
    const bd='b_'+Math.random().toString(36).slice(2);
    mime=h+'Content-Type: multipart/mixed; boundary="'+bd+'"'+nl+nl+'--'+bd+nl+bodyPart+nl;
    atts.forEach(a=>{ const data=_mimeWrap(a.contentBytes||a.base64);
      mime+='--'+bd+nl
        +'Content-Type: '+(a.contentType||'application/octet-stream')+'; name="'+(a.name||'file')+'"'+nl
        +'Content-Transfer-Encoding: base64'+nl
        +'Content-Disposition: attachment; filename="'+(a.name||'file')+'"'+nl+nl+data+nl;
    });
    mime+='--'+bd+'--';
  }
  return _mimeB64(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
// Workflow mail uses the existing Apps Script sender; reply goes to the operator.
async function _sendMail(to, subject, body, attachments) {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  try {
    if (!user || !user.email) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    const recipients = String(to || '').split(/[;,\n]+/).map(s => s.trim()).filter(Boolean);
    if (!recipients.length || recipients.some(email => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new Error('กรุณาตรวจสอบอีเมลผู้รับ');
    const files = (attachments || []).filter(a => a && (a.base64 || a.contentBytes)).map(a => ({name:a.name || 'attachment',contentType:a.contentType || 'application/octet-stream',base64:a.base64 || a.contentBytes}));
    const response = await _call({action:'sendEmail',to:recipients.join(','),subject:subject || '',body:body || '',attachments:files,fromName:user.displayName || 'D On Net',replyTo:user.email});
    if (!response || response.ok !== true) throw new Error('เซิร์ฟเวอร์ยังไม่ยืนยันการส่งอีเมล');
    return response.result || {};
  } catch (error) {
    if (typeof toast === 'function') toast('อีเมลยังไม่สำเร็จ: ' + error.message + ' — ตรวจสอบสถานะก่อนส่งซ้ำ', 'error');
    throw error;
  }
}
async function _uploadFile(folder, fileName, mimeType, base64Data) {
  const d = await _call({ action: 'uploadFile', folder, fileName, mimeType, base64: base64Data });
  return { fileUrl: d.fileUrl || '' };
}
// aliases — ให้โค้ดหน้าเพจเดิมที่เรียก *Graph ทำงานต่อได้
async function _sendMailGraph(to, subject, body, attachments) { return _sendMail(to, subject, body, attachments); }
async function _uploadFileGraph(folder, fileName, mimeType, base64Data) { return _uploadFile(folder, fileName, mimeType, base64Data); }

// ── apiPost shim — คงรูปแบบเดิม ──
async function apiPost(action, sheetName, id, data) {
  if (action === 'sendEmail')  return _sendMail(data.to, data.subject, data.body, data.attachments);
  if (action === 'uploadFile') return _uploadFile(data.folder || 'Slips', data.fileName, data.mimeType, data.base64Data);
  if (action === 'add')        return createListItem(sheetName, data);
  if (action === 'update')     return updateListItem(sheetName, id, data);
  if (action === 'delete')     return deleteListItem(sheetName, id);
  if (action === 'deleteWhere')return deleteWhere(sheetName, data.field, data.value);
  throw new Error('Unknown action: ' + action);
}
async function apiGet(list) { return getListItems(list); }
