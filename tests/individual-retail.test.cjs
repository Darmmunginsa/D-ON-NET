const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function runtime(){
  const c=vm.createContext({console,Date,Map,Set,setTimeout,clearTimeout,document:{},window:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('salepro/js/pages/pdf.js','utf8'),c);
  vm.runInContext(fs.readFileSync('salepro/js/pages/retail-receipt.js','utf8'),c);
  return c;
}
test('inclusive individual price, quotation PDF and retail receipt agree on 1070 gross and 70 VAT',()=>{
  const c=runtime();
  const q={id:'q',Title:'SAMPLE',CustomerType:'individual',PricingMode:'inclusive',ClientName:'ลูกค้าตัวอย่าง',TotalAmount:1070};
  const items=[{Title:'งานบริการ',Quantity:1,Unit:'งาน',UnitPrice:1070,DiscountPct:0}];
  const totals=c.retailReceiptTotals(q,items);
  assert.equal(totals.base,1000);
  assert.equal(totals.vat,70);
  assert.equal(totals.gross,1070);
  const pdf=c.buildPDFData(q,items);
  assert.equal(pdf.vat,70);
  assert.equal(pdf.grand,1070);
  const invoice={Title:'AR-SAMPLE',DocumentDate:'2026-11-26',Snapshot:JSON.stringify({quote:q,company:{CompanyName:'บริษัท ตัวอย่าง',TaxID:'1234567890123'},totals})};
  const html=c.buildRetailReceiptHTML(invoice);
  assert.match(html,/ใบเสร็จรับเงิน\/ใบกำกับภาษีอย่างย่อ/);
  assert.match(html,/ราคาสินค้า\/ค่าบริการสุทธิรวมภาษีมูลค่าเพิ่มแล้ว/);
  assert.match(html,/หนึ่งพันเจ็ดสิบบาทถ้วน/);
  assert.match(c.buildRetailReceiptHTML(invoice,'company'),/สำเนาบริษัท/);
});
test('retail invoice rejects stale or incomplete line amounts and supports exclusive prices',()=>{
  const c=runtime();
  const items=[{Title:'Battery',Quantity:1,UnitPrice:1000}];
  const totals=c.retailReceiptTotals({TotalAmount:1070},items);
  assert.equal(totals.base,1000);
  assert.equal(totals.vat,70);
  assert.throws(()=>c.retailReceiptTotals({TotalAmount:1000},items),/ยอดรายการ/);
  assert.throws(()=>c.retailReceiptTotals({TotalAmount:1070},[{...items[0],Quantity:-1}]),/ตรวจจำนวน/);
});
test('retail receipt blocks issue without full payment and reprints its saved snapshot without another invoice',async()=>{
  const c=runtime();
  const controls={
    'cpo-retail-eligible':{checked:true},'cpo-retail-date':{value:'2026-11-26'},
    'cpo-retail-status':{},'cpo-copy':{value:'customer'},
  };
  c.document={getElementById:id=>controls[id]};
  c.quotesData=[{id:'q',Title:'SAMPLE',TotalAmount:1070,PricingMode:'inclusive'}];
  c.stQuoteId='q';c.canManageSaleActions=()=>true;c.CONFIG={lists:{payments:'Payments',quoteItems:'QuoteItems'}};
  let writes=0,preview='',lastError='';
  c._call=async()=>({item:null});
  c.currentUser={email:'test@example.com'};
  c.companySettings={CompanyName:'บริษัท ตัวอย่าง',Address:'ที่อยู่ตัวอย่าง',TaxID:'1234567890123'};
  c.toast=message=>lastError=message;
  c.getListItems=async table=>table==='Payments'?[{QuoteID:'q',AmountPaid:500}]:[];
  c.createListItem=async()=>{writes++;};
  await c.issueRetailReceipt();
  assert.equal(writes,0);
  assert.match(lastError,/รับเงินให้ครบ/);
  const totals=c.retailReceiptTotals(c.quotesData[0],[{Title:'Service',Quantity:1,UnitPrice:1070}]);
  const invoice={Title:'AR-SAMPLE',QuoteID:'q',DocumentType:'abbreviated',DocumentDate:'2026-11-26',Snapshot:JSON.stringify({quote:c.quotesData[0],company:c.companySettings,totals})};
  c.getListItems=async()=>[invoice];
  c.printViaIframe=html=>preview=html;
  await c.issueRetailReceipt();
  assert.equal(writes,0);
  assert.match(preview,/AR-SAMPLE/);
});


test('server rejects unpaid and duplicate abbreviated invoices while releasing its write lock',()=>{
  const source=fs.readFileSync('salepro/apps-script/Code.gs','utf8');
  const body=source.slice(source.indexOf('function createRow('),source.indexOf('function batchCreate('));
  let released=0,paid=500,invoices=[];
  const c=vm.createContext({validateServiceFields(){},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released++;}})},_sheet:()=>({}),listRows:name=>name==='Quotations'?[{id:'q',TotalAmount:1070}]:name==='Payments'?[{QuoteID:'q',AmountPaid:paid}]:invoices});
  vm.runInContext(body,c);
  const fields={Title:'AR-SAMPLE',QuoteID:'q',DocumentType:'abbreviated',TaxDate:'2026-11-26',DocumentDate:'2026-11-26',BaseAmount:1000,VatAmount:70,GrossAmount:1070,Snapshot:JSON.stringify({totals:{base:1000,vat:70}})};
  assert.throws(()=>c.createRow('SalesTaxInvoices',fields),/ยังรับชำระไม่ครบ/);
  assert.equal(released,1);
  paid=1070;invoices=[{QuoteID:'q',DocumentType:'full'}];
  assert.throws(()=>c.createRow('SalesTaxInvoices',fields),/มีใบกำกับภาษีแล้ว/);
  assert.equal(released,2);
  invoices=[{QuoteID:'q',DocumentType:'abbreviated'}];
  assert.throws(()=>c.createRow('SalesTaxInvoices',{...fields,DocumentType:'full'}),/ออกใบกำกับอย่างย่อแล้ว/);
  assert.equal(released,3);
});

