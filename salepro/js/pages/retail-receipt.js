function retailReceiptTotals(quote,items){
  const round=value=>Math.round((value+Number.EPSILON)*100)/100;
  const lines=items.filter(item=>!String(item.Title||'').startsWith('__'));
  if(!lines.length)throw Error('ไม่พบรายการขาย');
  if(!Number.isFinite(Number(quote.DiscountPct||0))||Number(quote.DiscountPct||0)<0||Number(quote.DiscountPct||0)>100)throw Error('ส่วนลดไม่ถูกต้อง');
  for(const item of lines){
    if(![item.Quantity,item.UnitPrice,item.DiscountPct||0].every(value=>Number.isFinite(Number(value)))||!(Number(item.Quantity)>0)||Number(item.UnitPrice)<0||Number(item.DiscountPct||0)<0||Number(item.DiscountPct||0)>100)throw Error('ตรวจจำนวน ราคา และส่วนลดในรายการ');
  }
  const subtotal=round(lines.reduce((sum,item)=>sum+Number(item.Quantity||0)*Number(item.UnitPrice||0)*(1-Number(item.DiscountPct||0)/100),0));
  const discount=round(subtotal*Number(quote.DiscountPct||0)/100);
  const after=round(subtotal-discount);
  const inclusive=quote.PricingMode==='inclusive';
  const base=inclusive?round(after/1.07):after;
  const vat=inclusive?round(after-base):round(base*0.07);
  const gross=inclusive?after:round(base+vat);
  if(!(gross>0)||Math.abs(gross-Number(quote.TotalAmount))>0.02)throw Error('ยอดรายการไม่ตรงกับใบเสนอราคา กรุณาตรวจต้นฉบับ');
  return {subtotal,discount,base,vat,gross,lines};
}

