function openFinanceTaxCorrection(index){
  const row=ledgerAttachmentRows[index];
  if(!isAdminUser()||!row?.taxCorrection)return;
  const source=row.source;
  const sale=source==='SalePro';
  const work=source==='TechPro'||source==='SaleExpense';
  const invoice=row.taxCorrection.invoice;
  const money=(name,label,value,required=false)=>'<label>'+label+'<input name="'+name+'" type="number" min="0" step="0.01" value="'+esc(value??'')+'" '+(required?'required':'')+'></label>';
  const states=[['pending','รอตรวจ'],['credit','ใช้เครดิตได้'],['excluded','ใช้เครดิตไม่ได้'],['none','ไม่มี VAT']];
  const status=states.map(([key,label])=>'<option value="'+key+'" '+((row.vatStatus||'pending')===key?'selected':'')+'>'+label+'</option>').join('');
  modal('แก้ข้อมูลภาษี',`
    <p>${esc(row.quoteTitle||row.party)} · ${esc(source)} · ${work?'จ่ายจริง':'ยอดรวมก่อนหัก'} ${fmt(row.gross)}</p>
    <form id="finance-tax-correction-form" class="grid2">
      ${money('vat',sale?'VAT ของยอดรับชำระงวดนี้':'VAT ตามเอกสาร',row.vat,sale)}
      ${sale?'':'<label>สถานะ VAT ซื้อ<select name="vatStatus">'+status+'</select></label>'}
      ${work?'':money('whtRate','อัตราหัก ณ ที่จ่าย (%)',row.taxCorrection.whtRate,true)+money('whtBase','ฐานหัก ณ ที่จ่าย (บาท)',row.taxCorrection.whtBase)}
      <label>เลขที่ใบกำกับภาษี<input name="taxDoc" maxlength="100" value="${esc(row.taxDoc||'')}"></label>
      <label>วันที่ใบกำกับภาษี<input name="documentDate" type="date" value="${esc(row.taxCorrection.documentDate||'')}"></label>
      <label>แนบหรือเปลี่ยนไฟล์ใบกำกับภาษี<input name="invoiceFile" type="file" accept="image/*,.pdf"></label>
      ${sale?`<label>วันที่เกิดภาษี<input name="taxDate" type="date" value="${esc(row.taxCorrection.taxDate||'')}"></label>
      ${money('invoiceBase','ยอดก่อน VAT ทั้งใบกำกับ',invoice?.BaseAmount)}
      ${money('invoiceVat','VAT ทั้งใบกำกับ',invoice?.VatAmount)}
      <small style="grid-column:1/-1">การแก้ใบกำกับมีผลกับทุกงวดที่อ้างถึงใบเดียวกัน ยอดชำระก่อนหักของงวดนี้คงเดิม</small>`:''}
      <label style="grid-column:1/-1">เหตุผลที่แก้ไข<input name="reason" maxlength="500" required></label>
      <p style="grid-column:1/-1" role="status"></p>
    </form>`, '<button type="submit" form="finance-tax-correction-form" class="btn btn-primary">บันทึกการแก้ไข</button>');
  const form=document.getElementById('finance-tax-correction-form');
  const submit=document.querySelector('[form="finance-tax-correction-form"]');
  const message=form.querySelector('[role="status"]');
  let uploadedFile=null, invoiceUrl='';
  form.oninput=()=>{
    const data=Object.fromEntries(new FormData(form));
    if(work||data.whtRate==='')return;
    const base=data.whtBase===''?(data.vat===''?null:row.gross-Number(data.vat)):Number(data.whtBase);
    if(base!=null)message.textContent='รับ/จ่ายสุทธิหลังแก้ '+fmt(row.gross-Math.round(base*Number(data.whtRate))/100);
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    const data=Object.fromEntries(new FormData(form));
    submit.disabled=true;
    message.textContent='กำลังบันทึกข้อมูลภาษี…';
    try{
      const file=data.invoiceFile;
      delete data.invoiceFile;
      if(file?.name){
        if(!data.taxDoc.trim())throw Error('ระบุเลขที่ใบกำกับก่อนแนบไฟล์');
        if(file.size>5*1024*1024||(!file.type.startsWith('image/')&&file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name)))throw Error('เลือกไฟล์รูปภาพหรือ PDF ขนาดไม่เกิน 5 MB');
        if(file!==uploadedFile){
          message.textContent='กำลังอัปโหลดใบกำกับภาษี…';
          invoiceUrl=(await uploadDoc(form.elements.invoiceFile,true,'FinanceTaxInvoices'))?.url;
          if(!invoiceUrl)throw Error('อัปโหลดไฟล์ไม่สำเร็จ');
          uploadedFile=file;
        }
        data.invoiceUrl=invoiceUrl;
      }
      await _call({action:'correctFinanceTax',target:row.attachmentTarget,data,expected:{gross:row.gross,revision:row.taxCorrection.revision,invoiceId:invoice?.id||'',invoiceRevision:invoice?.TaxRevision||''}});
      if(form.isConnected)closeModal();
      await loadAll();
      if(_view==='ledger')go('ledger');
      toast('บันทึกข้อมูลภาษีกลับไปที่รายการต้นทางแล้ว','success');
    }catch(error){message.textContent=error.message;}
    finally{submit.disabled=false;}
  };
}
