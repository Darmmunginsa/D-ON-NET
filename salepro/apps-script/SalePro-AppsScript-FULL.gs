/************************************************************
 * SalePro — Apps Script ฉบับเต็ม (รวมทุกไฟล์ในไฟล์เดียว)
 * ประกอบจาก: Code.gs + ServicePlan.gs + ServiceAutomation.gs + ContractNumbering.gs
 * มีระบบออกเลขใบเสนอราคาแบบ 'รอ Approve' (Draft ยังไม่ออกเลข) + CC อีเมลกลาง
 * วิธีใช้: วางทับไฟล์เดียวใน Apps Script (ลบไฟล์ .gs อื่นทิ้งให้เหลือไฟล์นี้ไฟล์เดียว)
 *          แล้ว Deploy > Manage deployments > Edit > New version
 ************************************************************/

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
    if(name==='Quotations'&&fields&&fields.LocalDraftId){var priorDraft=listRows(name).filter(function(q){return q.LocalDraftId===fields.LocalDraftId;})[0];if(priorDraft){priorDraft._localDraftReused=true;return priorDraft;}}
    fields = prepareQuotationNumberFields(name,prepareContractNumberFields(name,fields||{},null),null);
    validatePurchaseDecision(name,fields,null,null);
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
      validatePurchaseDecision(name,f,null,null);
      f = prepareQuotationNumberFields(name,prepareContractNumberFields(name,f||{},null),null);
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
function updateRow(name, id, fields, actor) {
  validateServiceFields(name,fields);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _sheet(name);
    fields = fields || {};
    var rowIdx = _findRowIndex(sh, id);
    if (rowIdx < 0) throw new Error('ไม่พบรายการ id=' + id + ' ใน ' + name);
    if(name==='Quotations'){var previousQuote=listRows(name).filter(function(r){return String(r.id)===String(id);})[0];fields=prepareQuotationNumberFields(name,fields,previousQuote);}
    if(name==='Procurement'||name==='Settings'){var oldPurchase=listRows(name).filter(function(r){return String(r.id)===String(id);})[0];validatePurchaseDecision(name,fields,oldPurchase,actor);}
    var hdr = _ensureCols(sh, Object.keys(fields));
    if(name==='Contracts'){var oldRow=listRows(name).filter(function(r){return String(r.id)===String(id);})[0];fields=prepareContractNumberFields(name,fields,oldRow);}
    var rng = sh.getRange(rowIdx, 1, 1, hdr.length);
    var cur = rng.getValues()[0].map(function (v) { return (v === null || v === undefined) ? '' : String(v); });
    for (var k in fields) {
      var c = hdr.indexOf(k);
      if (c >= 0) cur[c] = (fields[k] === undefined || fields[k] === null) ? '' : String(fields[k]);
    }
    rng.setNumberFormat('@');                  // เก็บเป็นข้อความ กันเลข 0 นำหน้าหาย
    rng.setValues([cur]);
    var result={id:String(id)};hdr.forEach(function(h,i){if(h!==ID_COL)result[h]=cur[i];});return result;
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
  // CC แจ้งเตือนกลาง (กรองเฉพาะอีเมลถูกต้อง)
  var ccList = String(req.cc || '').split(/[;,\n]+/).map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s); });
  if (ccList.length) opts.cc = ccList.join(',');
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
  if(a==='localDraftSync')return localDraftSync(req);
  if(a==='localDraftAppend')return localDraftAppend(req);
  if(a==='serviceCapabilities')return {ok:true,serviceAutomationVersion:1,privateVisitUploads:true,contractNumbering:true,quotationNumbering:true,revisionNumbering:true,localFirstDrafts:true};
  if(a==='ensureContractNumbers')return ensureContractNumbers();
  if (a === 'list')        return { ok: true, items: listRows(req.list) };
  if (a === 'multiList')   { var _o = {}; (req.lists || []).forEach(function (n) { _o[n] = listRows(n); }); return { ok: true, lists: _o }; }   // อ่านหลายแท็บในครั้งเดียว
  if (a === 'batchCreate') return { ok: true, items: batchCreate(req.list, req.rows || []) };                                                   // เขียนหลายแถวในครั้งเดียว
  if (a === 'create' || a === 'add') return { ok: true, item: createRow(req.list, req.fields || req.data) };
  if (a === 'update')      return { ok: true, item: updateRow(req.list, req.id, req.fields || req.data, req._actor) };
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

