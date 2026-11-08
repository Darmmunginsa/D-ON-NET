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
