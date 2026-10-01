/************************************************************
 * SalePro — Google Apps Script backend (Sheets + Drive + Gmail)
 * แทนที่ SharePoint/Graph เดิม โดยคง "ชั้นข้อมูล" ให้ front-end เรียกเหมือนเดิม
 *
 * วิธีติดตั้ง:
 *  1) สร้าง Google Sheet เปล่า 1 ไฟล์ → คัดลอก Spreadsheet ID มาวางด้านล่าง
 *  2) สร้างโฟลเดอร์ใน Google Drive สำหรับไฟล์แนบ → คัดลอก Folder ID มาวาง
 *  3) Deploy → New deployment → Web app
 *       - Execute as: Me
 *       - Who has access: Anyone  (หรือ Anyone with Google account)
 *     คัดลอก URL (.../exec) ไปใส่ใน js/config.js (appsScriptUrl)
 *  แต่ละ "List" = แท็บ (sheet) ที่ชื่อเดียวกับ CONFIG.lists ใน front-end
 ************************************************************/

var SPREADSHEET_ID  = '1rQAVGAIuTGussD1GaOs7M6LCMu2x5FPXxpM_IdJgQLw';   // Google Sheet (SalePro DB)
var UPLOAD_FOLDER_ID = '1AtzqOI4S4PBWmLyBFo3KxJ3sUd9E3Cr0';            // โฟลเดอร์ไฟล์แนบใน Drive
var ID_COL = '_id';

function _ss() {
  return (SPREADSHEET_ID && SPREADSHEET_ID.indexOf('PASTE') !== 0)
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}
function _sheet(name) {
  var ss = _ss();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1).setValue(ID_COL); }
  if (sh.getLastColumn() === 0) sh.getRange(1, 1).setValue(ID_COL);
  return sh;
}
function _headers(sh) {
  var lc = sh.getLastColumn();
  if (lc === 0) return [ID_COL];
  return sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h); });
}
function _ensureCols(sh, keys) {
  var hdr = _headers(sh);
  var add = [];
  keys.forEach(function (k) { if (hdr.indexOf(k) === -1 && add.indexOf(k) === -1) add.push(k); });
  if (add.length) {
    sh.getRange(1, hdr.length + 1, 1, add.length).setValues([add]);
    hdr = hdr.concat(add);
  }
  return hdr;
}
function _uuid() { return Utilities.getUuid(); }

