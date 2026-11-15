// AmountPaid settles the invoice; ReceivedAmount is cash after withholding.
const SalePaymentCore=(()=>{
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function calculate(gross,whtPercent=0,vatPercent=7,withholdingBase){
    gross=Number(gross);whtPercent=Number(whtPercent);vatPercent=Number(vatPercent);
    if(!Number.isFinite(gross)||gross<=0||!Number.isFinite(whtPercent)||whtPercent<0||whtPercent>100||!Number.isFinite(vatPercent)||vatPercent<0||vatPercent>100)throw Error('ยอดเงินหรืออัตราภาษีไม่ถูกต้อง');
    gross=round(gross);const base=round(gross/(1+vatPercent/100)),vat=round(gross-base);
    const whtBase=withholdingBase==null||withholdingBase===''?base:Number(withholdingBase);
    if(!Number.isFinite(whtBase)||whtBase<0||whtBase>base)throw Error('ฐานหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0 และยอดก่อน VAT');
    const wht=round(whtBase*whtPercent/100),cash=round(gross-wht);
    return {gross,base,vat,wht,cash,fields:{PaymentVersion:'2',AmountPaid:gross,ReceivedAmount:cash,PaymentVatRate:vatPercent,PaymentVatAmount:vat,PaymentBaseAmount:base,WHTBaseAmount:round(whtBase),WHTPercent:whtPercent,WHTAmount:wht}};
  }
  function cash(record){
    if(String(record.PaymentVersion)==='2'&&record.ReceivedAmount!=null&&record.ReceivedAmount!==''&&Number.isFinite(Number(record.ReceivedAmount)))return Number(record.ReceivedAmount);
    // Never recalculate historical withholding: retain the stored certificate amount.
    return round((Number(record.AmountPaid)||0)-(Number(record.WHTAmount)||0));
  }
  const optional = value => value==null||String(value).trim()===''||!Number.isFinite(Number(value)) ? null : Number(value);
  function purchase(payment){
    const gross=Number(payment.amount)||0,rate=optional(payment.whtPct);
    const status=payment.vatStatus||'';
    const vat=status==='none'?0:optional(payment.vatAmount);
    const base=vat==null?null:round(gross-vat);
    const explicitBase=optional(payment.whtBaseAmount);
    const whtBase=explicitBase ?? (payment.taxCapture==='1'?base:gross);
    const wht=rate===0?0:(rate!=null&&whtBase!=null&&whtBase>=0&&whtBase<=(payment.taxCapture==='1'?(base??gross):gross)?round(whtBase*rate/100):null);
    return {gross,base,vat,whtBase,wht,net:round(gross-(wht||0)),status};
  }
  return {calculate,cash,purchase,optional};
})();
