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
