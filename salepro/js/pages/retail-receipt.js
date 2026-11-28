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
  return {subtotal,discount,base,vat,gross,lines,documentNotes:items.filter(it=>it.Title==='__NOTE__').map(it=>String(it.Description||''))};
}

// Allocate the stored final total across product lines, preserving exact cents.
function retailReceiptLineAmounts(totals){
  const lines=totals.lines||[],gross=Math.round(Number(totals.gross)*100);
  const weights=lines.map(it=>Number(it.Quantity)*Number(it.UnitPrice)*(1-Number(it.DiscountPct||0)/100));
  const sum=weights.reduce((n,v)=>n+v,0);
  if(!lines.length||!Number.isSafeInteger(gross)||gross<=0||!Number.isFinite(sum)||sum<=0||weights.some(v=>!Number.isFinite(v)||v<0))throw Error('รายละเอียดรายการในใบเสร็จไม่ครบ กรุณาตรวจต้นฉบับ');
  const exact=weights.map(v=>v/sum*gross),cents=exact.map(Math.floor);
  const order=exact.map((v,i)=>({i,remainder:v-cents[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  let remaining=gross-cents.reduce((n,v)=>n+v,0);
  for(let i=0;i<remaining;i++)cents[order[i%order.length].i]++;
  return cents.map(v=>v/100);
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
  const receiptNote=String(quote.Note??customer.Note??'').trim();
  const insertedNotes=(totals.documentNotes||[]).filter(text=>String(text).trim());
  const noteRows=insertedNotes.map(text=>'<tr class="receipt-inserted-note"><td></td><td class="note-description" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5">'+esc(text)+'</td><td></td></tr>').join('');
  const lineAmounts=retailReceiptLineAmounts(totals);
  const productRows=totals.lines.map((item,index)=>'<tr class="receipt-product"><td class="center">'+(index+1)+'</td><td><div class="receipt-product-name">'+esc(item.Title||'')+'</div>'+(item.Description?'<div class="receipt-product-detail">'+esc(item.Description)+'</div>':'')+'<div class="receipt-product-quantity">จำนวน '+esc(Number(item.Quantity).toLocaleString('th-TH',{maximumFractionDigits:3}))+' '+esc(item.Unit||'')+'</div></td><td class="num">'+money(lineAmounts[index])+'</td></tr>').join('');
  const rows=productRows+noteRows+Array.from({length:Math.max(0,7-totals.lines.length-[receiptNote,...insertedNotes].filter(Boolean).join('\n').split(/\r?\n/).length)},()=>'<tr class="empty"><td>&nbsp;</td><td></td><td></td></tr>').join('');
  const renderCopy=copyKey=>`<article class="receipt-copy" data-copy="${copyKey}">
  <header><div class="brand">${logo?'<img class="company-logo" src="'+esc(logo)+'" alt="โลโก้บริษัท">':''}<div><h1>${esc(company.CompanyName)}</h1>${company.CompanyNameEn?'<p>'+esc(company.CompanyNameEn)+'</p>':''}<p class="small">${esc(company.Address)}</p><p class="small">โทร. ${esc(company.Phone)} · เลขประจำตัวผู้เสียภาษี ${esc(company.TaxID)}</p><p class="small">${esc(company.Branch||'สำนักงานใหญ่')}</p></div></div><div class="copy">${copyKey==='company'?'สำเนาบริษัท':'ต้นฉบับลูกค้า'}</div></header>
  <h2>ใบเสร็จรับเงิน<small>RECEIPT</small></h2><p class="receipt-reference">อ้างอิงใบเสนอราคา ${esc(quote.Title)}</p>
  ${review?'<p class="review">ฉบับตรวจสอบ — ยังไม่อนุมัติให้ใช้รับเงิน</p>':''}
  <div class="meta"><div class="customer"><p>นามลูกค้า <span class="under">${esc(quote.ClientName)}</span></p><p>ที่อยู่ <span class="under">${esc(quote.CustomerAddress||quote.ClientAddress||customer.CustomerAddress||'')}</span></p><p>เลขประจำตัวผู้เสียภาษี <span class="under">${esc(quote.CustomerTaxID||quote.ClientTaxID||customer.CustomerTaxID||'')}</span></p></div><div class="document-meta"><p>เลขที่ <span class="under">${esc(invoice.Title)}</span></p><p>วันที่ <span class="under">${esc(date)}</span></p></div></div>
  <table><colgroup><col style="width:9%"><col style="width:66%"><col style="width:25%"></colgroup><thead><tr><th>ลำดับ</th><th>รายการ / เอกสารอ้างอิง</th><th>จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="total"><div class="words">ตัวอักษร: ${esc(bahtText(totals.gross))}</div><div class="amount"><span>รวมเงิน<br><small>TOTAL</small></span><strong>${money(totals.gross)}</strong></div></div>
  ${receiptNote?'<div class="receipt-remarks"><b>หมายเหตุ:</b> '+esc(receiptNote)+'</div>':''}
  <div class="payment">□ เงินสด &nbsp; __________________ บาท<br>□ เงินโอน &nbsp; __________________ บาท<br>□ เช็คธนาคาร __________________ เลขที่ __________________<br>ลงวันที่ __________________ จำนวนเงิน __________________ บาท</div>
  <p class="note">กรณีชำระด้วยเช็ค ใบเสร็จรับเงินจะสมบูรณ์เมื่อบริษัทฯ ได้รับเงินแล้วเท่านั้น</p>
  <div class="signatures"><div>ผู้รับเงิน<div class="line"></div><p>ลงวันที่ __________________</p></div><div>ผู้รับใบเสร็จ<div class="line"></div><p>ลงวันที่ __________________</p></div><div>ในนาม ${esc(company.CompanyName)}<div class="line"></div><p class="center">ผู้มีอำนาจลงนาม</p></div></div>
  </article>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสร็จรับเงิน ${esc(invoice.Title)}</title><style>
    @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0 auto;padding:12px;color:#172b42;background:#e9edf2;font:11px/1.4 Tahoma,"Leelawadee UI",sans-serif}
    .receipt-sheet{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:281mm;min-height:194mm;margin:0 auto;background:white}
    .receipt-sheet:before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #9aa5b1;pointer-events:none}.cut-label{position:absolute;left:50%;top:1mm;transform:translateX(-50%);background:white;color:#64748b;font-size:8px;padding:2px;writing-mode:vertical-rl}
    .receipt-copy{padding:4mm 5mm;min-width:0;break-inside:avoid}header{position:relative;padding-top:17px;min-height:65px}.brand{display:flex;gap:9px;align-items:center}.brand>div{min-width:0;overflow-wrap:anywhere}
    .company-logo{display:block;max-width:100px;max-height:50px;width:auto;height:auto;object-fit:contain;flex-shrink:0}h1{font-size:14px;margin:0 0 3px;line-height:1.35}p{margin:2px 0}.small{font-size:9px;line-height:1.4}
    .copy{position:absolute;top:0;right:0;border:1px solid #69517f;border-radius:3px;padding:2px 8px;white-space:nowrap;font-size:10px}
    h2{border:1.5px solid #69517f;border-radius:4px;width:130px;margin:6px auto;text-align:center;font-size:16px;line-height:1.3;padding:4px}h2 small{display:block;font-size:10px;font-weight:400}
    .meta{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:10px;margin:10px 0}.customer{min-width:0;overflow-wrap:anywhere}.under{border-bottom:1px dotted #b3bbc5;padding:1px 3px;overflow-wrap:anywhere}
    table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group;background:#68517e;color:white;print-color-adjust:exact;-webkit-print-color-adjust:exact}th,td{border:1px solid #8d96a3;padding:4px}th{font-weight:500;text-align:center}tr{break-inside:avoid}.empty td{height:20px;padding:0 5px}.center{text-align:center}.num{text-align:right;white-space:nowrap}
    .total{display:grid;grid-template-columns:minmax(0,1fr) 140px;border:1px solid #606b78;border-top:0;break-inside:avoid}.words{padding:7px;border-right:1px solid #606b78;font-size:10px;overflow-wrap:anywhere}.amount{padding:6px;display:flex;gap:5px;justify-content:space-between;align-items:center}.amount strong{font-size:14px;white-space:nowrap}.amount>span{white-space:nowrap}.document-meta p{display:grid;grid-template-columns:32px minmax(0,1fr);gap:3px;align-items:baseline;white-space:nowrap}.document-meta .under{white-space:nowrap;font-size:10px;padding:1px 0}
    .receipt-product-name{font-weight:600;overflow-wrap:anywhere}.receipt-product-detail{white-space:pre-line;overflow-wrap:anywhere;font-size:10px;margin-top:3px}.receipt-product-quantity{font-size:10px;color:#526175;margin-top:3px}.receipt-reference{font-size:9px;margin:2px 0}.receipt-remarks{margin:7px 0;padding:6px;border:1px solid #bcc5d1;font-size:10px;white-space:pre-line;overflow-wrap:anywhere;break-inside:avoid}.payment{padding:6px 5px;line-height:1.55;font-size:10px}.note{text-align:center;font-size:8px;margin:7px 0}.signatures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #606b78;break-inside:avoid;font-size:9px}.signatures>div{padding:10px 5px 7px;min-height:62px;border-right:1px solid #606b78;overflow-wrap:anywhere}.signatures>div:last-child{border:0}.line{margin-top:13px;border-bottom:1px dotted #b3bbc5}.review{border:1px solid #be123c;color:#be123c;padding:5px;font-size:10px}
    @media print{body{padding:0;background:white}.receipt-sheet{width:100%;margin:0;min-height:0;break-inside:avoid}.receipt-copy{padding-top:2mm;padding-bottom:0}.total,.payment,.signatures{break-inside:avoid}}
</style></head><body><main class="receipt-sheet"><span class="cut-label">แนวตัด</span>${renderCopy('customer')}${renderCopy('company')}</main></body></html>`;
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
    if(issued){printViaIframe(await buildRetailReceiptPrintHTML(issued,document.getElementById('cpo-copy')?.value==='company'?'company':'customer'));status.textContent='เปิดเอกสารเดิม '+issued.Title;return;}
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
    printViaIframe(await buildRetailReceiptPrintHTML({...invoice,...saved},document.getElementById('cpo-copy')?.value==='company'?'company':'customer'));
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
    if(op==='print')printViaIframe(await buildRetailReceiptPrintHTML({...result.item,DocumentDate:''},(copy||document.getElementById('cpo-copy')?.value)==='company'?'company':'customer',true));
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

      for(const [label,action] of actions){const button=document.createElement('button');button.className='btn btn-sm'+(action==='print'?' btn-primary':'');button.textContent=label;
        button.onclick=async()=>{try{if(action==='preview')printViaIframe(await buildRetailReceiptPrintHTML({...record,DocumentDate:''},'company',true,true));else await retailAdvanceAction(action,record.QuoteID,record.UpdatedAt,'both');}catch(error){toast(error.message,'error');}};card.append(button);}
      if(record.Status==='approved'){const hint=document.createElement('small');hint.style.display='block';hint.textContent='A4 แนวนอน · ต้นฉบับลูกค้าและสำเนาบริษัทในหน้าเดียว · หรือเปิดงานขาย > PO ลูกค้า > ใบเสร็จอย่างย่อ > พิมพ์เว้นวันที่';card.append(hint);}
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

async function buildRetailReceiptPrintHTML(invoice,...options){
  const snapshot=JSON.parse(invoice.Snapshot);
  if(!Array.isArray(snapshot.totals.documentNotes)&&invoice.QuoteID){
    const rows=await getListItems(CONFIG.lists.quoteItems);
    snapshot.totals.documentNotes=rows.filter(it=>String(it.QuoteID)===String(invoice.QuoteID)&&it.Title==='__NOTE__').map(it=>String(it.Description||''));
  }
  return buildRetailReceiptHTML({...invoice,Snapshot:JSON.stringify(snapshot)},...options);
}
