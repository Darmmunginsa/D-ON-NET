// ============================================================
// DATA LAYER — Google Apps Script (Sheets/Drive/Gmail)
// คงชื่อฟังก์ชันเดิม (getListItems/createListItem/updateListItem/deleteListItem/
// deleteWhere/apiPost/apiGet) เพื่อให้โค้ดหน้าเพจไม่ต้องแก้
// ============================================================

// เรียก Apps Script web app — ใช้ content-type text/plain เพื่อเลี่ยง CORS preflight
// มี auto-retry กัน CORS/redirect ของ Apps Script หลุดเป็นครั้งคราว
function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function _call(payload, _attempt) {
  if (!CONFIG.appsScriptUrl || CONFIG.appsScriptUrl.indexOf('PASTE') === 0) {
    throw new Error('ยังไม่ได้ตั้งค่า appsScriptUrl ใน js/config.js');
  }
  _attempt = _attempt || 1;
  const MAX = 4;
  const body = JSON.stringify(Object.assign({ email: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : '' }, payload));
  try {
    const r = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow'
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error('ตอบกลับไม่ใช่ JSON'); }
    if (data.ok === false) throw new Error(data.error || 'API error');
    return data;
  } catch (e) {
    // retry เฉพาะข้อผิดพลาดเครือข่าย/CORS/redirect (TypeError: Failed to fetch) หรือ HTTP ชั่วคราว
    const retriable = (e instanceof TypeError) || /Failed to fetch|HTTP 5|HTTP 429|NetworkError|Load failed/i.test(e.message || '');
    if (retriable && _attempt < MAX) {
      await _sleep(300 * _attempt);           // backoff: 300, 600, 900ms
      return _call(payload, _attempt + 1);
    }
    throw e;
  }
}

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
// ส่งอีเมล "ในนามผู้ที่ล็อกอินจริง ๆ" ผ่าน Gmail API (ไม่ผ่าน Apps Script)
async function _sendMail(to, subject, body, attachments) {
  const _u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  if (!_u || !_u.email) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const token = await getGmailToken();   // ขอสิทธิ์ gmail.send (consent ครั้งแรก)
  const raw = _buildRawEmail(_u.email, _u.displayName || _u.email, to, subject, body, attachments);
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: raw })
  });
  if (!r.ok) throw new Error('ส่งอีเมลไม่สำเร็จ (Gmail ' + r.status + '): ' + await r.text());
  return r.json();
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