function buildRetailReceiptHTML(invoice,copy='customer',advance=false,review=false){
  const snapshot=JSON.parse(invoice.Snapshot);
  const {quote,company,totals}=snapshot;
  // Older receipt snapshots predate logo support; use the saved company settings.
  const branding=typeof companySettings==='object'&&companySettings?companySettings:{};
  const logo=[company.LogoBase64,company.LogoURL,branding.LogoBase64,branding.LogoURL].find(value=>typeof value==='string'&&(/^[Hh][Tt][Tt][Pp][Ss]:\/\//.test(value)||/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)))||'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>Number(value).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const customer=typeof quotesData!=='undefined'?quotesData.find(row=>String(row.id)===String(invoice.QuoteID))||{}:{};
  const date=advance?'____ / ____ / ______':String(invoice.DocumentDate||'').split('-').reverse().join('/');
  const rows='<tr><td class="center">1</td><td>รับชำระตามใบเสนอราคา '+esc(quote.Title)+'</td><td class="num">'+money(totals.gross)+'</td></tr>'
    +Array.from({length:11},()=>'<tr class="empty"><td>&nbsp;</td><td></td><td></td></tr>').join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสร็จรับเงิน ${esc(invoice.Title)}</title>
  <style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0 auto;padding:16px;max-width:820px;color:#172b42;font:13px/1.5 Tahoma,"Leelawadee UI",sans-serif}
    header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.brand{display:flex;gap:18px;align-items:center;max-width:80%}
    .company-logo{display:block;max-width:190px;max-height:72px;width:auto;height:auto;object-fit:contain}h1{font-size:21px;margin:0 0 4px}p{margin:3px 0}.small{font-size:11px}
    .copy{border:1px solid #69517f;border-radius:3px;padding:5px 12px;white-space:nowrap;font-size:11px}
    h2{border:2px solid #69517f;border-radius:5px;width:180px;margin:22px auto;text-align:center;font-size:19px;line-height:1.4;padding:5px}h2 small{display:block;font-size:12px;font-weight:400}
    .meta{display:flex;justify-content:space-between;gap:24px;margin:16px 0}.customer{flex:1}.under{display:inline-block;min-width:160px;border-bottom:1px dotted #b3bbc5;padding:2px 6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group;background:#68517e;color:white}th,td{border:1px solid #8d96a3;padding:6px 8px}th{font-weight:500;text-align:center}tr{break-inside:avoid}.empty td{height:23px;padding:0 8px}.center{text-align:center}.num{text-align:right;white-space:nowrap}
    .total{display:flex;border:1px solid #606b78;border-top:0;align-items:stretch;break-inside:avoid}.words{padding:10px;flex:1;border-right:1px solid #606b78;font-size:12px}.amount{padding:8px 12px;min-width:220px;display:flex;justify-content:space-between;align-items:center}.amount strong{font-size:18px}
    .payment{padding:17px 12px;line-height:2}.note{text-align:center;font-size:10px;margin:12px 0}.signatures{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #606b78;break-inside:avoid}.signatures>div{padding:18px 12px 12px;min-height:105px;border-right:1px solid #606b78}.signatures>div:last-child{border:0}.line{margin-top:16px;border-bottom:1px dotted #b3bbc5}.review{border:2px solid #be123c;color:#be123c;padding:10px}
    @media print{body{padding:0;max-width:none}.total,.payment,.signatures{break-inside:avoid}}
  </style></head><body>
  <header><div class="brand">${logo?'<img class="company-logo" src="'+esc(logo)+'" alt="โลโก้บริษัท">':''}<div><h1>${esc(company.CompanyName)}</h1>${company.CompanyNameEn?'<p>'+esc(company.CompanyNameEn)+'</p>':''}<p class="small">${esc(company.Address)}</p><p class="small">โทร. ${esc(company.Phone)} · เลขประจำตัวผู้เสียภาษี ${esc(company.TaxID)}</p><p class="small">${esc(company.Branch||'สำนักงานใหญ่')}</p></div></div><div class="copy">${copy==='company'?'สำเนาบริษัท':'ต้นฉบับลูกค้า'}</div></header>
  <h2>ใบเสร็จรับเงิน<small>RECEIPT</small></h2>
  ${review?'<p class="review">ฉบับตรวจสอบ — ยังไม่อนุมัติให้ใช้รับเงิน</p>':''}
  <div class="meta"><div class="customer"><p>นามลูกค้า <span class="under">${esc(quote.ClientName)}</span></p><p>ที่อยู่ <span class="under">${esc(quote.CustomerAddress||quote.ClientAddress||customer.CustomerAddress||'')}</span></p><p>เลขประจำตัวผู้เสียภาษี <span class="under">${esc(quote.CustomerTaxID||quote.ClientTaxID||customer.CustomerTaxID||'')}</span></p></div><div><p>เลขที่ <span class="under">${esc(invoice.Title)}</span></p><p>วันที่ <span class="under">${esc(date)}</span></p></div></div>
  <table><colgroup><col style="width:9%"><col style="width:66%"><col style="width:25%"></colgroup><thead><tr><th>ลำดับ</th><th>รายการ / เอกสารอ้างอิง</th><th>จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="total"><div class="words">ตัวอักษร: ${esc(bahtText(totals.gross))}</div><div class="amount"><span>รวมเงิน<br><small>TOTAL</small></span><strong>${money(totals.gross)}</strong></div></div>
  <div class="payment">□ เงินสด &nbsp; __________________ บาท<br>□ เงินโอน &nbsp; __________________ บาท<br>□ เช็คธนาคาร __________________ เลขที่ __________________<br>ลงวันที่ __________________ จำนวนเงิน __________________ บาท</div>
  <p class="note">กรณีชำระด้วยเช็ค ใบเสร็จรับเงินจะสมบูรณ์เมื่อบริษัทฯ ได้รับเงินแล้วเท่านั้น</p>
  <div class="signatures"><div>ผู้รับเงิน<div class="line"></div><p>ลงวันที่ __________________</p></div><div>ผู้รับใบเสร็จ<div class="line"></div><p>ลงวันที่ __________________</p></div><div>ในนาม ${esc(company.CompanyName)}<div class="line"></div><p class="center">ผู้มีอำนาจลงนาม</p></div></div>
  </body></html>`;
}

let retailReceiptBusy=false;
async function issueRetailReceipt(){
  if(retailReceiptBusy)return;
  const quote=quotesData.find(row=>String(row.id)===String(stQuoteId));
  if(!quote||!canManageSaleActions(quote))return toast('ไม่มีสิทธิออกเอกสารรายการนี้','error');
  if(quote.Status==='Cancelled')return toast('ใบเสนอราคานี้ถูกยกเลิกแล้ว','error');
  if(!document.getElementById('cpo-retail-eligible').checked)return toast('ยืนยันว่ารายการเข้าเกณฑ์ออกใบกำกับภาษีอย่างย่อก่อน','error');
  const date=document.getElementById('cpo-retail-date').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast('ระบุวันที่เอกสารและวันที่เกิดภาษี','error');
  const status=document.getElementById('cpo-retail-status');
  const quoteId=quote.id;
  retailReceiptBusy=true;
  try{
    status.textContent='กำลังตรวจข้อมูลใบเสร็จและใบกำกับ…';
    const invoices=await getListItems('SalesTaxInvoices');
    const existing=invoices.filter(row=>String(row.QuoteID)===String(quoteId));
    const issued=existing.find(row=>row.DocumentType==='abbreviated'&&row.Snapshot);
    if(issued){printViaIframe(buildRetailReceiptHTML(issued,document.getElementById('cpo-copy')?.value==='company'?'company':'customer'));status.textContent='เปิดเอกสารเดิม '+issued.Title;return;}
    if(existing.length)throw Error('งานนี้มีใบกำกับภาษีแล้ว กรุณาตรวจเอกสารเดิมก่อนออกเพิ่ม');
    const approvalResult=await _call({action:'retailReceiptApproval',op:'get',quoteId});
    const approval=approvalResult.item;
    if(approval&&approval.Status!=='approved')throw Error('คำขอพิมพ์ล่วงหน้ายังไม่อนุมัติ');
    const payments=await getListItems(CONFIG.lists.payments);
    const paid=Math.round(payments.filter(row=>String(row.QuoteID)===String(quoteId)).reduce((sum,row)=>sum+Number(row.AmountPaid||0),0)*100)/100;
    if(paid<Number(quote.TotalAmount)-0.01)throw Error('ใบเสร็จอย่างย่อฉบับนี้ใช้สำหรับรับชำระครบยอด กรุณาบันทึกรับเงินให้ครบก่อน');
    const items=(await getListItems(CONFIG.lists.quoteItems)).filter(row=>String(row.QuoteID)===String(quoteId));
    const totals=retailReceiptTotals(quote,items);
    const company=Object.fromEntries(['CompanyName','Address','TaxID','Phone','Branch','FooterText'].map(key=>[key,companySettings[key]||'']));
    if(!company.CompanyName||!company.Address||!/^\d{13}$/.test(String(company.TaxID||'').replace(/\D/g,'')))throw Error('ระบุชื่อ ที่อยู่ และเลขผู้เสียภาษีบริษัทในตั้งค่าก่อน');
    const invoice={
      Title:'AR-'+String(quote.Title||quoteId),QuoteID:quoteId,DocumentType:'abbreviated',
      DocumentDate:date,TaxDate:date,BaseAmount:totals.base,VatAmount:totals.vat,GrossAmount:totals.gross,
      IssuedBy:currentUser.email,Snapshot:JSON.stringify({quote:{Title:quote.Title,ClientName:quote.ClientName,PricingMode:quote.PricingMode},company,totals}),
    };
    if(approval){
      const file=document.getElementById('cpo-retail-signed').files[0];
      if(!file||file.size>5*1024*1024||!(/^image\//.test(file.type)||file.type==='application/pdf'))throw Error('แนบรูปหรือ PDF ที่เขียนวันที่จริงแล้ว ขนาดไม่เกิน 5 MB');
      const original=JSON.parse(approval.Snapshot);
      if(Math.abs(original.totals.gross-totals.gross)>0.01)throw Error('รายการเปลี่ยนจากที่อนุมัติ กรุณาขออนุมัติใหม่');
      invoice.Title=approval.Title;invoice.ApprovalID=approval.id;invoice.Snapshot=approval.Snapshot;
      const uploaded=await _call({action:'uploadFile',folder:'SalesTaxInvoices',fileName:file.name,mimeType:file.type,base64:(await fileToBase64(file)).split(',')[1],privateFile:true});
      if(!uploaded.fileUrl)throw Error('แนบเอกสารไม่สำเร็จ');invoice.DocURL=uploaded.fileUrl;
    }
    const saved=await createListItem('SalesTaxInvoices',invoice);
    status.textContent='ออกเอกสาร '+invoice.Title+' และบันทึก VAT แล้ว';
    printViaIframe(buildRetailReceiptHTML({...invoice,...saved},document.getElementById('cpo-copy')?.value==='company'?'company':'customer'));
    if(String(stQuoteId)===String(quoteId))await loadSTTaxInvoices(quoteId);
  }catch(error){status.textContent=error.message;toast(error.message,'error');}
  finally{retailReceiptBusy=false;}
}

let retailAdvanceRecord=null;
async function loadRetailAdvance(){
  const quoteId=stQuoteId,el=document.getElementById('cpo-retail-advance');if(!el)return;
  el.textContent='กำลังโหลดสถานะเอกสารล่วงหน้า…';
  try{const result=await _call({action:'retailReceiptApproval',op:'get',quoteId});if(String(stQuoteId)!==String(quoteId))return;
    retailAdvanceRecord=result.item;const r=result.item;
    if(r){const section=document.getElementById('cpo-retail-section');if(section)section.open=true;}
    const labels={pending:'รออนุมัติ',approved:'อนุมัติให้พิมพ์แล้ว',rejected:'ไม่อนุมัติ / ยกเลิกคำขอ'};
    el.textContent=r?(labels[r.Status]||r.Status)+' · '+r.Title+' · ผู้อนุมัติ '+r.ApproverEmail:'ยังไม่มีคำขอพิมพ์ล่วงหน้า';
    if(r?.Status==='pending'){const mail=document.createElement('div');mail.textContent=retailApprovalEmailMessage(r);el.append(mail);const retry=document.createElement('button');retry.className='btn btn-sm';retry.textContent='ส่งอีเมลแจ้งอีกครั้ง';retry.onclick=()=>retailAdvanceAction('notify');el.append(retry);}
    if(r){for(const entry of JSON.parse(r.History||'[]')){const line=document.createElement('small');line.style.display='block';line.textContent=({requested:'ส่งขออนุมัติ',approve:'อนุมัติ',reject:'ไม่อนุมัติ',print:'สั่งพิมพ์',withdraw:'ยกเลิกคำขอ',emailAccepted:'ระบบรับคำขอส่งอีเมลแล้ว',emailFailed:'ส่งอีเมลไม่สำเร็จ'}[entry.action]||entry.action)+' · '+entry.by+' · '+new Date(entry.at).toLocaleString('th-TH');el.append(line);}}
    document.getElementById('cpo-retail-print').disabled=!r||r.Status!=='approved';
  }catch(error){el.textContent=error.message;}
}
async function retailAdvanceAction(op,quoteId=stQuoteId,revision,copy){
  if(retailReceiptBusy)return;retailReceiptBusy=true;
  try{
    const req={action:'retailReceiptApproval',op,quoteId,revision:revision||retailAdvanceRecord?.UpdatedAt};
    if(op==='request'){req.eligible=document.getElementById('cpo-retail-eligible').checked;req.company=Object.fromEntries(['CompanyName','Address','TaxID','Phone','Branch','FooterText'].map(k=>[k,companySettings[k]||'']));}
    const result=await _call(req);
    if(op==='print')printViaIframe(buildRetailReceiptHTML({...result.item,DocumentDate:''},(copy||document.getElementById('cpo-copy')?.value)==='company'?'company':'customer',true));
    if(op==='request'||op==='notify')toast('คำขอ'+(result.item.Status==='approved'?'อนุมัติแล้ว':': '+retailApprovalEmailMessage(result.item)),result.item.EmailStatus==='failed'?'warning':'success');
    else toast(op==='print'?'บันทึกประวัติการพิมพ์แล้ว':'บันทึกผลแล้ว','success');
    if(String(quoteId)===String(stQuoteId))await loadRetailAdvance();
    if(typeof renderRetailApprovals==='function')await renderRetailApprovals();
  }catch(error){toast(error.message,'error');}finally{retailReceiptBusy=false;}
}
let retailApprovalPendingCount=0;
let retailApprovalLoadGeneration=0;
async function renderRetailApprovals(){
  const box=document.getElementById('retail-approval-list');if(!box)return;
  const generation=++retailApprovalLoadGeneration,account=String(currentUser?.email||'').trim().toLowerCase();
  box.textContent='กำลังโหลดคำขอพิมพ์เอกสารล่วงหน้า…';
  try{
    const result=await _call({action:'retailReceiptApproval',op:'pending'});
    if(generation!==retailApprovalLoadGeneration||account!==String(currentUser?.email||'').trim().toLowerCase())return;
    const records=result.items||[];retailApprovalPendingCount=records.filter(r=>r.Status==='pending').length;
    if(typeof updateBadge==='function')updateBadge();
    box.replaceChildren();
    const summary=document.getElementById('retail-dashboard-approvals');
    if(summary){summary.replaceChildren();const text=document.createElement('p');text.textContent='ใบเสร็จอย่างย่อ · รออนุมัติ '+retailApprovalPendingCount+' รายการ · อนุมัติให้พิมพ์แล้ว '+records.filter(r=>r.Status==='approved').length+' รายการ';summary.append(text);const button=document.createElement('button');button.className='btn btn-sm';button.textContent='ตรวจคำขอ / พิมพ์เอกสาร';button.onclick=()=>showPage('approve');summary.append(button);}
    if(!records.length){box.textContent='ไม่มีคำขอพิมพ์ล่วงหน้าที่เกี่ยวข้องกับบัญชีนี้';return;}
    for(const record of records){
      const card=document.createElement('div');card.className='card';card.style.padding='16px';card.style.marginBottom='10px';
      const snapshot=JSON.parse(record.Snapshot),title=document.createElement('p');title.textContent=(record.Status==='approved'?'✓ อนุมัติให้พิมพ์แล้ว':'รออนุมัติ')+' · '+record.Title+' · '+snapshot.quote.ClientName+' · '+Number(snapshot.totals.gross).toLocaleString('th-TH')+' บาท';card.append(title);
      const recipient=document.createElement('p');recipient.textContent='ผู้อนุมัติ: '+record.ApproverEmail;card.append(recipient);
      const mayDecide=account===String(record.ApproverEmail||'').trim().toLowerCase()||account==='admin@dongroups.com';
      const actions=record.Status==='approved'?[['พิมพ์เว้นวันที่','print']]:[['ตรวจเอกสาร','preview'],...(mayDecide?[['อนุมัติ','approve'],['ไม่อนุมัติ','reject']]:[])];
      const copySelect=document.createElement('select');copySelect.setAttribute('aria-label','สำเนาที่ต้องการพิมพ์');for(const [value,label] of [['customer','ต้นฉบับลูกค้า'],['company','สำเนาบริษัท']]){const option=document.createElement('option');option.value=value;option.textContent=label;copySelect.append(option);}if(record.Status==='approved')card.append(copySelect);
      for(const [label,action] of actions){const button=document.createElement('button');button.className='btn btn-sm'+(action==='print'?' btn-primary':'');button.textContent=label;
        button.onclick=()=>action==='preview'?printViaIframe(buildRetailReceiptHTML({...record,DocumentDate:''},'company',true,true)):retailAdvanceAction(action,record.QuoteID,record.UpdatedAt,copySelect.value||'customer');card.append(button);}
      if(record.Status==='approved'){const hint=document.createElement('small');hint.style.display='block';hint.textContent='เลือกพิมพ์ได้ทันที หรือเปิดงานขาย > PO ลูกค้า > ใบเสร็จอย่างย่อ > พิมพ์เว้นวันที่';card.append(hint);}
      box.append(card);
    }
  }catch(error){
    if(generation!==retailApprovalLoadGeneration)return;
    box.textContent='โหลดคำขอพิมพ์ล่วงหน้าไม่สำเร็จ: '+error.message+' · กรุณาตรวจว่า Deploy Apps Script รุ่นล่าสุดแล้ว';
    const summary=document.getElementById('retail-dashboard-approvals');if(summary)summary.textContent=box.textContent;
  }
}

function retailApprovalEmailMessage(record){
  if(record.EmailStatus==='accepted')return 'ระบบรับคำขอส่งอีเมลถึง '+record.ApproverEmail+' แล้ว (ยังไม่ยืนยันการเข้ากล่องผู้รับ)';
  if(record.EmailStatus==='failed')return 'บันทึกคำขอแล้ว แต่อีเมลไม่สำเร็จ: '+(record.EmailError||'โปรดลองส่งอีกครั้ง');
  if(record.EmailStatus==='sending')return 'กำลังส่งอีเมล / ยังยืนยันผลไม่ได้ กรุณาโหลดสถานะ';
  return 'คำขอนี้ยังไม่ได้ส่งอีเมลแจ้งผู้อนุมัติ';
}
