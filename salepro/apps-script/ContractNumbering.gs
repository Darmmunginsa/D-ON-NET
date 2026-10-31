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