// createRow/updateRow/batchCreate already hold the script lock.
function prepareQuotationNumberFields(name,fields,existing){
  if(name!=='Quotations')return fields;
  fields=fields||{};existing=existing||{};
  var title=String(existing.Title||'').trim(),status=fields.Status||existing.Status;
  // Issued and legacy numbers remain stable, including a retry after a lost response.
  if(title){fields.Title=title;return fields;}
  // Allocate revision suffixes under the same server write lock as new numbers.
  var sourceId=String(fields.RevisionSourceId||existing.RevisionSourceId||'').trim();
  if(sourceId){
    var rows=listRows('Quotations'),source=rows.filter(function(q){return String(q.id)===sourceId;})[0];
    if(!source||!String(source.Title||'').trim())throw Error('Revision source must have an issued quotation number');
    var base=String(source.Title).trim().replace(/-RV\d+$/,''),lastRevision=0;
    rows.forEach(function(q){var t=String(q.Title||'');if(t.indexOf(base+'-RV')===0){var suffix=t.slice((base+'-RV').length);if(/^\d+$/.test(suffix))lastRevision=Math.max(lastRevision,Number(suffix));}});
    fields.Title=base+'-RV'+(lastRevision+1);fields.NumberingMode='Revision';fields.RevisionSourceId=sourceId;return fields;
  }
  fields.Title='';fields.NumberingMode='OnApproval';
  if(status!=='Approved')return fields;
  var issuedAt=new Date();
  var month=Utilities.formatDate(issuedAt,'Asia/Bangkok','MM'),year=Utilities.formatDate(issuedAt,'Asia/Bangkok','yyyy');
  var props=PropertiesService.getScriptProperties(),key='QUOTATION_SEQUENCE_'+year+'_'+month,last=Number(props.getProperty(key)||0);
  listRows('Quotations').forEach(function(q){var m=String(q.Title||'').match(/(\d+)-(\d{2})-(\d{4})(?:-RV\d+)?$/);if(m&&m[2]===month&&m[3]===year)last=Math.max(last,Number(m[1]));});
  if(!Number.isSafeInteger(last)||last<0)throw Error('Invalid quotation sequence');
  var parts=String(fields.SaleName||existing.SaleName||'').trim().split(/\s+/).filter(Boolean),prefix=parts.length>1?parts[0][0]+parts[1][0]:parts.length?parts[0].slice(0,2):'QT';
  var next=last+1;props.setProperty(key,String(next));
  fields.Title=prefix.toUpperCase()+String(next).padStart(2,'0')+'-'+month+'-'+year;
  fields.QuoteDate=Utilities.formatDate(issuedAt,'Asia/Bangkok','yyyy-MM-dd');
  fields.QuotationIssuedAt=issuedAt.toISOString();return fields;
}

