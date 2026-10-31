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
