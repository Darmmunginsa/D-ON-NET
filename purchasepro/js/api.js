// ============================================================
// DATA LAYER — Google Apps Script (Sheets/Drive/Gmail)
// คงชื่อฟังก์ชันเดิม (getListItems/createListItem/updateListItem/deleteListItem/
// deleteWhere/apiPost/apiGet) เพื่อให้โค้ดหน้าเพจไม่ต้องแก้
// ============================================================

// เรียก Apps Script web app — ใช้ content-type text/plain เพื่อเลี่ยง CORS preflight
// มี auto-retry กัน CORS/redirect ของ Apps Script หลุดเป็นครั้งคราว
function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function _call(payload) { return GatewayClient.call(CONFIG.appsScriptUrl,payload); }

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
async function createListItem(list, fields) {
  const d = await _call({ action: 'create', list, fields: _coerceFields(fields) });
  return d.item || { id: d.id, ...fields };
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