var ServicePlan=(function(){
  'use strict';
  var team=['admin@dongroups.com','darm.m@dongroups.com','jongrak.k@dongroups.com'];
  function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('วันที่ไม่ถูกต้อง');var d=new Date(s+'T00:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==s)throw Error('วันที่ไม่ถูกต้อง');return d;}
  function iso(d){return d.toISOString().slice(0,10);}
  function normalizeSerial(s){return String(s||'').trim().toUpperCase().replace(/\s+/g,'');}
  function validSerial(s){return /^[A-Z0-9][A-Z0-9._\/-]{2,79}$/.test(normalizeSerial(s));}
  function teamEmails(emails,allowed){var list=Array.isArray(emails)?emails:String(emails||'').split(/[,;\s]+/);return list.map(function(e){return String(e).trim().toLowerCase();}).filter(function(e,i,a){return (allowed||team).indexOf(e)>=0&&a.indexOf(e)===i;});}
  function months(start,end){date(start);date(end);if(end<start)throw Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');var cur=start.slice(0,7),last=end.slice(0,7),out=[];while(cur<=last){if(out.length>=120)throw Error('รองรับช่วงสัญญาไม่เกิน 120 เดือน');out.push(cur);var d=date(cur+'-01');d.setUTCMonth(d.getUTCMonth()+1);cur=iso(d).slice(0,7);}return out;}
  function generate(start,end,frequency,firstMonth,previous){var all=months(start,end);if([2,4].indexOf(Number(frequency))<0)throw Error('เลือก 2 หรือ 4 ครั้งต่อปี หรือเพิ่มรอบเอง');if(all.indexOf(firstMonth)<0)throw Error('เดือนรอบแรกต้องอยู่ในสัญญา');var step=12/Number(frequency),index=all.indexOf(firstMonth),out=[];for(var i=index;i<all.length;i+=step){var month=all[i],old=(previous||[]).filter(function(v){return v.month===month;})[0];out.push(old||{id:'visit-'+month,month:month,plannedDate:'',status:'planned',completedDate:'',note:''});}return out;}
  function dueDate(visit,end){if(visit.plannedDate)return visit.plannedDate;var d=date(visit.month+'-01');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);var last=iso(d);return end&&end<last?end:last;}
  function validate(plan,start,end){if(!plan||!plan.type)return plan;var allowedMonths=months(start,end),seen={};if(['MA','PM'].indexOf(plan.type)<0)throw Error('เลือก MA หรือ PM');var recipients=teamEmails(plan.teamEmails);if(!recipients.length)throw Error('เลือกอีเมลทีมงานอย่างน้อยหนึ่งคน');if(recipients.length!==(plan.teamEmails||[]).filter(Boolean).length)throw Error('แจ้งเตือนได้เฉพาะทีมงานที่อนุญาต');if(!Array.isArray(plan.visits)||!plan.visits.length)throw Error('เพิ่มรอบเข้าบริการอย่างน้อยหนึ่งรอบ');plan.visits.forEach(function(v){if(allowedMonths.indexOf(v.month)<0||seen[v.month])throw Error('เดือนเข้าบริการต้องไม่ซ้ำและอยู่ในสัญญา');seen[v.month]=true;if(['planned','scheduled','completed','cancelled'].indexOf(v.status)<0)throw Error('สถานะรอบบริการไม่ถูกต้อง');if(v.plannedDate){date(v.plannedDate);if(v.plannedDate.slice(0,7)!==v.month||v.plannedDate<start||v.plannedDate>end)throw Error('วันนัดต้องอยู่ในเดือนรอบและช่วงสัญญา');}if(v.status==='scheduled'&&!v.plannedDate)throw Error('กรอกวันนัดเมื่อเลือกสถานะนัดแล้ว');if(v.completedDate){date(v.completedDate);if(v.completedDate<start)throw Error('วันเข้าบริการจริงต้องไม่ก่อนเริ่มสัญญา');}if(v.status==='completed'&&!v.completedDate)throw Error('กรอกวันเข้าบริการจริงก่อนปิดรอบ');});if(plan.documentDraft===false&&(!(plan.assets||[]).length||!String(plan.terms||'').trim()||!String(plan.customerAddress||'').trim()))throw Error('เอกสารฉบับจริงต้องระบุเครื่อง ที่อยู่ลูกค้า และเงื่อนไขสัญญา');var serials={};(plan.assets||[]).forEach(function(a){if(!a.model||!validSerial(a.serial))throw Error('กรอกรุ่นและ Serial แยกหนึ่งเครื่องต่อบรรทัด');var sn=normalizeSerial(a.serial);if(serials[sn])throw Error('Serial ซ้ำในสัญญา');serials[sn]=true;});if(!Number.isInteger(Number(plan.remindDays))||plan.remindDays<0||plan.remindDays>365)throw Error('ระยะเตือนต้องอยู่ระหว่าง 0–365 วัน');return plan;}
  function publicRecord(e){if(!e||e.publicLookup!==true||['Warranty','อุปกรณ์'].indexOf(e.type)<0||!validSerial(e.serial)||Number(e.qty==null||e.qty===''?1:e.qty)!==1)return null;try{date(e.startDate);date(e.expiryDate);}catch(_){return null;}if(e.expiryDate<e.startDate)return null;return {serial:normalizeSerial(e.serial),model:String(e.name||'').slice(0,160),startDate:e.startDate,expiryDate:e.expiryDate};}
  return {team:team,date:date,iso:iso,months:months,generate:generate,dueDate:dueDate,validate:validate,teamEmails:teamEmails,normalizeSerial:normalizeSerial,validSerial:validSerial,publicRecord:publicRecord};
})();

// Requires ServicePlan.gs, copied from shared/service-plan.js in the release bundle.
function validateServiceFields(name,fields){if(name!=='Contracts'||!fields||typeof fields.Value!=='string')return;var c=JSON.parse(fields.Value);if(c.serviceAgreement&&c.serviceAgreement.type)ServicePlan.validate(c.serviceAgreement,c.start,c.end);}
function authorizeWarrantyLookup(req) {
  var expected=PropertiesService.getScriptProperties().getProperty('GATEWAY_SECRET')||'';
  var got=String(req.gatewaySecret||'');
  if(expected.length<32||got.length!==expected.length)throw Error('Unauthorized lookup');
  var diff=0;for(var i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^got.charCodeAt(i);
  if(diff||String(Session.getEffectiveUser().getEmail()).toLowerCase()!=='admin@dongroups.com')throw Error('Unauthorized lookup');
}
function lookupPublicWarranty(req) {
  authorizeWarrantyLookup(req);
  if(!ServicePlan.validSerial(req.serial))return {ok:true,found:false};
  var serial=ServicePlan.normalizeSerial(req.serial),matches=[];
  listRows('Settings').forEach(function(row){if(!/^DealStatus_/.test(row.Title||''))return;var ds;try{ds=JSON.parse(row.Value||'{}');}catch(_){return;}(ds.expiries||[]).forEach(function(e){var record=ServicePlan.publicRecord(e);if(record&&record.serial===serial)matches.push(record);});});
  // Conflicting registrations need staff review, never guess a customer's warranty.
  if(matches.length!==1)return {ok:true,found:false};
  return {ok:true,found:true,warranty:matches[0]};
}
function serviceReminderJobs(settings,contracts,today,team) {
  ServicePlan.date(today);var jobs=[];
  function add(kind,id,label,date,lead,emails,skipAdvance){
    try{ServicePlan.date(date);}catch(_){return;}
    var days=Math.round((ServicePlan.date(date)-ServicePlan.date(today))/86400000);
    lead=Number(lead);if(!isFinite(lead)||lead<0)lead=30;
    if(days>lead)return;
    var phase=days<=0?'due':'advance';if(skipAdvance&&phase==='advance')return;
    ServicePlan.teamEmails(emails,team).forEach(function(email){jobs.push({key:JSON.stringify([kind,id,date,phase,email]),to:email,subject:'[D ON NET] '+kind+' · '+(phase==='due'?'ถึงกำหนด/เกินกำหนด':'ใกล้ถึงกำหนด'),body:label+'\nกำหนด: '+date+'\n'+(days<0?'เลยกำหนด '+Math.abs(days)+' วัน':'อีก '+days+' วัน')+'\nกรุณาตรวจสอบใน SalePro ก่อนประสานงานกับลูกค้า'});});
  }
  settings.forEach(function(row){if(!/^DealStatus_/.test(row.Title||''))return;var ds;try{ds=JSON.parse(row.Value||'{}');}catch(_){return;}(ds.expiries||[]).forEach(function(e,index){if(e.renewed)return;add('ประกัน/หมดอายุ',row.Title+':'+(e.id||index),(e.type||'')+' '+(e.name||'')+'\nSerial: '+(e.serial||''),e.expiryDate,e.remindDays==null?30:e.remindDays,e.emails,!!e.remindSentAt);});});
  contracts.forEach(function(row){var c;try{c=JSON.parse(row.Value||'{}');}catch(_){return;}var p=c.serviceAgreement;
    if(c.ackFor!==c.end)add('สิ้นสุดสัญญา',row.id||row._id,(c.party||'')+'\nPO: '+(c.poRef||'')+'\n'+(c.name||''),c.end,c.alertDays==null?30:c.alertDays,p?p.teamEmails:c.alertEmails,c.remindSentFor===c.end);
    if(!p||!p.type)return;
    try{ServicePlan.validate(p,c.start,c.end);}catch(_){return;}
    p.visits.forEach(function(v){if(v.status==='completed'||v.status==='cancelled')return;add('รอบ '+p.type,(row.id||row._id)+':'+v.id,(c.party||'')+'\nPO: '+(c.poRef||'')+'\nรอบเดือน: '+v.month+'\n'+(v.plannedDate?'วันนัด: '+v.plannedDate:'ยังไม่ยืนยันวันนัด ใช้วันสุดท้ายในเดือนเป็นกรอบติดตาม'),ServicePlan.dueDate(v,c.end),p.remindDays,p.teamEmails,false);});
  });return jobs;
}
function serviceAllowedTeam() {
  var props=PropertiesService.getScriptProperties();
  var allowed=(props.getProperty('ALLOWED_EMAILS')||'admin@dongroups.com').split(',').map(function(e){return e.trim().toLowerCase();});
  return ServicePlan.teamEmails(props.getProperty('TEAM_ALERT_EMAILS')||ServicePlan.team.join(','),allowed);
}
function serviceAutomationDryRun(){
  if(String(Session.getEffectiveUser().getEmail()).toLowerCase()!=='admin@dongroups.com')throw Error('Run as admin@dongroups.com');
  var today=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd');
  var jobs=serviceReminderJobs(listRows('Settings'),listRows('Contracts'),today,serviceAllowedTeam());
  var result={jobs:jobs.length,emailsSent:0,enabled:PropertiesService.getScriptProperties().getProperty('SERVICE_REMINDERS_ENABLED')==='true'};
  Logger.log(JSON.stringify(result));return result;
}
function runServiceRemindersDaily(){
  if(PropertiesService.getScriptProperties().getProperty('SERVICE_REMINDERS_ENABLED')!=='true')return;
  if(String(Session.getEffectiveUser().getEmail()).toLowerCase()!=='admin@dongroups.com')throw Error('Run as admin@dongroups.com');
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    var today=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd');
    var jobs=serviceReminderJobs(listRows('Settings'),listRows('Contracts'),today,serviceAllowedTeam());
    var sheet=_sheet('ServiceReminderLog'),headers=_ensureCols(sheet,['Key','State','SentAt']),existing={};
    listRows('ServiceReminderLog').forEach(function(r){existing[r.Key]=r.State;});
    var sent=0;
    jobs.forEach(function(job){
      if(sent>=40||MailApp.getRemainingDailyQuota()<1)return;
      var hash=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,job.key));
      if(existing[hash])return;
      var id=_uuid(),row=sheet.getLastRow()+1;
      var values=headers.map(function(h){return h===ID_COL?id:h==='Key'?hash:h==='State'?'sending':'';});
      sheet.getRange(row,1,1,headers.length).setNumberFormat('@').setValues([values]);SpreadsheetApp.flush();existing[hash]='sending';
      try{MailApp.sendEmail({to:job.to,subject:job.subject,body:job.body,name:'D ON NET · ทีมบริการ'});
        sheet.getRange(row,headers.indexOf('State')+1).setValue('sent');sheet.getRange(row,headers.indexOf('SentAt')+1).setValue(new Date().toISOString());sent++;
      }catch(error){sheet.getRange(row,headers.indexOf('State')+1).setValue('uncertain');}
    });
  }finally{lock.releaseLock();}
}
function installServiceReminderTrigger(){
  if(String(Session.getEffectiveUser().getEmail()).toLowerCase()!=='admin@dongroups.com')throw Error('Run as admin@dongroups.com');
  if(!serviceAllowedTeam().length)throw Error('No allowed team recipients');
  var current=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='runServiceRemindersDaily';});
  if(!current.length)ScriptApp.newTrigger('runServiceRemindersDaily').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Bangkok').create();
  var rows=listRows('Settings'),mode=rows.filter(function(r){return r.Title==='ServiceReminderMode';})[0];
  if(mode)updateRow('Settings',mode.id,{Value:'server'});else createRow('Settings',{Title:'ServiceReminderMode',Value:'server'});
  PropertiesService.getScriptProperties().setProperty('SERVICE_REMINDERS_ENABLED','true');
  Logger.log('Installed daily service reminder. No email sent by installer.');
}

