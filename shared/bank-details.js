(function(root){
  'use strict';
  function read(value){value=value||{};return {bankName:String(value.bankName||value.BankName||'').trim(),bankAccountName:String(value.bankAccountName||value.BankAccountName||'').trim(),bankAccountNumber:String(value.bankAccountNumber||value.BankAccountNumber||'').trim()};}
  function validate(value){const bank=read(value);if(Object.values(bank).some(Boolean)){
    if(!bank.bankName||!bank.bankAccountName||!bank.bankAccountNumber)throw Error('กรอกธนาคาร ชื่อบัญชี และเลขบัญชีให้ครบ หรือเว้นว่างทั้งสามช่อง');
    if(!/^[\d -]+$/.test(bank.bankAccountNumber)||!bank.bankAccountNumber.replace(/\D/g,'')||bank.bankAccountNumber.replace(/\D/g,'').length>40)throw Error('เลขบัญชีใช้ตัวเลข ช่องว่าง หรือขีดกลางเท่านั้น');
  }return bank;}
  function html(value,escape){const b=read(value);if(!b.bankAccountNumber)return '<span style="color:var(--muted);font-size:12px">ยังไม่ระบุบัญชีธนาคาร</span>';return '<div style="font-size:12px;line-height:1.8;overflow-wrap:anywhere"><strong>'+escape(b.bankName)+'</strong><br>ชื่อบัญชี: '+escape(b.bankAccountName)+'<br>เลขบัญชี: <span style="font-family:monospace;user-select:all">'+escape(b.bankAccountNumber)+'</span> <button type="button" class="btn btn-sm" data-bank-copy="'+escape(b.bankAccountNumber.replace(/[ -]/g,''))+'">คัดลอกเลขบัญชี</button></div>';}
  root.BankDetails=Object.freeze({read,validate,html});
  if(typeof document!=='undefined')document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-bank-copy]');if(!button)return;
    try{await navigator.clipboard.writeText(button.getAttribute('data-bank-copy'));if(typeof toast==='function')toast('คัดลอกเลขบัญชีแล้ว','success');}
    catch{if(typeof toast==='function')toast('คัดลอกไม่ได้ กรุณาเลือกเลขบัญชีแล้วคัดลอกเอง','error');}
  });
})(typeof window==='undefined'?globalThis:window);
