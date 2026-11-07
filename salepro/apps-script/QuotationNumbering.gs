// createRow/updateRow/batchCreate already hold the script lock.
function prepareQuotationNumberFields(name,fields,existing){
  if(name!=='Quotations')return fields;
  fields=fields||{};existing=existing||{};
  var title=String(existing.Title||'').trim(),status=fields.Status||existing.Status;
  // Issued and legacy numbers remain stable, including a retry after a lost response.
  if(title){fields.Title=title;return fields;}
  fields.Title='';fields.NumberingMode='OnApproval';
  if(status!=='Approved')return fields;
  var month=Utilities.formatDate(new Date(),'Asia/Bangkok','MM'),year=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy');
  var props=PropertiesService.getScriptProperties(),key='QUOTATION_SEQUENCE_'+year+'_'+month,last=Number(props.getProperty(key)||0);
  listRows('Quotations').forEach(function(q){var m=String(q.Title||'').match(/(\d+)-(\d{2})-(\d{4})(?:-RV\d+)?$/);if(m&&m[2]===month&&m[3]===year)last=Math.max(last,Number(m[1]));});
  if(!Number.isSafeInteger(last)||last<0)throw Error('Invalid quotation sequence');
  var parts=String(fields.SaleName||existing.SaleName||'').trim().split(/\s+/).filter(Boolean),prefix=parts.length>1?parts[0][0]+parts[1][0]:parts.length?parts[0].slice(0,2):'QT';
  var next=last+1;props.setProperty(key,String(next));
  fields.Title=prefix.toUpperCase()+String(next).padStart(2,'0')+'-'+month+'-'+year;
  fields.QuotationIssuedAt=new Date().toISOString();return fields;
}