// Called only while holding the script lock. Reserve counter before writing a row.
function prepareContractNumberFields(name, fields, existing) {
  if(name!=='Contracts'||!fields||typeof fields.Value!=='string')return fields;
  var c=JSON.parse(fields.Value),old={};if(existing&&existing.Value)old=JSON.parse(existing.Value);
  if(old.contractNo)c.contractNo=old.contractNo;
  else {
    var year=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy'),prefix='DN-CT-'+year+'-',prop='CONTRACT_SEQUENCE_'+year;
    var props=PropertiesService.getScriptProperties(),last=Number(props.getProperty(prop)||0);
    listRows('Contracts').forEach(function(r){try{var n=JSON.parse(r.Value||'{}').contractNo||'';if(n.indexOf(prefix)===0&&/^\d+$/.test(n.slice(prefix.length)))last=Math.max(last,Number(n.slice(prefix.length)));}catch(_){}});
    if(!Number.isSafeInteger(last)||last<0)throw Error('Invalid contract sequence');
    var next=last+1;props.setProperty(prop,String(next));c.contractNo=prefix+('0000'+next).slice(-Math.max(4,String(next).length));
  }
  fields.Value=JSON.stringify(c);return fields;
}
// Backfills existing contracts, preserving all other stored fields. Safe to rerun.
function ensureContractNumbers(){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{var rows=listRows('Contracts'),sh=_sheet('Contracts'),hdr=_headers(sh),column=hdr.indexOf('Value')+1,changed=0;
    rows.forEach(function(r){var c=JSON.parse(r.Value||'{}');if(c.contractNo)return;var fields=prepareContractNumberFields('Contracts',{Value:r.Value},r);var index=_findRowIndex(sh,r.id);if(index<0)throw Error('Contract not found');var cell=sh.getRange(index,column);cell.setNumberFormat('@');cell.setValue(fields.Value);changed++;});
    SpreadsheetApp.flush();return {ok:true,changed:changed};
  }finally{lock.releaseLock();}
}