function listRows(name) {
  var sh = _sheet(name);
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc === 0) return [];
  var hdr = _headers(sh);
  var idIdx = hdr.indexOf(ID_COL);
  var data = sh.getRange(2, 1, lr - 1, lc).getValues();
  var out = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var id = idIdx >= 0 ? row[idIdx] : '';
    if (!id && row.join('') === '') continue;   // ข้ามแถวว่าง
    var obj = { id: String(id) };
    for (var c = 0; c < hdr.length; c++) {
      var key = hdr[c]; if (!key || key === ID_COL) continue;
      var v = row[c];
      obj[key] = (v === null || v === undefined) ? '' : v;
    }
    if (!id) continue;
    out.push(obj);
  }
  return out;
}
function createRow(name, fields) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    fields = fields || {};
    var keys = Object.keys(fields);
    var hdr = _ensureCols(sh, [ID_COL].concat(keys));
    var id = _uuid();
    var rowVals = hdr.map(function (h) {
      if (h === ID_COL) return id;
      var v = fields[h];
      return (v === undefined || v === null) ? '' : String(v);
    });
    var rowIdx = sh.getLastRow() + 1;
    var rng = sh.getRange(rowIdx, 1, 1, hdr.length);
    rng.setNumberFormat('@');                 // บังคับเป็นข้อความ กันเลข 0 นำหน้าหาย
    rng.setValues([rowVals]);
    var item = { id: id };
    keys.forEach(function (k) { item[k] = fields[k]; });
    return item;
  } finally { lock.releaseLock(); }
}
function _findRowIndex(sh, id) {
  var hdr = _headers(sh); var idIdx = hdr.indexOf(ID_COL);
  if (idIdx < 0) return -1;
  var lr = sh.getLastRow(); if (lr < 2) return -1;
  var ids = sh.getRange(2, idIdx + 1, lr - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}
function updateRow(name, id, fields) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    fields = fields || {};
    var hdr = _ensureCols(sh, Object.keys(fields));
    var rowIdx = _findRowIndex(sh, id);
    if (rowIdx < 0) throw new Error('ไม่พบรายการ id=' + id + ' ใน ' + name);
    var rng = sh.getRange(rowIdx, 1, 1, hdr.length);
    var cur = rng.getValues()[0].map(function (v) { return (v === null || v === undefined) ? '' : String(v); });
    for (var k in fields) {
      var c = hdr.indexOf(k);
      if (c >= 0) cur[c] = (fields[k] === undefined || fields[k] === null) ? '' : String(fields[k]);
    }
    rng.setNumberFormat('@');                  // เก็บเป็นข้อความ กันเลข 0 นำหน้าหาย
    rng.setValues([cur]);
    return { id: String(id) };
  } finally { lock.releaseLock(); }
}
function deleteRow(name, id) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    var rowIdx = _findRowIndex(sh, id);
    if (rowIdx > 0) sh.deleteRow(rowIdx);
    return { deleted: rowIdx > 0 ? 1 : 0 };
  } finally { lock.releaseLock(); }
}
function deleteWhere(name, field, value) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    var hdr = _headers(sh); var c = hdr.indexOf(field);
    if (c < 0) return { deleted: 0 };
    var lr = sh.getLastRow(); if (lr < 2) return { deleted: 0 };
    var vals = sh.getRange(2, c + 1, lr - 1, 1).getValues();
    var rowsToDel = [];
    for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) rowsToDel.push(i + 2);
    rowsToDel.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    return { deleted: rowsToDel.length };
  } finally { lock.releaseLock(); }
}

function sendEmail(req) {
  var isHtml = /<[a-z][\s\S]*>/i.test(req.body || '');
  var opts = { name: 'SalePro' };
  if (isHtml) opts.htmlBody = req.body;
  var atts = (req.attachments || []).filter(function (a) { return a && a.base64; });
  if (atts.length) {
    opts.attachments = atts.map(function (a) {
      var bytes = Utilities.base64Decode(a.base64);
      return Utilities.newBlob(bytes, a.contentType || 'application/octet-stream', a.name || 'attachment');
    });
  }
  MailApp.sendEmail(req.to, req.subject || '', isHtml ? '' : (req.body || ''), opts);
  return {};
}
function uploadFile(req) {
  if (!UPLOAD_FOLDER_ID || UPLOAD_FOLDER_ID.indexOf('PASTE') === 0) throw new Error('ยังไม่ได้ตั้งค่า UPLOAD_FOLDER_ID');
  var folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  var sub = req.folder || '';
  if (sub) {
    var it = folder.getFoldersByName(sub);
    folder = it.hasNext() ? it.next() : folder.createFolder(sub);
  }
  var bytes = Utilities.base64Decode(req.base64 || req.base64Data || '');
  var blob = Utilities.newBlob(bytes, req.mimeType || 'application/octet-stream', req.fileName || ('file_' + Date.now()));
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { fileUrl: file.getUrl(), id: file.getId() };
}

function handle(req) {
  var a = req.action;
  if (a === 'list')        return { ok: true, items: listRows(req.list) };
  if (a === 'create' || a === 'add') return { ok: true, item: createRow(req.list, req.fields || req.data) };
  if (a === 'update')      return { ok: true, item: updateRow(req.list, req.id, req.fields || req.data) };
  if (a === 'delete')      return { ok: true, deleted: deleteRow(req.list, req.id).deleted };
  if (a === 'deleteWhere') return { ok: true, deleted: deleteWhere(req.list, req.field, req.value).deleted };
  if (a === 'sendEmail')   return { ok: true, result: sendEmail(req) };
  if (a === 'uploadFile')  return { ok: true, fileUrl: uploadFile(req).fileUrl };
  return { ok: false, error: 'unknown action: ' + a };
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    return _json(handle(req));
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}
function doGet(e) {
  return _json({ ok: true, msg: 'SalePro API พร้อมใช้งาน' });
}
