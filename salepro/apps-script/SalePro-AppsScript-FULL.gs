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
    if(name==='SalesTaxInvoices'){
      var title=String(fields&&fields.Title||'').trim();
      if(!title||title.length>100||title.charAt(0)==='='||!fields.QuoteID||!/^\d{4}-\d{2}-\d{2}$/.test(fields.TaxDate)||!/^\d{4}-\d{2}-\d{2}$/.test(fields.DocumentDate)||typeof fields.BaseAmount!=='number'||!(fields.BaseAmount>0)||typeof fields.VatAmount!=='number'||!(fields.VatAmount>=0))throw Error('ข้อมูลใบกำกับภาษีไม่ครบ');
      var invoices=listRows(name);
      if(fields.DocumentType==='abbreviated'){
        var advance=listRows('RetailReceiptApprovals').find(function(r){return String(r.QuoteID)===String(fields.QuoteID);});
        if(advance&&fields.ApprovalID!==advance.id)throw Error('ต้องยืนยันเอกสารจากคำขอพิมพ์ล่วงหน้า');
        if(fields.ApprovalID){
          var approved=listRows('RetailReceiptApprovals').find(function(r){return String(r.id)===String(fields.ApprovalID);});
          if(!approved||approved.Status!=='approved'||String(approved.QuoteID)!==String(fields.QuoteID)||approved.Snapshot!==fields.Snapshot)throw Error('เอกสารไม่ตรงกับฉบับที่อนุมัติ');
          if(!fields.DocURL)throw Error('แนบเอกสารที่ลงวันที่จริงแล้วก่อนยืนยัน');
          var approvedSnapshot=JSON.parse(approved.Snapshot),currentQuote=listRows('Quotations').find(function(r){return String(r.id)===String(fields.QuoteID);});
          if(!currentQuote||retailApprovalSnapshot(currentQuote,approvedSnapshot.company)!==approved.Snapshot)throw Error('รายละเอียดเปลี่ยนจากฉบับอนุมัติ กรุณาขออนุมัติใหม่');
        }
        if(!fields.Snapshot||String(fields.Snapshot).length>45000||typeof fields.GrossAmount!=='number'||!Number.isFinite(fields.GrossAmount))throw Error('ข้อมูลสำเนาเอกสารไม่ครบหรือใหญ่เกินไป');
        var snapshot=JSON.parse(fields.Snapshot);
        if(!snapshot.totals||![snapshot.totals.base,snapshot.totals.vat,fields.BaseAmount,fields.VatAmount].every(Number.isFinite)||Math.abs(Number(snapshot.totals.base)-fields.BaseAmount)>0.01||Math.abs(Number(snapshot.totals.vat)-fields.VatAmount)>0.01||Math.abs(fields.BaseAmount+fields.VatAmount-fields.GrossAmount)>0.01)throw Error('ยอดเอกสารอย่างย่อไม่ตรงกัน');
        var quote=listRows('Quotations').find(function(row){return String(row.id)===String(fields.QuoteID);});
        if(!quote||quote.Status==='Cancelled'||Math.abs(Number(quote.TotalAmount)-fields.GrossAmount)>0.02)throw Error('ยอดใบเสนอราคาถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
        var received=listRows('Payments').filter(function(row){return String(row.QuoteID)===String(fields.QuoteID);}).reduce(function(sum,row){return sum+Number(row.AmountPaid||0);},0);
        if(received<fields.GrossAmount-0.01)throw Error('ยังรับชำระไม่ครบยอด');
        if(invoices.some(function(row){return String(row.QuoteID)===String(fields.QuoteID);}))throw Error('งานนี้มีใบกำกับภาษีแล้ว กรุณาตรวจเอกสารเดิม');
      }else if(invoices.some(function(row){return row.DocumentType==='abbreviated'&&String(row.QuoteID)===String(fields.QuoteID);}))throw Error('งานนี้ออกใบกำกับอย่างย่อแล้ว กรุณาตรวจเอกสารเดิม');
      var duplicate=invoices.find(function(row){return String(row.Title||'').trim().toLowerCase()===title.toLowerCase();});
      if(duplicate)throw Error('เลขที่ใบกำกับภาษีนี้ถูกบันทึกแล้ว');
      fields.Title=title;
    }
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
    if(name==='Procurement'||name==='Settings'){var oldPurchase=listRows(name).filter(function(r){return String(r.id)===String(id);})[0];validatePurchaseDecision(name,fields,oldPurchase,actor);if(name==='Settings')keepTechExpenseTaxReviews(fields,oldPurchase);checkPurchaseTaxRevision(fields,oldPurchase);}
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
  var isHtml = req.textOnly!==true && /<[a-z][\s\S]*>/i.test(req.body || '');
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

function correctClosedPurchasePayment(req) {
  var email=String(req._actor && req._actor.email || '').toLowerCase();
  if(email!=='admin@dongroups.com') throw Error('เฉพาะ Admin ที่แก้ยอดหลังปิดงานได้');
  var amount=req.amount, rate=req.whtPct, reason=String(req.reason||'').trim();
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(rate)||rate<0||rate>100||!reason||reason.length>500)
    throw Error('ตรวจยอดก่อนหัก อัตราหัก ณ ที่จ่าย และเหตุผล');
  var lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var title='Purchase_'+String(req.purchaseId||'');
    var name='Procurement';
    var row=listRows(name).find(function(item){return item.Title===title;});
    if(!row){name='Settings';row=listRows(name).find(function(item){return item.Title===title;});}
    if(!row) throw Error('ไม่พบงานจัดซื้อ');
    var purchase=JSON.parse(row.Value||'{}');
    var vendors=purchase.stageData && purchase.stageData.payment && purchase.stageData.payment.vendors;
    var vendorId=String(req.vendorId||'');
    var payment=vendors && Object.prototype.hasOwnProperty.call(vendors,vendorId) && vendors[vendorId];
    if(purchase.closed!==true||!payment) throw Error('แก้ได้เฉพาะรายการจ่ายที่มีอยู่ในงานปิดแล้ว');
    var oldAmount=Number(payment.amount||0), oldRate=Number(payment.whtPct||0);
    if(oldAmount!==req.previousAmount||oldRate!==req.previousWhtPct)
      throw Error('ยอดถูกแก้จากอีกหน้าจอ กรุณาโหลดข้อมูลใหม่');
    if(oldAmount===amount&&oldRate===rate) return {ok:true,purchase:purchase};
    payment.amount=amount;
    payment.whtPct=rate;
    purchase.history=purchase.history||[];
    purchase.history.push({ts:new Date().toISOString(),stage:purchase.stage,by:email,action:'paymentCorrection',vendorId:vendorId,reason:reason,previousAmount:oldAmount,previousWhtPct:oldRate,amount:amount,whtPct:rate});
    var sheet=_sheet(name), column=_headers(sheet).indexOf('Value')+1, position=_findRowIndex(sheet,row.id);
    if(!column||position<0) throw Error('ไม่พบช่องข้อมูลจัดซื้อ');
    sheet.getRange(position,column).setValue(JSON.stringify(purchase));
    return {ok:true,purchase:purchase};
  } finally {lock.releaseLock();}
}