function localDraftDecode(row){try{var parts=Number(row.Parts||1);if(!Number.isInteger(parts)||parts<1||parts>64)return null;var value=row.Value||'';for(var i=1;i<parts;i++)value+=row['Value'+i]||'';return JSON.parse(value);}catch(_){return null;}}
function localDraftChunks(value){var chunks=[];for(var at=0;at<value.length;){var end=Math.min(at+40000,value.length),last=value.charCodeAt(end-1);if(end<value.length&&last>=0xD800&&last<=0xDBFF)end--;chunks.push(value.slice(at,end));at=end;}return chunks;}
function localDraftRows(owner,raw){var values=listRows('SaleDrafts').filter(function(r){return r.OwnerEmail===owner;}).map(function(row){return {row:row,record:localDraftDecode(row)};}).filter(function(v){return v.record&&v.record.owner===owner;});if(raw)return values;var parents={};values.forEach(function(v){(v.record.parents||[]).forEach(function(p){parents[p]=true;});});return values.filter(function(v){return !parents[v.record.revision];});}
function localDraftReceipt(owner,revision,write){var sh=_sheet('SaleDraftReceipts'),key=owner+'|'+revision,at=_findRowIndex(sh,key);if(at>0)return true;if(write){var hdr=_ensureCols(sh,[ID_COL]),row=hdr.map(function(h){return h===ID_COL?key:'';});sh.getRange(sh.getLastRow()+1,1,1,hdr.length).setNumberFormat('@').setValues([row]);}return false;}
function localDraftSync(req){
  var owner=String(req._actor.email).toLowerCase(),since=Number(req.since||0);if(!Number.isSafeInteger(since)||since<0)throw Error('Invalid sync cursor');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{var cursor=Number(PropertiesService.getScriptProperties().getProperty('LOCAL_DRAFT_SEQUENCE')||0),records=localDraftRows(owner).filter(function(v){return Number(v.row.SyncVersion)>since;}).map(function(v){return v.record;});return {ok:true,records:records,cursor:cursor};}finally{lock.releaseLock();}
}
function localDraftAppend(req){
  var owner=String(req._actor.email).toLowerCase(),r=req.record;
  if(!r||r.owner!==owner||r.schema!==1||!/^[-a-zA-Z0-9]{1,100}$/.test(r.draftId)||!/^[-a-zA-Z0-9]{1,100}$/.test(r.revision)||!Array.isArray(r.parents)||r.parents.length>100||r.parents.some(function(p){return typeof p!=='string'||p.length>100;})||['draft','submitted'].indexOf(r.kind)<0)throw Error('Invalid Draft');
  if(r.kind==='draft'&&(!r.snapshot||!Array.isArray(r.snapshot.items)||!r.snapshot.fields))throw Error('Incomplete Draft');
  var chunks=localDraftChunks(JSON.stringify(r)),parts=chunks.length;if(parts>64)throw Error('Draft ใหญ่เกินไป กรุณาลดรูปภาพหรือรายการ');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var values=localDraftRows(owner),live={};values.forEach(function(v){live[v.record.revision]=true;});
    localDraftRows(owner,true).filter(function(v){return !live[v.record.revision];}).forEach(function(v){localDraftReceipt(owner,v.record.revision,true);var old=_sheet('SaleDrafts'),at=_findRowIndex(old,v.row.id);if(at>0)old.getRange(at,1,1,_headers(old).length).clearContent();});
    var prior=values.filter(function(v){return v.record.revision===r.revision;})[0];if(prior||localDraftReceipt(owner,r.revision,false))return {ok:true,revision:r.revision};
    var related=values.filter(function(v){return v.record.draftId===r.draftId;}),replace=related.filter(function(v){return r.parents.indexOf(v.record.revision)>=0;});
    if(related.some(function(v){return v.record.kind==='submitted';})&&r.kind==='draft')throw Error('Draft ถูกส่งอนุมัติแล้ว กรุณาตรวจใบรออนุมัติ');
    var props=PropertiesService.getScriptProperties(),sequence=Number(props.getProperty('LOCAL_DRAFT_SEQUENCE')||0)+1;
    if(!Number.isSafeInteger(sequence))throw Error('Invalid Draft sequence');props.setProperty('LOCAL_DRAFT_SEQUENCE',String(sequence));
    var sh=_sheet('SaleDrafts'),fields={OwnerEmail:owner,Title:r.draftId,SyncVersion:sequence,Parts:parts,Value:chunks[0]};
    // Persist receipts for overwritten versions before replacing their snapshots.
    replace.forEach(function(v){localDraftReceipt(owner,v.record.revision,true);});
    for(var i=1;i<parts;i++)fields['Value'+i]=chunks[i];
    var hdr=_ensureCols(sh,[ID_COL].concat(Object.keys(fields))),index=replace.length?_findRowIndex(sh,replace[0].row.id):sh.getLastRow()+1,id=replace.length?replace[0].row.id:_uuid();
    var row=hdr.map(function(h){return h===ID_COL?id:fields[h]===undefined?'':String(fields[h]);});sh.getRange(index,1,1,hdr.length).setNumberFormat('@').setValues([row]);
    // Resolution replaces all conflicting heads with the chosen snapshot; no business rows are deleted.
    replace.slice(1).forEach(function(v){var at=_findRowIndex(sh,v.row.id);if(at>0)sh.getRange(at,1,1,hdr.length).clearContent();});
    SpreadsheetApp.flush();localDraftReceipt(owner,r.revision,true);return {ok:true,revision:r.revision};
  }finally{lock.releaseLock();}
}

