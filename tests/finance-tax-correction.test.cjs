const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('Finance correction requires Admin and recalculates the source receipt using its original gross', () => {
  const path='salepro/apps-script/Code.gs';
  const source=fs.readFileSync(path,'utf8');
  const payment={id:'pay-1',QuoteID:'q',AmountPaid:'9095',SlipURL:'existing'};
  const invoices=[];
  const purchase={id:'pr-1',Title:'Purchase_pr',Value:JSON.stringify({stageData:{payment:{vendors:{v:{amount:5681.7,slipUrl:'unchanged'}}}}})};
  const settings=[{id:'deal-1',Title:'DealStatus_q',Value:JSON.stringify({techJobs:[{id:'job-1',expenses:[{id:'expense-1',amount:1070,receiptUrl:'tax-receipt'}]}]})}];
  const tables={Settings:settings,Payments:[payment],Procurement:[purchase],SalesTaxInvoices:invoices};
  const ctx=vm.createContext({
    listRows:name=>tables[name], LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:()=>String(Math.random())}, Date,
  });
  vm.runInContext(source.slice(source.indexOf('function correctFinanceTax('),source.indexOf('function handle(')),ctx);
  ctx.writeFinanceTaxFields=(table,id,fields,create)=>{
    if(create)tables[table].push({id,...fields});
    else Object.assign(tables[table].find(row=>row.id===id),fields);
  };
  const actor={email:'admin@dongroups.com'};
  const correction={
    target:{source:'SalePro',id:'pay-1'},expected:{gross:9095},
    data:{vat:'595',whtRate:'3',reason:'certificate',taxDoc:'TAX-1',documentDate:'2026-11-14',taxDate:'2026-11-14',invoiceBase:'8500',invoiceVat:'595'},
  };
  assert.throws(()=>ctx.correctFinanceTax({...correction,_actor:{email:'user@example.test'}}),/Admin/);
  assert.equal(invoices.length,0);
  ctx.correctFinanceTax({...correction,_actor:actor});
  assert.equal(payment.AmountPaid,'9095');
  assert.equal(payment.ReceivedAmount,8840);
  assert.equal(payment.WHTAmount,255);
  assert.equal(payment.SlipURL,'existing');
  assert.equal(payment.TaxInvoiceId,invoices[0].id);
  assert.throws(()=>ctx.correctFinanceTax({...correction,_actor:actor}),/โหลดข้อมูลใหม่/);
  ctx.correctFinanceTax({_actor:actor,target:{source:'PurchasePro',id:'pr',vendorId:'v'},expected:{gross:5681.7},data:{vat:371.7,whtRate:3,vatStatus:'credit',taxDoc:'P-1',documentDate:'2026-11-14',reason:'checked'}});
  const vendor=JSON.parse(purchase.Value).stageData.payment.vendors.v;
  assert.equal(vendor.whtBaseAmount,5310);
  assert.equal(vendor.slipUrl,'unchanged');
  assert.equal(vendor.vatStatus,'credit');
  ctx.correctFinanceTax({_actor:actor,target:{source:'TechPro',id:'expense-1',quoteId:'q',jobId:'job-1'},expected:{gross:1070},data:{vat:70,vatStatus:'credit',taxDoc:'T-1',documentDate:'2026-11-14',reason:'checked'}});
  const expense=JSON.parse(settings[0].Value).techJobs[0].expenses[0];
  assert.equal(expense.amount,1070);
  assert.equal(expense.vatAmount,70);
  assert.equal(expense.vatStatus,'credit');
});