function replaceFinanceAttachment(req, certificate) {
  var email=String(req._actor && req._actor.email || '').toLowerCase();
  if(!email) throw Error('กรุณาเข้าสู่ระบบ');
  var url=String(req.url||''), filename=String(req.filename||'').trim();
  if(!/^https:\/\/drive\.google\.com\//.test(url)||!filename||filename.length>255) throw Error('ไฟล์แนบไม่ถูกต้อง');
  var lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var settings=listRows('Settings');
    var role=settings.find(function(row){return row.Title==='Role_'+email||row.Title==='Role_'+email.split('@')[0];});
    if(email!=='admin@dongroups.com'&&String(role&&role.Value||'').trim().toLowerCase()!=='admin')
      throw Error('เฉพาะ Admin ที่เปลี่ยนไฟล์แนบได้');
    var target=req.target||{}, sheetName, row, data, attachment, urlKey, nameKey;
    if(certificate&&target.source!=='SalePro')throw Error('เลือกเฉพาะรายการรับชำระจาก SalePro');
    if(target.source==='SalePro'){
      sheetName='Payments';
      row=listRows(sheetName).find(function(item){return String(item.id)===String(target.id);});
      attachment=row;
      urlKey=certificate?'WHTCertificateURL':'SlipURL';
      nameKey=certificate?'WHTCertificateName':'SlipName';
    }else if(target.source==='PurchasePro'){
      var purchaseTitle='Purchase_'+String(target.id||'');
      sheetName='Procurement';
      row=listRows(sheetName).find(function(item){return item.Title===purchaseTitle;});
      if(!row){sheetName='Settings';row=settings.find(function(item){return item.Title===purchaseTitle;});}
      if(row){
        data=JSON.parse(row.Value||'{}');
        var vendors=data.stageData?.payment?.vendors;
        if(vendors&&Object.prototype.hasOwnProperty.call(vendors,target.vendorId))attachment=vendors[target.vendorId];
      }
      var useInvoice=attachment&&!attachment.slipUrl&&attachment.invUrl;
      urlKey=useInvoice?'invUrl':'slipUrl';nameKey=useInvoice?'invName':'slipName';
    }else if(target.source==='TechPro'||target.source==='SaleExpense'){
      sheetName='Settings';
      row=settings.find(function(item){return item.Title==='DealStatus_'+String(target.quoteId||'');});
      if(row){
        data=JSON.parse(row.Value||'{}');
        var expenses=data.expenses;
        if(target.source==='TechPro'){
          var job=(data.techJobs||[]).find(function(item){return item.id!=null&&String(item.id)===String(target.jobId);});
          expenses=job&&job.expenses;
        }
        attachment=(expenses||[]).find(function(item){return item.id!=null&&String(item.id)===String(target.id);});
      }
      urlKey='receiptUrl';nameKey='receiptName';
    }
    if(!row||!attachment)throw Error('ไม่พบรายการต้นทาง');
    var previous=String(attachment[urlKey]||'');
    if(previous===url&&attachment[nameKey]===filename)return {ok:true};
    if(previous!==String(req.previousUrl||''))throw Error('ไฟล์แนบถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
    attachment[urlKey]=url;
    attachment[nameKey]=filename;
    var sheet=_sheet(sheetName), rowIndex=_findRowIndex(sheet,row.id);
    if(rowIndex<1)throw Error('ไม่พบแถวข้อมูลต้นทาง');
    if(data){
      var valueColumn=_headers(sheet).indexOf('Value')+1;
      if(!valueColumn)throw Error('ไม่พบช่องข้อมูลต้นทาง');
      sheet.getRange(rowIndex,valueColumn).setValue(JSON.stringify(data));
    }else{
      var headers=_ensureCols(sheet,[urlKey,nameKey]);
      var range=sheet.getRange(rowIndex,1,1,headers.length);
      var formulas=range.getFormulas()[0];
      var values=range.getValues()[0].map(function(value,index){return formulas[index]||value;});
      values[headers.indexOf(urlKey)]=url;
      values[headers.indexOf(nameKey)]=filename.charAt(0)==='='?String.fromCharCode(39)+filename:filename;
      range.setValues([values]);
    }
    return {ok:true};
  }finally{lock.releaseLock();}
}

function checkPurchaseTaxRevision(fields, previous) {
  if(!previous||!String(previous.Title||'').startsWith('Purchase_')||typeof fields.Value!=='string')return;
  var old=JSON.parse(previous.Value||'{}').stageData?.payment?.vendors||{};
  var next=JSON.parse(fields.Value||'{}').stageData?.payment?.vendors||{};
  Object.keys(old).forEach(function(id){
    if(old[id].taxRevision&&next[id]&&old[id].taxRevision!==next[id].taxRevision)throw Error('Finance แก้ข้อมูลภาษีแล้ว กรุณาโหลดงานจัดซื้อใหม่ก่อนบันทึก');
  });
}
function keepTechExpenseTaxReviews(fields, previous) {
  if(!previous||!String(previous.Title||'').startsWith('DealStatus_')||typeof fields.Value!=='string')return;
  var saved=JSON.parse(previous.Value||'{}'), next=JSON.parse(fields.Value||'{}');
  var jobs=new Map((saved.techJobs||[]).map(function(job){return [String(job.id),job];}));
  (next.techJobs||[]).forEach(function(job){
    var oldJob=jobs.get(String(job.id));
    if(!oldJob)return;
    var expenses=new Map((oldJob.expenses||[]).map(function(expense){return [String(expense.id),expense];}));
    (job.expenses||[]).forEach(function(expense){
      var old=expenses.get(String(expense.id));
      if(old?.taxRevision&&old.taxRevision!==expense.taxRevision){
        ['taxDoc','taxDocUrl','taxDate','vatAmount','baseAmount','vatStatus','taxDocumentType','whtStatus','taxRevision','taxEditReason','taxEditedBy','taxEditedAt','vatReviewedBy','vatReviewedAt'].forEach(function(key){expense[key]=old[key];});
      }
      if(expense.taxDocumentType!=='invoice')return;
      var unchanged=old&&old.vatReviewedBy&&['taxDoc','taxDocUrl','taxDate','vatAmount','receiptUrl','amount'].every(function(key){return old[key]===expense[key];});
      expense.vatStatus=unchanged?old.vatStatus:'pending';
      expense.vatReviewedBy=unchanged?old.vatReviewedBy:'';
      expense.vatReviewedAt=unchanged?old.vatReviewedAt:'';
    });
  });
  fields.Value=JSON.stringify(next);
}
function reviewTechExpenseTax(req) {
  var email=String(req._actor && req._actor.email || '').toLowerCase();
  var target=req.target||{}, status=String(req.status||'');
  if(!email||target.source!=='TechPro'||!['pending','credit','excluded'].includes(status)) throw Error('ข้อมูลตรวจภาษีไม่ถูกต้อง');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var settings=listRows('Settings');
    var role=settings.find(function(row){return row.Title==='Role_'+email||row.Title==='Role_'+email.split('@')[0];});
    if(email!=='admin@dongroups.com'&&String(role&&role.Value||'').trim().toLowerCase()!=='admin')throw Error('เฉพาะ Admin ที่ยืนยันภาษีซื้อได้');
    var row=settings.find(function(r){return r.Title==='DealStatus_'+String(target.quoteId||'');});
    var deal=row?JSON.parse(row.Value||'{}'):{};
    var job=(deal.techJobs||[]).find(function(j){return j.id!=null&&String(j.id)===String(target.jobId);});
    var expense=(job&&job.expenses||[]).find(function(e){return e.id!=null&&String(e.id)===String(target.id);});
    if(!expense||expense.taxDocumentType!=='invoice'||!(expense.receiptUrl||expense.taxDocUrl)||expense.taxDoc!==req.taxDoc||expense.taxDate!==req.taxDate||expense.vatAmount!==req.vat)throw Error('ใบกำกับถูกแก้หรือไม่ครบ กรุณาโหลดข้อมูลใหม่');
    if(expense.vatStatus===status)return {ok:true};
    if(expense.vatStatus!==req.previousStatus)throw Error('ผลตรวจถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
    expense.vatStatus=status;
    expense.taxRevision=Utilities.getUuid();
    expense.vatReviewedBy=email;
    expense.vatReviewedAt=new Date().toISOString();
    var sheet=_sheet('Settings'),index=_findRowIndex(sheet,row.id),column=_headers(sheet).indexOf('Value')+1;
    if(index<1||column<1)throw Error('ไม่พบรายการต้นทาง');
    sheet.getRange(index,column).setValue(JSON.stringify(deal));
    return {ok:true};
  }finally{lock.releaseLock();}
}
function correctFinanceTax(req) {
  var target=req.target||{}, expected=req.expected||{}, input=req.data||{};
  var email=String(req._actor&&req._actor.email||'').toLowerCase();
  var reason=String(input.reason||'').trim();
  if(!email||!reason||reason.length>500)throw Error('ระบุเหตุผลที่แก้ไข');
  var sources=['SalePro','PurchasePro','TechPro','SaleExpense'];
  if(!sources.includes(target.source)||!target.id)throw Error('ไม่พบประเภทของรายการต้นทาง');
  var sale=target.source==='SalePro', purchase=target.source==='PurchasePro';
  var taxDoc=String(input.taxDoc||'').trim(), documentDate=String(input.documentDate||'');
  var taxDate=String(input.taxDate||''), invoiceUrl=String(input.invoiceUrl||'');
  if(invoiceUrl&&(!taxDoc||!/^https:\/\/drive\.google\.com\//.test(invoiceUrl)))throw Error('ไฟล์ใบกำกับภาษีไม่ถูกต้อง');
  var validDate=function(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;};
  if(taxDoc.length>100||taxDoc.charAt(0)==='='||documentDate&&!validDate(documentDate)||taxDate&&!validDate(taxDate))throw Error('ตรวจเลขที่และวันที่ใบกำกับภาษี');
  var number=function(value){if(value==null||String(value).trim()==='')return null;var n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('ยอดภาษีหรืออัตราภาษีไม่ถูกต้อง');return Math.round(n*100)/100;};
  var vat=number(input.vat), rate=number(input.whtRate), whtBase=number(input.whtBase);
  var status=String(input.vatStatus||'');
  var whtStatus=input.whtStatus;
  if(whtStatus!=null&&(target.source!=='TechPro'||!['pending','none'].includes(whtStatus)))throw Error('สถานะหัก ณ ที่จ่ายไม่ถูกต้อง');
  if(!sale&&!['pending','credit','excluded','none'].includes(status))throw Error('เลือกสถานะ VAT ซื้อ');
  if(!sale&&status==='none')vat=0;
  if(!sale&&['credit','excluded'].includes(status)&&(!taxDoc||!documentDate||vat==null))throw Error('กรอกเลขที่ วันที่ และยอด VAT ตามใบกำกับ');
  if(sale&&vat==null)throw Error('ระบุ VAT ของยอดรับชำระ');
  if((sale||purchase)&&(rate==null||rate>100))throw Error('ระบุอัตราหัก ณ ที่จ่ายระหว่าง 0 ถึง 100');

  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var settings=listRows('Settings');
    var role=settings.find(function(row){return row.Title==='Role_'+email||row.Title==='Role_'+email.split('@')[0];});
    if(email!=='admin@dongroups.com'&&String(role&&role.Value||'').trim().toLowerCase()!=='admin')throw Error('เฉพาะ Admin ที่แก้ข้อมูลภาษีได้');
    var sheetName, row, record, detail;
    if(sale){
      sheetName='Payments';
      row=listRows(sheetName).find(function(r){return String(r.id)===String(target.id);});
      record=row;
    }else if(purchase){
      var title='Purchase_'+String(target.id);
      sheetName='Procurement';
      row=listRows(sheetName).find(function(r){return r.Title===title;});
      if(!row){sheetName='Settings';row=settings.find(function(r){return r.Title===title;});}
      if(row){detail=JSON.parse(row.Value||'{}');record=detail.stageData?.payment?.vendors?.[target.vendorId];}
    }else{
      sheetName='Settings';
      row=settings.find(function(r){return r.Title==='DealStatus_'+String(target.quoteId||'');});
      if(row){
        detail=JSON.parse(row.Value||'{}');
        var job=(detail.techJobs||[]).find(function(j){return String(j.id)===String(target.jobId);});
        var expenses=target.source==='TechPro'?job&&job.expenses:detail.expenses;
        record=(expenses||[]).find(function(expense){return String(expense.id)===String(target.id);});
      }
    }
    if(!row||!record)throw Error('ไม่พบรายการต้นทาง');
    var gross=Number(sale?record.AmountPaid:record.amount);
    var revision=String((sale?record.TaxRevision:record.taxRevision)||'');
    if(!Number.isFinite(gross)||gross<=0||gross!==Number(expected.gross)||revision!==String(expected.revision||''))throw Error('รายการถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
    if(vat!=null&&vat>gross)throw Error('VAT เกินยอดรวมของรายการ');
    var base=vat==null?null:Math.round((gross-vat)*100)/100;
    if(rate!=null){
      if(whtBase==null)whtBase=base;
      if((rate>0&&whtBase==null)||whtBase!=null&&whtBase>(base==null?gross:base))throw Error('ตรวจฐานหัก ณ ที่จ่าย');
    }
    if(!sale&&!purchase&&status==='credit'&&!(record.receiptUrl||record.taxDocUrl||invoiceUrl))throw Error('แนบใบกำกับภาษีในรายการก่อนยืนยันเครดิต');
    var wht=rate==null?null:Math.round((whtBase||0)*rate)/100;
    var nextRevision=Utilities.getUuid(), now=new Date().toISOString();
    if(sale){
      var invoiceId=String(record.TaxInvoiceId||'');
      if(invoiceId!==String(expected.invoiceId||''))throw Error('ใบกำกับถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
      if(taxDoc||invoiceId||documentDate||taxDate){
        var invoiceBase=number(input.invoiceBase), invoiceVat=number(input.invoiceVat);
        if(!taxDoc||!documentDate||!taxDate||!(invoiceBase>0)||invoiceVat==null)throw Error('กรอกข้อมูลทั้งใบกำกับภาษีให้ครบ');
        var invoices=listRows('SalesTaxInvoices');
        var invoice=invoices.find(function(doc){return String(doc.id)===invoiceId;});
        if(invoiceId&&(!invoice||String(invoice.QuoteID)!==String(record.QuoteID)||String(invoice.TaxRevision||'')!==String(expected.invoiceRevision||'')))throw Error('ใบกำกับถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
        var duplicate=invoices.find(function(doc){return String(doc.Title||'').trim().toLowerCase()===taxDoc.toLowerCase()&&String(doc.id)!==invoiceId;});
        if(duplicate){
          if(invoice||invoiceUrl||String(duplicate.QuoteID)!==String(record.QuoteID)||duplicate.DocumentDate!==documentDate||duplicate.TaxDate!==taxDate||Number(duplicate.BaseAmount)!==invoiceBase||Number(duplicate.VatAmount)!==invoiceVat)throw Error('เลขที่ใบกำกับนี้มีอยู่แล้ว ตรวจข้อมูลทั้งใบให้ตรงกัน');
          invoiceId=String(duplicate.id);
        }else{
          invoiceId=invoiceId||Utilities.getUuid();
          var invoiceFields={Title:taxDoc,QuoteID:record.QuoteID,DocumentDate:documentDate,TaxDate:taxDate,BaseAmount:invoiceBase,VatAmount:invoiceVat,TaxRevision:nextRevision,TaxEditedBy:email,TaxEditedAt:now,TaxEditReason:reason};
          if(invoiceUrl)invoiceFields.DocURL=invoiceUrl;
          writeFinanceTaxFields('SalesTaxInvoices',invoiceId,invoiceFields,!invoice);
        }
      }
      writeFinanceTaxFields(sheetName,row.id,{PaymentVersion:'2',PaymentBaseAmount:base,PaymentVatAmount:vat,PaymentVatRate:base>0?vat/base*100:0,WHTBaseAmount:whtBase,WHTPercent:rate,WHTAmount:wht,ReceivedAmount:Math.round((gross-wht)*100)/100,TaxInvoiceId:invoiceId,TaxDocumentMode:'document',TaxRevision:nextRevision,TaxEditedBy:email,TaxEditedAt:now,TaxEditReason:reason});
    }else{
      Object.assign(record,{taxDoc:taxDoc,taxDate:documentDate,vatStatus:status,vatAmount:vat,baseAmount:base,taxRevision:nextRevision,taxEditReason:reason,taxEditedBy:email,taxEditedAt:now});
      if(invoiceUrl)record.taxDocUrl=invoiceUrl;
      if(whtStatus!=null)record.whtStatus=whtStatus;
      if(purchase)Object.assign(record,{taxCapture:'1',whtBaseAmount:whtBase,whtPct:rate});
      else Object.assign(record,{taxDocumentType:taxDoc?'invoice':(status==='none'?'none':record.taxDocumentType||'receipt'),vatReviewedBy:email,vatReviewedAt:now});
      writeFinanceTaxFields(sheetName,row.id,{Value:JSON.stringify(detail)});
    }
    return {ok:true};
  }finally{lock.releaseLock();}
}

// Called with the script lock held.
function writeFinanceTaxFields(name,id,fields,create) {
  var sheet=_sheet(name);
  var index=create?sheet.getLastRow()+1:_findRowIndex(sheet,id);
  if(index<1)throw Error('ไม่พบแถวข้อมูลต้นทาง');
  if(create)fields[ID_COL]=id;
  var headers=_ensureCols(sheet,Object.keys(fields));
  var range=sheet.getRange(index,1,1,headers.length);
  var formulas=range.getFormulas()[0], values=range.getValues()[0];
  range.setNumberFormat('@');
  range.setValues([headers.map(function(key,i){
    if(!Object.prototype.hasOwnProperty.call(fields,key))return formulas[i]||values[i];
    var value=fields[key];
    if(value==null)return '';
    return typeof value==='string'&&value.charAt(0)==='='?String.fromCharCode(39)+value:value;
  })]);
}

function handle(req) {
  var a = req.action;
  if(a==='replaceFinanceAttachment')return replaceFinanceAttachment(req);
  if(a==='correctTechExpenseTax'&&req.target?.source==='TechPro')return correctFinanceTax(req);
  if(a==='correctFinanceTax')return correctFinanceTax(req);
  if(a==='reviewTechExpenseTax')return reviewTechExpenseTax(req);
  if(a==='attachFinanceWhtCertificate')return replaceFinanceAttachment(req,true);
  if(a==='correctClosedPurchasePayment')return correctClosedPurchasePayment(req);
  if(a==='retailReceiptApproval')return retailReceiptApproval(req);
  if(req.list==='RetailReceiptApprovals'&&!['list','multiList'].includes(a))throw Error('ใช้ขั้นตอนอนุมัติเอกสารอย่างย่อเท่านั้น');
  if(a==='serviceReport')return serviceReport(req);
  srProtectGeneric(req);
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
    if(req.action==='publicServiceReport')return _json(lookupPublicServiceReport(req));
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
  listRows('Settings').forEach(function(row){if(!/^DealStatus_/.test(row.Title||''))return;var ds;try{ds=JSON.parse(row.Value||'{}');}catch(_){return;}(ds.expiries||[]).forEach(function(e){var record=ServicePlan.publicRecord(e);if(record&&record.serial===serial){record._quoteId=row.Title.slice(11);matches.push(record);}});});
  // Conflicting registrations need staff review, never guess a customer's warranty.
  if(matches.length!==1)return {ok:true,found:false};
  var match=matches[0],reports=publicServiceReports(serial,match._quoteId);delete match._quoteId;return {ok:true,found:true,warranty:match,reports:reports};
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

// Electronic reports: versioned blobs, immutable signed snapshots and explicit publication.
function srRows(){return listRows('Settings');}
function srGet(key){var row=srRows().filter(function(r){return r.Title===key;})[0];return row?JSON.parse(row.Value||'null'):null;}
function srWrite(key,value){var sh=_sheet('Settings'),hdr=_ensureCols(sh,[ID_COL,'Title','Value']),rows=listRows('Settings'),old=rows.filter(function(r){return r.Title===key;})[0],idx=old?_findRowIndex(sh,old.id):sh.getLastRow()+1;var record={Title:key,Value:JSON.stringify(value)};record[ID_COL]=old?old.id:_uuid();var vals=hdr.map(function(h){return record[h]==null?'':String(record[h]);});sh.getRange(idx,1,1,hdr.length).setNumberFormat('@').setValues([vals]);}
function srRead(meta){var chunks=[];for(var i=0;i<meta.parts;i++){var v=srGet('ServiceReportBlob_'+meta.id+'_'+meta.revision+'_'+i);if(typeof v!=='string')throw Error('Report data incomplete');chunks.push(v);}return JSON.parse(chunks.join(''));}
function srStore(meta,data){var text=JSON.stringify(data),parts=Math.ceil(text.length/28000);for(var i=0;i<parts;i++)srWrite('ServiceReportBlob_'+meta.id+'_'+meta.revision+'_'+i,text.slice(i*28000,(i+1)*28000));meta.parts=parts;srWrite('ServiceReportMeta_'+meta.id,meta);}
function srContext(req){var q=listRows('Quotations').filter(function(q){return String(q.id)===String(req.quoteId);})[0];if(!q)throw Error('ไม่พบใบเสนอราคา');var ds=srGet('DealStatus_'+q.id)||{},job=(ds.techJobs||[]).filter(function(j){return String(j.id)===String(req.jobId);})[0];if(!job)throw Error('ไม่พบงานช่าง');var email=String(req._actor.email||'').toLowerCase(),admin=email==='admin@dongroups.com';if(!admin&&email!==String(job.techEmail||'').toLowerCase())throw Error('เฉพาะช่างที่ได้รับมอบหมายหรือ Admin');return {q:q,ds:ds,job:job,email:email,admin:admin};}
function srValidate(r,sign){if(!r||r.schema!==1||['service','general'].indexOf(r.type)<0||!r.fields)throw Error('Invalid report');if(!String(r.fields.customer||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r.fields.date||''))throw Error('ระบุลูกค้าและวันที่บริการ');if(JSON.stringify(r).length>350000)throw Error('Report too large');if(!Array.isArray(r.materials)||r.materials.length>60||!Array.isArray(r.photos)||r.photos.length>24)throw Error('Invalid report attachments');if(!Array.isArray(r.strings)||r.strings.length!==2||r.strings.some(function(s){return !Array.isArray(s)||[40,44].indexOf(s.length)<0;}))throw Error('Invalid battery strings');if(!Array.isArray(r.backup)||r.backup.length!==6)throw Error('Invalid backup readings');if(sign&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.signature||''))throw Error('กรุณาเซ็นชื่อช่าง');if(sign&&r.type==='general'&&!String(r.fields.work||'').trim())throw Error('ระบุรายละเอียดการดำเนินงาน');}
function srPublicCopy(r){var copy=JSON.parse(JSON.stringify(r));copy.fields.contact='';copy.fields.phone='';copy.fields.site='';copy.fields.customerSigner='';copy.customerSignature='';delete copy.equipmentSource;return copy;}
function srBranding(){var company=listRows('Company')[0]||{},b={company:company.CompanyName||'บริษัท ดี ออน เน็ต จำกัด',logo:company.LogoBase64||'',serviceTitle:'SERVICE RECORD',generalTitle:'ใบงานบริการทั่วไป / JOB SHEET',footer:company.Address||'บริษัท ดี ออน เน็ต จำกัด · เลขที่ 78 หมู่ 11 ต.ผาเลือด อ.ท่าปลา จ.อุตรดิตถ์ 53190',website:'www.dongroups.com',phone:company.Phone||'065-262-9886'},config=srConfig();Object.keys(b).forEach(function(k){if(config[k]!=null)b[k]=config[k];});return b;}
function srProfiles(){var c=srGet('ServiceReportProfiles'),stored=c&&c.blob?srRead(c.meta):[],partners=listRows('Customers').filter(function(row){return row.IsPartner===true||String(row.IsPartner).toLowerCase()==='true';});var result=stored.filter(function(p){return p.id.indexOf('crm-')!==0;});partners.forEach(function(row){var id='crm-'+row.id,override=stored.filter(function(p){return p.id===id;})[0],base={company:row.Title||'',logo:'',serviceTitle:'SERVICE RECORD',generalTitle:'ใบงานบริการทั่วไป / JOB SHEET',footer:(row.Title||'')+(row.Address?' · '+row.Address:''),phone:row.Phone||'',website:row.Website||''};result.push({id:id,customerId:String(row.id),branding:override?override.branding:base});});return result;}
function srSafeBranding(c){var safe={};['company','logo','serviceTitle','generalTitle','footer','website','phone'].forEach(function(k){safe[k]=String(c[k]||'').slice(0,k==='logo'?160000:1500);});if(safe.logo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(safe.logo))throw Error('Invalid logo');return safe;}
function srReportBranding(data,meta){var id=String(data.brandingProfileId||'');if(meta){var prior=srRead(meta);if(String(prior.brandingProfileId||'')===id)return prior.branding;}if(!id)return srBranding();var profile=srProfiles().filter(function(p){return p.id===id;})[0];if(!profile)throw Error('ไม่พบโปรไฟล์ Partner กรุณาเลือกใหม่');return profile.branding;}
function srSerial(v){return ServicePlan.normalizeSerial(v);}
function srWarranty(ctx,serial){return (ctx.ds.expiries||[]).some(function(e){var w=ServicePlan.publicRecord(e);return w&&w.serial===serial;});}
function srPasswordHash(password,salt){var props=PropertiesService.getScriptProperties(),pepper=props.getProperty('REPORT_PASSWORD_PEPPER');if(!pepper){pepper=_uuid()+_uuid();props.setProperty('REPORT_PASSWORD_PEPPER',pepper);}return Utilities.base64Encode(Utilities.computeHmacSha256Signature(salt+'\n'+password,pepper));}
function srPasswordMatches(password,credential){if(!credential||typeof password!=='string'||password.length<12||password.length>128)return false;var got=srPasswordHash(password,credential.salt),expected=credential.hash||'',diff=got.length^expected.length;for(var i=0;i<got.length;i++)diff|=got.charCodeAt(i)^(expected.charCodeAt(i)||0);return diff===0;}
function serviceReport(req){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    if(req.op==='profilesGet')return {ok:true,profiles:srProfiles()};
    if(req.op==='profileSave'){if(String(req._actor.email).toLowerCase()!=='admin@dongroups.com')throw Error('เฉพาะ Admin ที่ตั้งค่า Partner ได้');var profiles=srProfiles(),id=String(req.profileId||''),branding=srSafeBranding(req.branding||{});if(!/^[\w-]{1,80}$/.test(id)||!branding.company.trim())throw Error('ระบุชื่อบริษัท Partner');var index=profiles.findIndex(function(p){return p.id===id;});if(index<0&&profiles.length>=20)throw Error('เก็บ Partner ได้ไม่เกิน 20 โปรไฟล์');var value={id:id,branding:branding};if(index<0)profiles.push(value);else profiles[index]=value;var pm={id:'profiles',revision:Date.now(),parts:0};srStore(pm,profiles);srWrite('ServiceReportProfiles',{blob:true,meta:pm});return {ok:true,profiles:profiles};}
    if(req.op==='configGet')return {ok:true,config:srConfig()};
    if(req.op==='configSave'){if(req._actor.email!=='admin@dongroups.com')throw Error('เฉพาะ Admin ที่ตั้งค่ารายงานได้');var c=req.config||{},safe={};['company','logo','serviceTitle','generalTitle','footer','website','phone'].forEach(function(k){safe[k]=String(c[k]||'').slice(0,k==='logo'?160000:1500);});if(safe.logo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(safe.logo))throw Error('Invalid logo');var configMeta={id:'config',revision:Date.now(),parts:0};srStore(configMeta,safe);srWrite('ServiceReportConfig',{blob:true,meta:configMeta});return {ok:true,config:safe};}
    var ctx=srContext(req),matches=srRows().filter(function(r){return /^ServiceReportMeta_/.test(r.Title||'');}).map(function(r){return JSON.parse(r.Value);}).filter(function(m){return m.id!=='config'&&m.id!=='profiles'&&m.quoteId===String(ctx.q.id)&&m.jobId===String(ctx.job.id);});
    if(req.op==='list')return {ok:true,reports:matches,equipment:(ctx.ds.expiries||[]).filter(function(e){return e.id!=null;}).map(function(e){return {id:String(e.id),name:e.name||'',serial:e.serial||''};})};
    if(req.op==='prepareServiceDrafts'){
      var seed=JSON.parse(JSON.stringify(req.report||{}));srValidate(seed,false);if(seed.type!=='service')throw Error('Service Record required');
      var seen={},created=[],existing=[],pending=[],skipped=0;
      (ctx.ds.expiries||[]).forEach(function(e){var sn=srSerial(e.serial);if(e.id==null||!ServicePlan.validSerial(sn)){skipped++;return;}if(seen[sn]){skipped++;return;}seen[sn]=true;var found=matches.filter(function(m){return m.type==='service'&&(m.serial===sn||m.equipmentId===String(e.id));})[0];if(found){existing.push(found.id);return;}pending.push({entry:e,serial:sn});});
      pending.slice(0,10).forEach(function(x){var r=JSON.parse(JSON.stringify(seed));r.branding=srReportBranding(r,null);r.fields.serial=x.serial;r.equipmentSource={id:String(x.entry.id),serial:x.serial};r.signature='';r.customerSignature='';delete r.number;delete r.signedAt;delete r.signedBy;var m={id:_uuid(),quoteId:String(ctx.q.id),jobId:String(ctx.job.id),equipmentId:String(x.entry.id),serial:x.serial,type:'service',date:r.fields.date,revision:1,status:'draft',published:false,createdBy:ctx.email,createdAt:new Date().toISOString(),updatedBy:ctx.email,updatedAt:new Date().toISOString()};srStore(m,r);created.push(m.id);});
      return {ok:true,created:created,existing:existing,remaining:Math.max(0,pending.length-10),skipped:skipped};
    }
    var meta=req.id?srGet('ServiceReportMeta_'+req.id):null;
    if(meta&&(meta.quoteId!==String(ctx.q.id)||meta.jobId!==String(ctx.job.id)))throw Error('Report does not belong to job');
    if(req.id&&!meta)throw Error('Report not found');
    if(req.op==='passwordSet'){if(!meta)throw Error('บันทึก Report ก่อนตั้งรหัสผ่าน');if(typeof req.password!=='string'||req.password.length<12||req.password.length>128)throw Error('ใช้รหัสผ่าน 12–128 ตัวอักษร');var salt=_uuid();srWrite('ServiceReportPassword_'+meta.id,{salt:salt,hash:srPasswordHash(req.password,salt),updatedBy:ctx.email,updatedAt:new Date().toISOString()});return {ok:true};}
    if(req.op==='get')return {ok:true,meta:meta,report:srRead(meta)};
    if(req.op==='publish'||req.op==='unpublish'){
      if(!meta||meta.status!=='signed')throw Error('ต้องเซ็นยืนยันรายงานก่อนเผยแพร่');
      if(req.revision!==meta.revision)throw Error('ข้อมูลเปลี่ยน กรุณาโหลดรายงานใหม่');
      if(req.op==='publish'&&!srWarranty(ctx,meta.serial))throw Error('ต้องเปิดให้ค้น Warranty ด้วย Serial นี้ในงานขายก่อน');
      if(req.op==='publish'){var days=Number(req.accessDays==null?7:req.accessDays);if(!Number.isInteger(days)||days<1||days>365)throw Error('กำหนดระยะเวลาเปิด Web 1–365 วัน');if(req.password!=null){if(typeof req.password!=='string'||req.password.length<12||req.password.length>128)throw Error('ใช้รหัสผ่าน 12–128 ตัวอักษร');var publishSalt=_uuid();srWrite('ServiceReportPassword_'+meta.id,{salt:publishSalt,hash:srPasswordHash(req.password,publishSalt),updatedBy:ctx.email,updatedAt:new Date().toISOString()});}if(!srGet('ServiceReportPassword_'+meta.id))throw Error('ตั้งรหัสผ่านลูกค้าก่อนเผยแพร่รายงาน');meta.expiresAt=new Date(Date.now()+days*86400000).toISOString();meta.accessDays=days;}
      meta.published=req.op==='publish';meta.publishedAt=new Date().toISOString();meta.publishedBy=ctx.email;srWrite('ServiceReportMeta_'+meta.id,meta);return {ok:true,meta:meta};
    }
    if(['save','sign'].indexOf(req.op)<0)throw Error('Unknown report operation');
    if(meta&&meta.status==='signed')throw Error('ฉบับเซ็นแล้วแก้ทับไม่ได้ กรุณาสร้างรายงานฉบับแก้ไข');
    if(meta&&req.revision!==meta.revision)throw Error('รายงานถูกแก้จากอีกหน้าจอ กรุณาเปิดใหม่');
    if(req.parentId){var parent=srGet('ServiceReportMeta_'+req.parentId);if(!parent||parent.status!=='signed'||parent.quoteId!==String(ctx.q.id)||parent.jobId!==String(ctx.job.id))throw Error('Invalid report revision source');}
    var data=JSON.parse(JSON.stringify(req.report||{}));data.branding=srReportBranding(data,meta);srValidate(data,req.op==='sign');delete data.signedAt;delete data.number;delete data.signedBy;data.fields.serial=srSerial(data.fields.serial);
    meta=meta||{id:_uuid(),quoteId:String(ctx.q.id),jobId:String(ctx.job.id),revision:0,createdBy:ctx.email,createdAt:new Date().toISOString(),parentId:req.parentId||''};meta.revision++;meta.type=data.type;meta.equipmentId=data.equipmentSource?String(data.equipmentSource.id||''):'';meta.serial=data.fields.serial;meta.date=data.fields.date;meta.updatedBy=ctx.email;meta.updatedAt=new Date().toISOString();meta.status=req.op==='sign'?'signed':'draft';meta.published=false;
    if(req.op==='sign'){var props=PropertiesService.getScriptProperties(),year=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy'),key='SERVICE_REPORT_SEQUENCE_'+year,n=Number(props.getProperty(key)||0)+1;if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid report sequence');props.setProperty(key,String(n));data.number='DN-SR-'+year+'-'+String(n).padStart(5,'0');data.signedAt=new Date().toISOString();data.signedBy=ctx.email;data.fields.engineer=req._actor.name||ctx.job.techName||ctx.email;meta.number=data.number;meta.signedAt=data.signedAt;meta.signedBy=ctx.email;}
    var source=data.equipmentSource,changed=false;
    if(source&&source.id){var entry=(ctx.ds.expiries||[]).filter(function(e){return String(e.id)===String(source.id);})[0];if(!entry)throw Error('รายการ Serial ใน SalePro ถูกลบแล้ว กรุณาเลือกใหม่');var before=srSerial(entry.serial),expected=srSerial(source.serial);if(before!==expected&&before!==data.fields.serial)throw Error('Serial ใน SalePro ถูกแก้จากอีกหน้าจอ กรุณาเปิดรายงานใหม่');if(before!==data.fields.serial){if(!ServicePlan.validSerial(data.fields.serial))throw Error('ระบุ Serial Number ที่ถูกต้องก่อนอัปเดต SalePro');entry.serial=data.fields.serial;ctx.ds.notes=ctx.ds.notes||[];ctx.ds.notes.push({id:_uuid(),type:'tech',user:req._actor.name||ctx.email,ts:new Date().toISOString(),text:'Report หน้างาน: แก้ Serial Number ['+(entry.name||'')+'] จาก '+(before||'(ว่าง)')+' → '+data.fields.serial+' โดย '+ctx.email,reportId:meta.id,oldSerial:before,newSerial:data.fields.serial});changed=true;}source.serial=data.fields.serial;}
    srStore(meta,data);if(changed)srWrite('DealStatus_'+ctx.q.id,ctx.ds);return {ok:true,meta:meta,report:data};
  }finally{lock.releaseLock();}
}
function srConfig(){var c=srGet('ServiceReportConfig')||{};return c.blob?srRead(c.meta):c;}
function srPublicActive(m){return m&&m.published===true&&m.status==='signed'&&typeof m.expiresAt==='string'&&isFinite(Date.parse(m.expiresAt))&&Date.parse(m.expiresAt)>Date.now();}
function publicServiceReports(serial,quoteId){return srRows().filter(function(r){return /^ServiceReportMeta_/.test(r.Title||'');}).map(function(r){return JSON.parse(r.Value);}).filter(function(m){return srPublicActive(m)&&m.serial===serial&&m.quoteId===String(quoteId);}).map(function(m){return {id:m.id,number:m.number,type:m.type,date:m.date};});}
function lookupPublicServiceReport(req){authorizeWarrantyLookup(req);if(!/^[\w-]{1,80}$/.test(req.reportId||''))return {ok:true,found:false};var serial=srSerial(req.serial),meta=srGet('ServiceReportMeta_'+req.reportId);if(!srPublicActive(meta)||meta.serial!==serial)return {ok:true,found:false};var warranty=lookupPublicWarranty(req);if(!warranty.found||!(warranty.reports||[]).some(function(r){return r.id===meta.id;}))return {ok:true,found:false};if(!srPasswordMatches(req.password,srGet('ServiceReportPassword_'+meta.id)))return {ok:true,found:false,passwordRequired:true};if(req.intent==='withdraw'){var lock=LockService.getScriptLock();lock.waitLock(30000);try{meta=srGet('ServiceReportMeta_'+req.reportId);if(!srPublicActive(meta)||meta.serial!==serial||!srPasswordMatches(req.password,srGet('ServiceReportPassword_'+meta.id)))return {ok:true,found:false};meta.published=false;meta.withdrawnAt=new Date().toISOString();meta.withdrawnBy='customer';srWrite('ServiceReportMeta_'+meta.id,meta);return {ok:true,found:false,withdrawn:true};}finally{lock.releaseLock();}}return {ok:true,found:true,accessGranted:true,expiresAt:meta.expiresAt,report:srPublicCopy(srRead(meta))};}
function srProtectGeneric(req){
  if(req.list!=='Settings'||['create','add','update','batchCreate','delete','deleteWhere'].indexOf(req.action)<0)return;
  var protectedKey=function(k){return /^ServiceReport/.test(String(k||''));};
  if(['create','add'].indexOf(req.action)>=0&&protectedKey((req.fields||req.data||{}).Title))throw Error('Use serviceReport operation');
  if(req.action==='batchCreate'&&(req.rows||[]).some(function(r){return protectedKey(r.Title);}))throw Error('Use serviceReport operation');
  if(['update','delete'].indexOf(req.action)>=0){var row=srRows().filter(function(r){return String(r.id)===String(req.id);})[0];if(row&&protectedKey(row.Title)||protectedKey((req.fields||req.data||{}).Title))throw Error('รายงานต้องแก้ผ่านระบบ Report เท่านั้น');}
  if(req.action==='deleteWhere'&&srRows().some(function(r){return protectedKey(r.Title)&&String(r[req.field])===String(req.value);}))throw Error('Cannot delete report records');
}

// Advance retail receipt printing is separate from issued tax documents.
function retailApprovalWrite(record){
  var sh=_sheet('RetailReceiptApprovals'),hdr=_ensureCols(sh,[ID_COL].concat(Object.keys(record))),idx=_findRowIndex(sh,record.id);
  if(idx<0)idx=sh.getLastRow()+1;
  var range=sh.getRange(idx,1,1,hdr.length);range.setNumberFormat('@');range.setValues([hdr.map(function(key){return String(record[key]||'');})]);
}
function retailApprovalSnapshot(q,company){
  var lines=listRows('QuoteItems').filter(function(it){return String(it.QuoteID)===String(q.id)&&String(it.Title||'').indexOf('__')!==0;}),round=function(n){return Math.round((n+Number.EPSILON)*100)/100;};
  var sub=0;
  if(!lines.length)throw Error('ไม่พบรายการขาย');
  lines.forEach(function(it){var qty=Number(it.Quantity),price=Number(it.UnitPrice),disc=Number(it.DiscountPct||0);if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0||!Number.isFinite(disc)||disc<0||disc>100)throw Error('ตรวจจำนวน ราคา และส่วนลด');sub+=qty*price*(1-disc/100);});
  var pct=Number(q.DiscountPct||0);if(!Number.isFinite(pct)||pct<0||pct>100)throw Error('ส่วนลดไม่ถูกต้อง');
  sub=round(sub);var discount=round(sub*pct/100),after=round(sub-discount),base=q.PricingMode==='inclusive'?round(after/1.07):after,vat=q.PricingMode==='inclusive'?round(after-base):round(base*0.07),gross=round(base+vat);
  if(!Number.isFinite(Number(q.TotalAmount))||gross<=0||Math.abs(gross-Number(q.TotalAmount))>0.02)throw Error('ยอดใบเสนอราคาไม่ตรง กรุณาโหลดใหม่');
  return JSON.stringify({quote:{Title:q.Title,ClientName:q.ClientName,PricingMode:q.PricingMode},company:company,totals:{subtotal:sub,discount:discount,base:base,vat:vat,gross:gross,lines:lines}});
}
function retailReceiptApproval(req){
  var email=String(req._actor&&req._actor.email||'').trim().toLowerCase();if(!email)throw Error('เข้าสู่ระบบก่อน');
  var records=listRows('RetailReceiptApprovals');
  if(req.op==='pending'){var issued=listRows('SalesTaxInvoices');return {ok:true,items:records.filter(function(r){return !issued.some(function(i){return String(i.QuoteID)===String(r.QuoteID);})&&['pending','approved'].indexOf(r.Status)>=0&&(String(r.ApproverEmail).trim().toLowerCase()===email||String(r.RequestedBy).trim().toLowerCase()===email||email==='admin@dongroups.com');})};}
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    records=listRows('RetailReceiptApprovals');
    var q=listRows('Quotations').find(function(r){return String(r.id)===String(req.quoteId);});
    if(!q||q.Status==='Cancelled')throw Error('ไม่พบงานหรือถูกยกเลิกแล้ว');
    var owner=email==='admin@dongroups.com'||email===String(q.SaleEmail||'').trim().toLowerCase();
    var record=records.find(function(r){return String(r.QuoteID)===String(q.id);});
    if(req.op==='get'){if(!owner&&email!==String(q.ApproverEmail||'').trim().toLowerCase())throw Error('ไม่มีสิทธิ');return {ok:true,item:record||null};}
    if(listRows('SalesTaxInvoices').some(function(r){return String(r.QuoteID)===String(q.id);}))throw Error('งานนี้ออกใบกำกับภาษีแล้ว กรุณาเปิดเอกสารเดิม');
    var now=new Date().toISOString();
    if(req.op==='request'){
      if(!owner)throw Error('เฉพาะเจ้าของงานหรือ Admin');
      if(record&&['pending','approved'].indexOf(record.Status)>=0){if(record.Status==='pending'&&['accepted','sending'].indexOf(record.EmailStatus)<0)retailApprovalNotify(record);return {ok:true,item:record};}
      if(!q.ApproverEmail)throw Error('ระบุผู้อนุมัติในใบเสนอราคาก่อน');
      if(!req.eligible)throw Error('ยืนยันว่าเข้าเกณฑ์ออกเอกสารอย่างย่อ');
      var company={},input=req.company||{};['CompanyName','Address','TaxID','Phone','Branch','FooterText'].forEach(function(k){company[k]=String(input[k]||'').slice(0,2000);});
      if(!company.CompanyName||!company.Address||!/^\d{13}$/.test(company.TaxID.replace(/\D/g,'')))throw Error('ข้อมูลบริษัทไม่ครบ');
      var snapshot=retailApprovalSnapshot(q,company);if(snapshot.length>45000)throw Error('รายการยาวเกินไป');
      record={id:record?record.id:_uuid(),QuoteID:q.id,Title:'AR-'+q.Title,Status:'pending',ApproverEmail:String(q.ApproverEmail).trim().toLowerCase(),Snapshot:snapshot,RequestedBy:email,RequestedAt:now,History:JSON.stringify(JSON.parse(record&&record.History||'[]').concat([{action:'requested',by:email,at:now}]))};
    }else{
      if(!record||String(req.revision)!==String(record.UpdatedAt))throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่');
      if(req.op==='notify'){if(!owner||record.Status!=='pending')throw Error('เฉพาะเจ้าของงานหรือ Admin ส่งแจ้งเตือนคำขอที่รออนุมัติได้');retailApprovalNotify(record);return {ok:true,item:record};}
      var history=JSON.parse(record.History||'[]');
      if(req.op==='withdraw'){
        if(!owner)throw Error('เฉพาะเจ้าของงานหรือ Admin');record.Status='rejected';
      }else if(req.op==='approve'||req.op==='reject'){
        if(record.Status!=='pending'||(email!==String(record.ApproverEmail).trim().toLowerCase()&&email!=='admin@dongroups.com'))throw Error('เฉพาะผู้อนุมัติที่กำหนดหรือ Admin');
        var old=JSON.parse(record.Snapshot),fresh=JSON.parse(retailApprovalSnapshot(q,old.company));
        if(req.op==='approve'&&JSON.stringify(old)!==JSON.stringify(fresh))throw Error('รายละเอียดงานเปลี่ยน ต้องส่งขออนุมัติใหม่');
        record.Status=req.op==='approve'?'approved':'rejected';record.DecidedBy=email;record.DecidedAt=now;
      }else if(req.op==='print'){
        if((!owner&&email!==String(record.ApproverEmail).trim().toLowerCase())||record.Status!=='approved')throw Error('ต้องได้รับอนุมัติก่อนพิมพ์');
        var old=JSON.parse(record.Snapshot),fresh=JSON.parse(retailApprovalSnapshot(q,old.company));
        if(JSON.stringify(old)!==JSON.stringify(fresh))throw Error('รายละเอียดงานเปลี่ยน ต้องขออนุมัติใหม่');
      }else throw Error('ขั้นตอนไม่ถูกต้อง');
      history.push({action:req.op,by:email,at:now});record.History=JSON.stringify(history);
    }
    record.UpdatedAt=now;retailApprovalWrite(record);if(req.op==='request')retailApprovalNotify(record);return {ok:true,item:record};
  }finally{lock.releaseLock();}
}

function retailApprovalNotify(record){
  var snapshot=JSON.parse(record.Snapshot),history=JSON.parse(record.History||'[]');
  var now=new Date().toISOString();
  record.EmailStatus='sending';record.EmailError='';record.EmailAttemptAt=now;record.UpdatedAt=now;
  retailApprovalWrite(record);
  try{
    var body='มีคำขออนุมัติพิมพ์ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อแบบเว้นวันที่\n\n'
      +'เอกสาร: '+record.Title+'\nใบเสนอราคา: '+snapshot.quote.Title+'\nลูกค้า: '+snapshot.quote.ClientName
      +'\nยอดรวม VAT: '+Number(snapshot.totals.gross).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' บาท'
      +'\nผู้ขอ: '+record.RequestedBy+'\n\nกรุณาเข้าสู่ SalePro > หน้าอนุมัติ > ขอพิมพ์ใบเสร็จอย่างย่อเว้นวันที่ เพื่อตรวจเอกสารและอนุมัติหรือปฏิเสธ'
      +'\nhttps://darmmunginsa.github.io/D-ON-NET/salepro/\n\nคำขอนี้ยังไม่ใช่การรับชำระหรือบันทึก VAT จากเอกสาร';
    sendEmail({textOnly:true,to:record.ApproverEmail,replyTo:record.RequestedBy,subject:'[SalePro] ขออนุมัติพิมพ์เว้นวันที่ '+record.Title,body:body});
    record.EmailStatus='accepted';record.EmailAcceptedAt=new Date().toISOString();
    history.push({action:'emailAccepted',by:record.ApproverEmail,at:record.EmailAcceptedAt});
  }catch(error){
    record.EmailStatus='failed';record.EmailError=String(error.message||error).slice(0,1000);
    history.push({action:'emailFailed',by:record.ApproverEmail,at:new Date().toISOString()});
  }
  record.History=JSON.stringify(history);record.UpdatedAt=new Date().toISOString();retailApprovalWrite(record);
}