function validatePurchaseDecision(name,fields,existing,actor){
  if(name!=='Procurement'&&name!=='Settings')return;
  var title=String((existing&&existing.Title)||(fields&&fields.Title)||'');if(title.indexOf('Purchase_')!==0||!fields||!Object.prototype.hasOwnProperty.call(fields,'Value'))return;
  var next=JSON.parse(fields.Value||'{}'),previous=JSON.parse(existing&&existing.Value||'{}');
  var a=next.stageData&&next.stageData.approval,b=previous.stageData&&previous.stageData.approval;
  if(!a||['approved','rejected'].indexOf(a.status)<0)return;
  if(b&&JSON.stringify(a)===JSON.stringify(b))return;
  var email=String(actor&&actor.email||'').trim().toLowerCase();
  if(!b||b.status!=='pending'||!email||email!==String(b.approverEmail||'').trim().toLowerCase())throw Error('Only the assigned PO approver may decide this request');
  if(String(a.approverEmail||'').trim().toLowerCase()!==email||a.at!==b.at||a.amount!==b.amount)throw Error('PO approval request changed; refresh before deciding');
  a.decidedByEmail=email;a.decidedBy=String(actor.name||email);a.decidedAt=new Date().toISOString();fields.Value=JSON.stringify(next);
}
