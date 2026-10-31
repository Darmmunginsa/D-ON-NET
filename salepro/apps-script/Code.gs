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

var SPREADSHEET_ID  = '1HkB3y5gXPp2cLn4YmDAddMGfnqQtPmJJDZ_RKLS84DU';   // Google Sheet (SalePro DB)
var UPLOAD_FOLDER_ID = '1Ra1XkkAbXpmo5uCbYOyxyvLSvjxaU1rw';            // โฟลเดอร์ไฟล์แนบใน Drive
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
  validateServiceFields(name,fields);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    fields = prepareContractNumberFields(name,fields||{},null);
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
// เขียนหลายแถวในครั้งเดียว (append ด้วย setValues ครั้งเดียว) — เร็วกว่าวน createRow มาก
function batchCreate(name, rows) {
  rows = rows || [];
  var out = [];
  if (!rows.length) return out;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sh = _sheet(name);
    var keySet = {};
    rows.forEach(function (f) { Object.keys(f || {}).forEach(function (k) { keySet[k] = 1; }); });
    var hdr = _ensureCols(sh, [ID_COL].concat(Object.keys(keySet)));
    var matrix = [];
    rows.forEach(function (f) {
      f = prepareContractNumberFields(name,f||{},null);
      var id = _uuid();
      matrix.push(hdr.map(function (h) {
        if (h === ID_COL) return id;
        var v = f[h];
        return (v === undefined || v === null) ? '' : String(v);
      }));
      var item = { id: id };
      Object.keys(f).forEach(function (k) { item[k] = f[k]; });
      out.push(item);
    });
    var start = sh.getLastRow() + 1;
    var rng = sh.getRange(start, 1, matrix.length, hdr.length);
    rng.setNumberFormat('@');                 // กันเลข 0 นำหน้าหาย
    rng.setValues(matrix);
    return out;
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
  validateServiceFields(name,fields);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    fields = fields || {};
    var hdr = _ensureCols(sh, Object.keys(fields));
    var rowIdx = _findRowIndex(sh, id);
    if (rowIdx < 0) throw new Error('ไม่พบรายการ id=' + id + ' ใน ' + name);
    if(name==='Contracts'){var oldRow=listRows(name).filter(function(r){return String(r.id)===String(id);})[0];fields=prepareContractNumberFields(name,fields,oldRow);}
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
  var recipients = String(req.to || '').split(/[;,\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!recipients.length || recipients.some(function (s) { return !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s); })) throw new Error('อีเมลผู้รับไม่ถูกต้อง');
  if (MailApp.getRemainingDailyQuota() < recipients.length) throw new Error('โควตาส่งอีเมลของ Apps Script ไม่เพียงพอ');
  var isHtml = /<[a-z][\s\S]*>/i.test(req.body || '');
  var opts = { name: req.fromName || 'SalePro' };        // ชื่อผู้ส่ง = ผู้ที่ล็อกอิน (ถ้าส่งมา)
  if (req.replyTo) opts.replyTo = req.replyTo;            // ตอบกลับไปหาผู้ที่ล็อกอินโดยตรง
  if (isHtml) opts.htmlBody = req.body;
  var atts = (req.attachments || []).filter(function (a) { return a && (a.base64 || a.contentBytes); });
  if (atts.length) {
    opts.attachments = atts.map(function (a) {
      var bytes = Utilities.base64Decode(a.base64 || a.contentBytes);
      return Utilities.newBlob(bytes, a.contentType || 'application/octet-stream', a.name || 'attachment');
    });
  }
  MailApp.sendEmail(recipients.join(','), req.subject || '', isHtml ? 'เปิดอีเมลในโปรแกรมที่รองรับ HTML เพื่ออ่านรายละเอียด' : (req.body || ''), opts);
  return { sent: true };
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
  if(req.privateFile!==true){try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}}
  return { fileUrl: file.getUrl(), id: file.getId() };
}