test('manual customer document hints extract included VAT after quote discount',()=>{
  const c=vm.createContext({console,document:{},window:{addEventListener(){}},setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync('salepro/js/pages/saletracker.js','utf8'),c);
  vm.runInContext("_cdQCache={PricingMode:'inclusive',DiscountPct:10,TotalAmount:963};_cdManualSum=()=>1070;",c);
  const hint=c._cdWarnHtml();
  assert.match(hint,/900.00/);assert.match(hint,/63.00/);assert.match(hint,/963.00/);
  assert.doesNotMatch(hint,/ยอดไม่ตรง/);
});


test('advance print leaves date blank and does not claim payment was received',()=>{
  const c=runtime(),q={Title:'TEST',TotalAmount:1070,PricingMode:'inclusive'};
  const invoice={Title:'AR-TEST',DocumentDate:'',Snapshot:JSON.stringify({quote:q,company:{},totals:c.retailReceiptTotals(q,[{Title:'Service',Quantity:1,UnitPrice:1070}])})};
  const html=c.buildRetailReceiptHTML(invoice,'customer',true);
  assert.match(html,/____ \/ ____ \/ ______/);assert.doesNotMatch(html,/รับเงินรวม VAT แล้ว/);
  assert.match(c.buildRetailReceiptHTML(invoice,'company',true,true),/ฉบับตรวจสอบ/);
});

test('advance approval enforces assigned actor, revision, stale quote and print history without invoices or payments',()=>{
  const source=fs.readFileSync('salepro/apps-script/Code.gs','utf8');
  const quote={id:'q',Title:'TEST',ClientName:'Test',TotalAmount:1070,PricingMode:'inclusive',SaleEmail:'sale@example.com',ApproverEmail:'boss@example.com'};
  const items=[{Title:'Service',QuoteID:'q',Quantity:1,UnitPrice:1070}];let records=[],released=0;
  const c=vm.createContext({console,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released++;}})},_uuid:()=> 'approval-q',listRows:name=>name==='Quotations'?[quote]:name==='QuoteItems'?items:name==='RetailReceiptApprovals'?records:[]});
  vm.runInContext(source.slice(source.indexOf('// Advance retail receipt printing')),c);
  c.retailApprovalWrite=r=>{records=[JSON.parse(JSON.stringify(r))];};
  const req={quoteId:'q',_actor:{email:'sale@example.com'},op:'request',eligible:true,company:{CompanyName:'Test',Address:'Address',TaxID:'1234567890123'}};
  let row=c.retailReceiptApproval(req).item;assert.equal(row.Status,'pending');
  assert.throws(()=>c.retailReceiptApproval({...req,op:'print',revision:row.UpdatedAt}),/อนุมัติก่อนพิมพ์/);
  assert.throws(()=>c.retailReceiptApproval({...req,op:'approve',revision:row.UpdatedAt}),/เฉพาะผู้อนุมัติ/);
  assert.throws(()=>c.retailReceiptApproval({...req,op:'approve',revision:'old',_actor:{email:'boss@example.com'}}),/ข้อมูลเปลี่ยน/);
  row=c.retailReceiptApproval({...req,op:'approve',revision:row.UpdatedAt,_actor:{email:'boss@example.com'}}).item;
  assert.equal(row.Status,'approved');
  row=c.retailReceiptApproval({...req,op:'print',revision:row.UpdatedAt}).item;
  assert.equal(JSON.parse(row.History).at(-1).action,'print');
  items[0].Title='Changed';
  assert.throws(()=>c.retailReceiptApproval({...req,op:'print',revision:row.UpdatedAt}),/รายละเอียดงานเปลี่ยน/);
  row=c.retailReceiptApproval({...req,op:'withdraw',revision:row.UpdatedAt}).item;
  assert.equal(row.Status,'rejected');
  row=c.retailReceiptApproval(req).item;assert.equal(row.Status,'pending');
  assert.ok(JSON.parse(row.History).length>=5);assert.ok(released>=8);
});
