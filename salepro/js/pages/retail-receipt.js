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
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>Number(value).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const inclusive=quote.PricingMode==='inclusive';
  const lines=totals.lines.map((item,index)=>{
    const price=Number(item.UnitPrice);
    const amount=Number(item.Quantity)*price*(1-Number(item.DiscountPct||0)/100);
    return '<tr><td>'+(index+1)+'</td><td>'+esc(item.Title)+(item.Description?'<small>'+esc(item.Description)+'</small>':'')+'</td><td class="num">'+esc(item.Quantity)+' '+esc(item.Unit)+'</td><td class="num">'+money(price)+'</td><td class="num">'+money(amount)+'</td></tr>';
  }).join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(invoice.Title)}</title>
    <style>
      @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0 auto;padding:20px;max-width:850px;color:#162b40;font:14px/1.6 Tahoma,"Leelawadee UI",sans-serif}
      header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #173e60;padding-bottom:18px}
      h1{font-size:23px;margin:0}h2{font-size:20px;margin:25px 0 4px}p{margin:4px 0}.company{max-width:65%}
      .copy{font-size:13px;text-align:right;color:#526b7e}.meta{display:flex;justify-content:space-between;margin:18px 0}
      table{width:100%;border-collapse:collapse;margin:18px 0}thead{display:table-header-group;background:#173e60;color:#fff}
      th,td{padding:10px 8px;border-bottom:1px solid #ccd6de;vertical-align:top}th{text-align:left}tr{break-inside:avoid}
      .num{text-align:right;white-space:nowrap}small{display:block;color:#64788b}.totals{width:48%;margin-left:auto}
      .grand{font-size:18px;font-weight:bold;background:#eaf1f6}.words{padding:12px;background:#f2f6f9;text-align:center}
      footer{margin-top:32px;border-top:1px solid #ccd6de;padding-top:12px} .signature{margin-top:40px;text-align:right}@media print{body{padding:0;max-width:none}}
    </style></head><body>
    <header><div class="company"><h1>${esc(company.CompanyName)}</h1><p>${esc(company.Address)}</p>
    <p>เลขประจำตัวผู้เสียภาษี ${esc(company.TaxID)} · ${esc(company.Branch||'สำนักงานใหญ่')}</p><p>โทร. ${esc(company.Phone)}</p></div>
    <div class="copy">${copy==='company'?'สำเนาบริษัท':'ต้นฉบับลูกค้า'}<br>เลขที่ ${esc(invoice.Title)}</div></header>
    ${review?'<p style="border:2px solid #be123c;padding:12px;color:#be123c">ฉบับตรวจสอบ — ยังไม่อนุมัติให้ใช้รับเงิน</p>':''}<h2>ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ</h2><small>RECEIPT / ABBREVIATED TAX INVOICE</small>
    <div class="meta"><div>วันที่ ${esc(advance?'____ / ____ / ______':invoice.DocumentDate.split('-').reverse().join('/'))}<br>อ้างอิง ${esc(quote.Title)}</div>
    <div>ลูกค้า ${esc(quote.ClientName)}<br>${inclusive?'ราคาต่อหน่วยและจำนวนเงินรวม VAT แล้ว':'ราคาต่อหน่วยและจำนวนเงินก่อน VAT'}</div></div>
    <table><thead><tr><th>#</th><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคาต่อหน่วย</th><th class="num">จำนวนเงิน</th></tr></thead><tbody>${lines}</tbody></table>
    <table class="totals"><tr><td>รวมรายการ</td><td class="num">${money(totals.subtotal)}</td></tr>
    ${totals.discount?'<tr><td>ส่วนลด</td><td class="num">'+money(totals.discount)+'</td></tr>':''}
    <tr><td>มูลค่าก่อน VAT</td><td class="num">${money(totals.base)}</td></tr><tr><td>VAT 7%</td><td class="num">${money(totals.vat)}</td></tr>
    <tr class="grand"><td>${advance?'ยอดรวม VAT':'รับเงินรวม VAT แล้ว'}</td><td class="num">${money(totals.gross)}</td></tr></table>
    <div class="words">${esc(bahtText(totals.gross))}</div><p class="signature">ผู้รับเงิน ____________________</p>
    <footer>ราคาสินค้า/ค่าบริการสุทธิรวมภาษีมูลค่าเพิ่มแล้ว<br>${esc(company.FooterText||'')}</footer></body></html>`;
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
    const labels={pending:'รออนุมัติ',approved:'อนุมัติให้พิมพ์แล้ว',rejected:'ไม่อนุมัติ / ยกเลิกคำขอ'};
    el.textContent=r?(labels[r.Status]||r.Status)+' · '+r.Title+' · ผู้อนุมัติ '+r.ApproverEmail:'ยังไม่มีคำขอพิมพ์ล่วงหน้า';
    if(r?.Status==='pending'){const mail=document.createElement('div');mail.textContent=retailApprovalEmailMessage(r);el.append(mail);const retry=document.createElement('button');retry.className='btn btn-sm';retry.textContent='ส่งอีเมลแจ้งอีกครั้ง';retry.onclick=()=>retailAdvanceAction('notify');el.append(retry);}
    if(r){for(const entry of JSON.parse(r.History||'[]')){const line=document.createElement('small');line.style.display='block';line.textContent=({requested:'ส่งขออนุมัติ',approve:'อนุมัติ',reject:'ไม่อนุมัติ',print:'สั่งพิมพ์',withdraw:'ยกเลิกคำขอ',emailAccepted:'ระบบรับคำขอส่งอีเมลแล้ว',emailFailed:'ส่งอีเมลไม่สำเร็จ'}[entry.action]||entry.action)+' · '+entry.by+' · '+new Date(entry.at).toLocaleString('th-TH');el.append(line);}}
    document.getElementById('cpo-retail-print').disabled=!r||r.Status!=='approved';
  }catch(error){el.textContent=error.message;}
}
async function retailAdvanceAction(op,quoteId=stQuoteId,revision){
  if(retailReceiptBusy)return;retailReceiptBusy=true;
  try{
    const req={action:'retailReceiptApproval',op,quoteId,revision:revision||retailAdvanceRecord?.UpdatedAt};
    if(op==='request'){req.eligible=document.getElementById('cpo-retail-eligible').checked;req.company=Object.fromEntries(['CompanyName','Address','TaxID','Phone','Branch','FooterText'].map(k=>[k,companySettings[k]||'']));}
    const result=await _call(req);
    if(op==='print')printViaIframe(buildRetailReceiptHTML({...result.item,DocumentDate:''},document.getElementById('cpo-copy')?.value==='company'?'company':'customer',true));
    if(op==='request'||op==='notify')toast('คำขอ'+(result.item.Status==='approved'?'อนุมัติแล้ว':': '+retailApprovalEmailMessage(result.item)),result.item.EmailStatus==='failed'?'warning':'success');
    else toast(op==='print'?'บันทึกประวัติการพิมพ์แล้ว':'บันทึกผลแล้ว','success');
    if(String(quoteId)===String(stQuoteId))await loadRetailAdvance();
    if(typeof renderRetailApprovals==='function')await renderRetailApprovals();
  }catch(error){toast(error.message,'error');}finally{retailReceiptBusy=false;}
}
async function renderRetailApprovals(){
  const host=document.getElementById('approve-list');if(!host)return;
  let box=document.getElementById('retail-approval-list');if(!box){box=document.createElement('div');box.id='retail-approval-list';host.prepend(box);}
  box.textContent='กำลังโหลดคำขอพิมพ์เอกสารล่วงหน้า…';
  try{const result=await _call({action:'retailReceiptApproval',op:'pending'});box.replaceChildren();
    const empty=host.querySelector('.empty');if(empty)empty.hidden=!!result.items?.length;
    for(const record of result.items||[]){const card=document.createElement('div');card.className='card';card.style.padding='16px';
      const snapshot=JSON.parse(record.Snapshot),title=document.createElement('p');title.textContent='ขอพิมพ์ใบเสร็จอย่างย่อเว้นวันที่ · '+record.Title+' · '+snapshot.quote.ClientName+' · '+Number(snapshot.totals.gross).toLocaleString('th-TH')+' บาท';card.append(title);
      for(const [label,action] of [['ตรวจเอกสาร','preview'],['อนุมัติ','approve'],['ไม่อนุมัติ','reject']]){const button=document.createElement('button');button.className='btn btn-sm';button.textContent=label;button.onclick=()=>action==='preview'?printViaIframe(buildRetailReceiptHTML({...record,DocumentDate:''},'company',true,true)):retailAdvanceAction(action,record.QuoteID,record.UpdatedAt);card.append(button);}box.append(card);
    }
  }catch(error){box.textContent='โหลดคำขอพิมพ์ล่วงหน้าไม่สำเร็จ: '+error.message;}
}

function retailApprovalEmailMessage(record){
  if(record.EmailStatus==='accepted')return 'ระบบรับคำขอส่งอีเมลถึง '+record.ApproverEmail+' แล้ว (ยังไม่ยืนยันการเข้ากล่องผู้รับ)';
  if(record.EmailStatus==='failed')return 'บันทึกคำขอแล้ว แต่อีเมลไม่สำเร็จ: '+(record.EmailError||'โปรดลองส่งอีกครั้ง');
  if(record.EmailStatus==='sending')return 'กำลังส่งอีเมล / ยังยืนยันผลไม่ได้ กรุณาโหลดสถานะ';
  return 'คำขอนี้ยังไม่ได้ส่งอีเมลแจ้งผู้อนุมัติ';
}