function handle(req) {
  var a = req.action;
  if(a==='serviceCapabilities')return {ok:true,serviceAutomationVersion:1,privateVisitUploads:true,contractNumbering:true};
  if(a==='ensureContractNumbers')return ensureContractNumbers();
  if (a === 'list')        return { ok: true, items: listRows(req.list) };
  if (a === 'multiList')   { var _o = {}; (req.lists || []).forEach(function (n) { _o[n] = listRows(n); }); return { ok: true, lists: _o }; }   // อ่านหลายแท็บในครั้งเดียว
  if (a === 'batchCreate') return { ok: true, items: batchCreate(req.list, req.rows || []) };                                                   // เขียนหลายแถวในครั้งเดียว
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
    if(req.action==='publicWarrantyLookup')return _json(lookupPublicWarranty(req));
    _authorizeGateway(req);
    return _json(handle(req));
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}
function doGet(e) {
  return _json({ ok: true, msg: 'SalePro API พร้อมใช้งาน' });
}

// Run this manually as admin@dongroups.com before deploying the new project.
// Creates schema/configuration only; never imports or deletes business records.
function checkNewEnvironment() {
  var email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (email !== 'admin@dongroups.com') throw new Error('กรุณาเปิดและรันด้วยบัญชี admin@dongroups.com ขณะนี้เป็น: ' + email);
  var database = SpreadsheetApp.openById(SPREADSHEET_ID);
  var folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  Logger.log('บัญชี: ' + email);
  Logger.log('ฐานข้อมูล: ' + database.getName());
  Logger.log('โฟลเดอร์: ' + folder.getName());
  Logger.log('โควตาผู้รับอีเมลที่เหลือ: ' + MailApp.getRemainingDailyQuota());
  return true;
}
function initializeNewDatabase() {
  checkNewEnvironment();
  var names = ['Catalog','Quotations','QuoteItems','Approvals','Payments','Settings','Procurement','Contracts','Customers','Company','FinanceTx','FinanceReq','FinanceCat'];
  var database = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Reject existing business rows before writing anything. Re-running is allowed only for setup metadata.
  names.forEach(function(name) {
    var sheet = database.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    if (name !== 'Settings') throw new Error('พบข้อมูลในแท็บ ' + name + ' หยุดเพื่อไม่แตะข้อมูลเดิม');
    var rows = listRows(name);
    if (rows.some(function(row) { return row.Title !== 'Role_admin@dongroups.com'; })) throw new Error('Settings มีข้อมูลอื่นอยู่แล้ว กรุณาตรวจสอบก่อน');
  });
  names.forEach(function(name) { _sheet(name); });
  var settings = listRows('Settings');
  if (!settings.some(function(row) { return row.Title === 'Role_admin@dongroups.com'; })) {
    createRow('Settings', {Title:'Role_admin@dongroups.com',Value:'admin'});
  }
  Logger.log('เตรียม 13 แท็บแล้ว ไม่มีการนำเข้าข้อมูลธุรกิจเดิม และตั้งสิทธิ์ Admin สำหรับบัญชีบริษัท');
}

// This secret belongs in Apps Script Project Settings → Script properties.
// The matching value belongs in the Cloudflare Worker secret GATEWAY_SECRET.
// It must NEVER be placed in frontend files or sent to a browser.
function _authorizeGateway(req) {
  var expected = PropertiesService.getScriptProperties().getProperty('GATEWAY_SECRET') || '';
  var received = String(req.gatewaySecret || '');
  if (expected.length < 32 || received.length !== expected.length) throw new Error('Unauthorized gateway');
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  if (mismatch) throw new Error('Unauthorized gateway');
  var allowed = (PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || 'admin@dongroups.com').split(',').map(function(email) { return email.trim().toLowerCase(); });
  var actor = req._actor || {};
  var email = String(actor.email || '').toLowerCase();
  if (!actor.sub || allowed.indexOf(email) < 0) throw new Error('Account not allowed');
  if (String(Session.getEffectiveUser().getEmail() || '').toLowerCase() !== 'admin@dongroups.com') throw new Error('Deploy must execute as admin@dongroups.com');
  req.email = email;
  req.replyTo = email;
  delete req.gatewaySecret;
}
