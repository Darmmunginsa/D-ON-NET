function openFinanceTaxCorrection(index){
  const row=ledgerAttachmentRows[index];
  if(!isAdminUser()||!row?.taxCorrection)return;
  const source=row.source;
  const sale=source==='SalePro';
  const tech=source==='TechPro';
  const work=source==='TechPro'||source==='SaleExpense';
  const invoice=row.taxCorrection.invoice;
  const money=(name,label,value,required=false)=>'<label>'+label+'<input name="'+name+'" type="number" min="0" step="0.01" value="'+esc(value??'')+'" '+(required?'required':'')+'></label>';
  const states=[['pending','รอตรวจ'],['credit','ใช้เครดิตได้'],['excluded','ใช้เครดิตไม่ได้'],['none','ไม่มี VAT']];
  const status=states.map(([key,label])=>'<option value="'+key+'" '+((row.vatStatus||'pending')===key?'selected':'')+'>'+label+'</option>').join('');
  modal('แก้ข้อมูลภาษี',`
    <p>${esc(row.quoteTitle||row.party)} · ${esc(source)} · ${work?'จ่ายจริง':'ยอดรวมก่อนหัก'} ${fmt(row.gross)}</p>
    <form id="finance-tax-correction-form" class="tax-correction-form">
      ${money('vat',sale?'VAT ของยอดรับชำระงวดนี้':'VAT ตามเอกสาร',row.vat,sale)}
      ${sale?'':'<label>สถานะ VAT ซื้อ<select name="vatStatus">'+status+'</select></label>'}
      ${tech?'<label>หัก ณ ที่จ่าย<select name="whtStatus"><option value="pending">รอตรวจ</option><option value="none" '+(row.whtAmount===0?'selected':'')+'>ไม่หัก (฿0.00)</option></select></label>':''}
      ${work?'':money('whtRate','อัตราหัก ณ ที่จ่าย (%)',row.taxCorrection.whtRate,true)+money('whtBase','ฐานหัก ณ ที่จ่าย (บาท)',row.taxCorrection.whtBase)}
      <label>เลขที่ใบกำกับภาษี<input name="taxDoc" maxlength="100" value="${esc(row.taxDoc||'')}"></label>
      <label>วันที่ใบกำกับภาษี<input name="documentDate" type="date" value="${esc(row.taxCorrection.documentDate||'')}"></label>
      ${sale?`<label>วันที่เกิดภาษี<input name="taxDate" type="date" value="${esc(row.taxCorrection.taxDate||'')}"></label>
      ${money('invoiceBase','ยอดก่อน VAT ทั้งใบกำกับ',invoice?.BaseAmount)}
      ${money('invoiceVat','VAT ทั้งใบกำกับ',invoice?.VatAmount)}
      <small class="tax-correction-wide">การแก้ใบกำกับมีผลกับทุกงวดที่อ้างถึงใบเดียวกัน ยอดชำระก่อนหักของงวดนี้คงเดิม</small>`:''}
      <label class="tax-correction-wide">แนบหรือเปลี่ยนไฟล์ใบกำกับภาษี<input name="invoiceFile" type="file" accept="image/*,.pdf"></label>
      ${sale?`<label class="tax-correction-wide">หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)<input name="certificateFile" type="file" accept="image/*,.pdf">
        ${row.whtCertificateUrl?'<small>มีไฟล์แนบแล้ว · เลือกไฟล์ใหม่เพื่อเปลี่ยน</small>':''}</label>`:''}
      <label class="tax-correction-wide">เหตุผลที่แก้ไข<input name="reason" maxlength="500" required></label>
      <p class="tax-correction-wide" role="status"></p>
    </form>`, '<button type="submit" form="finance-tax-correction-form" class="btn btn-primary">บันทึกการแก้ไข</button>');
  const form=document.getElementById('finance-tax-correction-form');
  const submit=document.querySelector('[form="finance-tax-correction-form"]');
  const message=form.querySelector('[role="status"]');
  const uploaded=new Map();
  let taxSaved=false, pendingCertificate=null;
  async function uploadTaxFile(file,folder,label){
    const previous=uploaded.get(folder);
    if(previous?.file===file)return previous.document;
    if(file.size>5*1024*1024||(!file.type.startsWith('image/')&&file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name)))throw Error(label+' ต้องเป็นรูปภาพหรือ PDF ขนาดไม่เกิน 5 MB');
    message.textContent='กำลังอัปโหลด'+label+'…';
    const document=await uploadDoc({files:[file]},true,folder);
    if(!document?.url)throw Error('อัปโหลด'+label+'ไม่สำเร็จ');
    uploaded.set(folder,{file,document});
    return document;
  }
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
      const progressLabel=!taxSaved?'กำลังบันทึกข้อมูลภาษี…':pendingCertificate?'กำลังบันทึกหนังสือรับรอง…':'กำลังโหลดข้อมูลภาษีล่าสุด…';
      await financeProgress.run(progressLabel,async()=>{
        if(!taxSaved){
          const invoiceFile=data.invoiceFile;
          const certificateFile=sale?data.certificateFile:null;
          delete data.invoiceFile;
          delete data.certificateFile;
          if(invoiceFile?.name){
            if(!data.taxDoc.trim())throw Error('ระบุเลขที่ใบกำกับก่อนแนบไฟล์');
            data.invoiceUrl=(await uploadTaxFile(invoiceFile,'FinanceTaxInvoices','ใบกำกับภาษี')).url;
          }
          pendingCertificate=certificateFile?.name?await uploadTaxFile(certificateFile,'PaymentCertificates','หนังสือรับรองหัก ณ ที่จ่าย'):null;
          message.textContent='กำลังบันทึกข้อมูลภาษี…';
          await _call({action:tech&&data.whtStatus?'correctTechExpenseTax':'correctFinanceTax',target:row.attachmentTarget,data,expected:{gross:row.gross,revision:row.taxCorrection.revision,invoiceId:row.taxCorrection.linkedInvoiceId??invoice?.id??'',invoiceRevision:invoice?.TaxRevision||''}});
          taxSaved=true;
          for(const control of form.elements)control.disabled=true;
        }
        if(pendingCertificate){
          message.textContent='กำลังบันทึกหนังสือรับรองหัก ณ ที่จ่าย…';
          await _call({action:'attachFinanceWhtCertificate',target:row.attachmentTarget,previousUrl:row.whtCertificateUrl||'',url:pendingCertificate.url,filename:pendingCertificate.name});
          pendingCertificate=null;
        }
        message.textContent='บันทึกแล้ว กำลังโหลดข้อมูลล่าสุด…';
        await refreshFinanceTaxData();
      });
      if(form.isConnected)closeModal();
      toast('บันทึกข้อมูลภาษีกลับไปที่รายการต้นทางแล้ว','success');
    }catch(error){
      if(taxSaved&&pendingCertificate){
        message.textContent='บันทึกข้อมูลภาษีแล้ว แต่ยังแนบหนังสือรับรองไม่สำเร็จ: '+error.message;
        submit.textContent='ลองแนบหนังสือรับรองอีกครั้ง';
      }else if(taxSaved){
        message.textContent='บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดโหลดใหม่: '+error.message;
        submit.textContent='โหลดข้อมูลใหม่';
      }else message.textContent=error.message;
    }
    finally{submit.disabled=false;}
  };
}
