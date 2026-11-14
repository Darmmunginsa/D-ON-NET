// AmountPaid settles the invoice; ReceivedAmount is cash after withholding.
const SalePaymentCore=(()=>{
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function calculate(gross,whtPercent=0,vatPercent=7){
    gross=Number(gross);whtPercent=Number(whtPercent);vatPercent=Number(vatPercent);
    if(!Number.isFinite(gross)||gross<=0||!Number.isFinite(whtPercent)||whtPercent<0||whtPercent>100||!Number.isFinite(vatPercent)||vatPercent<0||vatPercent>100)throw Error('ยอดเงินหรืออัตราภาษีไม่ถูกต้อง');
    gross=round(gross);const base=round(gross/(1+vatPercent/100)),vat=round(gross-base),wht=round(base*whtPercent/100),cash=round(gross-wht);
    return {gross,base,vat,wht,cash,fields:{PaymentVersion:'2',AmountPaid:gross,ReceivedAmount:cash,PaymentVatRate:vatPercent,PaymentVatAmount:vat,WHTBaseAmount:base,WHTPercent:whtPercent,WHTAmount:wht}};
  }
  function cash(record){
    if(String(record.PaymentVersion)==='2'&&record.ReceivedAmount!=null&&record.ReceivedAmount!==''&&Number.isFinite(Number(record.ReceivedAmount)))return Number(record.ReceivedAmount);
    // Never recalculate historical withholding: retain the stored certificate amount.
    return round((Number(record.AmountPaid)||0)-(Number(record.WHTAmount)||0));
  }
  return {calculate,cash};
})();
