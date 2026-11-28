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
  assert.match(html,/ใบเสร็จรับเงิน/);
  assert.doesNotMatch(html,/VAT|ภาษีมูลค่าเพิ่ม|ใบกำกับภาษี|TAX INVOICE/i);
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
  c.retailApprovalRepair=()=>{};
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


test('request emails assigned approver once, preserves failed request, and retries existing request explicitly',()=>{
  const source=fs.readFileSync('salepro/apps-script/Code.gs','utf8');
  const q={id:'q',Title:'TEST',ClientName:'Customer <tag>',TotalAmount:1070,PricingMode:'inclusive',SaleEmail:'sale@example.com',ApproverEmail:'boss@example.com'};
  let records=[],sent=[],fail=true;
  const c=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},_uuid:()=> 'approval-q',listRows:name=>name==='Quotations'?[q]:name==='QuoteItems'?[{Title:'Service',QuoteID:'q',Quantity:1,UnitPrice:1070}]:name==='RetailReceiptApprovals'?records:[],sendEmail:mail=>{assert.equal(records[0].Status,'pending');assert.equal(records[0].EmailStatus,'sending');sent.push(mail);if(fail)throw Error('mail quota');}});
  vm.runInContext(source.slice(source.indexOf('// Advance retail receipt printing')),c);
  c.retailApprovalRepair=()=>{};
  c.retailApprovalWrite=r=>{records=[JSON.parse(JSON.stringify(r))];};
  const req={quoteId:'q',_actor:{email:'sale@example.com'},op:'request',eligible:true,company:{CompanyName:'Test',Address:'Address',TaxID:'1234567890123'}};
  let row=c.retailReceiptApproval(req).item;
  assert.equal(row.Status,'pending');assert.equal(row.EmailStatus,'failed');assert.equal(row.EmailError,'mail quota');
  assert.equal(sent[0].to,'boss@example.com');assert.equal(sent[0].replyTo,'sale@example.com');assert.equal(sent[0].textOnly,true);assert.match(sent[0].body,/1,070.00/);
  fail=false;
  assert.throws(()=>c.retailReceiptApproval({...req,op:'notify',revision:row.UpdatedAt,_actor:{email:'stranger@example.com'}}),/เฉพาะเจ้าของ/);
  row=c.retailReceiptApproval({...req,op:'notify',revision:row.UpdatedAt}).item;
  assert.equal(row.EmailStatus,'accepted');assert.equal(row.EmailError,'');assert.equal(records.length,1);assert.equal(sent.length,2);
  c.retailReceiptApproval(req);assert.equal(sent.length,2);
  assert.ok(JSON.parse(row.History).some(h=>h.action==='emailAccepted'));
  records[0].EmailStatus=''; // existing request from before mail feature
  row=c.retailReceiptApproval(req).item;assert.equal(row.EmailStatus,'accepted');assert.equal(sent.length,3);
});

test('mail UI distinguishes queued delivery, failure and pre-existing requests',()=>{
  const c=runtime();
  assert.match(c.retailApprovalEmailMessage({EmailStatus:'accepted',ApproverEmail:'boss@example.com'}),/ยังไม่ยืนยัน/);
  assert.match(c.retailApprovalEmailMessage({EmailStatus:'failed',EmailError:'quota'}),/quota/);
  assert.match(c.retailApprovalEmailMessage({}),/ยังไม่ได้ส่ง/);
});


test('assigned approver sees pending and approved requests including legacy email whitespace and may print approved copy',()=>{
  const source=fs.readFileSync('salepro/apps-script/Code.gs','utf8');
  const q={id:'q',Title:'TEST',TotalAmount:1070,PricingMode:'inclusive',SaleEmail:'sale@example.com'};
  let rows=[],issued=[];
  const c=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},listRows:n=>n==='RetailReceiptApprovals'?rows:n==='Quotations'?[q]:n==='QuoteItems'?[{QuoteID:'q',Title:'Service',Quantity:1,UnitPrice:1070}]:n==='SalesTaxInvoices'?issued:[]});
  vm.runInContext(source.slice(source.indexOf('// Advance retail receipt printing')),c);
  const snapshot=c.retailApprovalSnapshot(q,{});
  rows=[{id:'a',QuoteID:'q',Status:'approved',ApproverEmail:' BOSS@EXAMPLE.COM ',RequestedBy:'sale@example.com',UpdatedAt:'v1',Snapshot:snapshot,History:'[]'}];
  c.retailApprovalRepair=()=>{};
  c.retailApprovalWrite=r=>{rows=[JSON.parse(JSON.stringify(r))];};
  assert.equal(c.retailReceiptApproval({op:'pending',_actor:{email:'boss@example.com'}}).items.length,1);
  assert.equal(c.retailReceiptApproval({op:'pending',_actor:{email:'stranger@example.com'}}).items.length,0);
  const result=c.retailReceiptApproval({op:'print',quoteId:'q',revision:'v1',_actor:{email:'boss@example.com'}});
  assert.equal(result.item.Status,'approved');assert.equal(JSON.parse(result.item.History).at(-1).action,'print');
  issued=[{QuoteID:'q'}];assert.equal(c.retailReceiptApproval({op:'pending',_actor:{email:'boss@example.com'}}).items.length,0);
});

test('receipt queue shows on dedicated approval panel and dashboard, updates badge, and prints after approval',async()=>{
  class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.value='';}append(e){this.children.push(e);}replaceChildren(){this.children=[];}setAttribute(){}}
  const box=new Element('div'),summary=new Element('div'),c=runtime();
  c.document={getElementById:id=>({'retail-approval-list':box,'retail-dashboard-approvals':summary}[id]||null),createElement:tag=>new Element(tag)};
  c.currentUser={email:'boss@example.com'};c.stQuoteId='other';c.toast=()=>{};
  let badges=0,html='',requests=[];c.updateBadge=()=>badges++;c.printViaIframe=value=>html=value;
  const q={Title:'TEST',ClientName:'Test',PricingMode:'inclusive',TotalAmount:1070};
  const record={QuoteID:'q',Title:'AR-TEST',Status:'approved',ApproverEmail:'boss@example.com',UpdatedAt:'v1',Snapshot:JSON.stringify({quote:q,company:{},totals:c.retailReceiptTotals(q,[{Title:'Service',Quantity:1,UnitPrice:1070}])})};
  c._call=async req=>{requests.push(req);return req.op==='pending'?{items:[{...record,Status:'pending'},record]}:{item:record};};
  await c.renderRetailApprovals();assert.equal(box.children.length,2);assert.ok(badges>0);assert.match(summary.children[0].textContent,/รออนุมัติ 1/);
  const button=box.children[1].children.find(e=>e.textContent==='พิมพ์เว้นวันที่');assert.ok(button);await button.onclick();
  assert.equal(requests.find(r=>r.op==='print').quoteId,'q');assert.match(html,/ต้นฉบับลูกค้า/);assert.match(html,/____/);
});


function sheetRuntime(initial=[]){
  const source=fs.readFileSync('salepro/apps-script/Code.gs','utf8'),cells=initial.map(r=>r.slice());
  const sheet={getLastRow:()=>cells.length,getLastColumn:()=>Math.max(0,...cells.map(r=>r.length)),getRange:(row,col,height=1,width=1)=>({getValues:()=>Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>cells[row+r-1]?.[col+c-1]??'')),setNumberFormat(){return this;},setValues(values){for(let r=0;r<height;r++){cells[row+r-1]??=[];for(let c=0;c<width;c++)cells[row+r-1][col+c-1]=values[r][c];}return this;}})};
  const c=vm.createContext({ID_COL:'_id',_sheet:()=>sheet});
  vm.runInContext(source.slice(source.indexOf('function _headers('),source.indexOf('function _uuid(')),c);
  vm.runInContext(source.slice(source.indexOf('function listRows('),source.indexOf('function createRow(')),c);
  vm.runInContext(source.slice(source.indexOf('function _findRowIndex('),source.indexOf('function updateRow(')),c);
  vm.runInContext(source.slice(source.indexOf('// Advance retail receipt printing')),c);
  return {c,cells};
}

test('real sheet write uses canonical ID so listRows returns emailed requests and updates same row',()=>{
  const {c,cells}=sheetRuntime([['_id']]);
  const record={id:'approval-q',QuoteID:'q',Snapshot:'{}',Status:'pending',EmailStatus:'sending'};
  c.retailApprovalWrite(record);
  assert.equal(cells[1][0],'approval-q');assert.equal(c.listRows('RetailReceiptApprovals').length,1);
  c.retailApprovalWrite({...record,EmailStatus:'accepted'});
  assert.equal(cells.length,2);assert.equal(c.listRows('RetailReceiptApprovals')[0].EmailStatus,'accepted');
});

test('repairs legacy blank IDs using latest request per quote, preserves raw audit rows, and is idempotent',()=>{
  const header=['_id','id','QuoteID','Snapshot','Status','EmailStatus'];
  const {c,cells}=sheetRuntime([header,['','a','q','{}','pending',''],['','a','q','{}','pending','sending'],['','a','q','{}','pending','accepted'],['','b','q','{}','pending','accepted'],['','c','other','{}','pending','accepted']]);
  assert.equal(c.listRows('RetailReceiptApprovals').length,0);
  c.retailApprovalRepair();
  const records=c.listRows('RetailReceiptApprovals');assert.equal(records.length,2);
  assert.equal(records.find(r=>r.QuoteID==='q').id,'b');assert.equal(records.find(r=>r.QuoteID==='q').EmailStatus,'accepted');
  assert.equal(cells.length,6);assert.equal(cells[1][0],'');
  c.retailApprovalRepair();assert.equal(c.listRows('RetailReceiptApprovals').length,2);
  c.retailApprovalWrite({...records.find(r=>r.id==='b'),Status:'approved'});
  assert.equal(cells.length,6);assert.equal(c.listRows('RetailReceiptApprovals').find(r=>r.id==='b').Status,'approved');
});


test('receipt logo uses company settings for existing approvals, respects snapshot logo and rejects unsafe images',()=>{
  const c=runtime(),q={Title:'TEST',TotalAmount:1070,PricingMode:'inclusive'},totals=c.retailReceiptTotals(q,[{Title:'Service',Quantity:1,UnitPrice:1070}]);
  const make=company=>({Title:'AR-TEST',DocumentDate:'2026-11-27',Snapshot:JSON.stringify({quote:q,company,totals})});
  c.companySettings={LogoURL:'https://example.com/logo.png'};
  for(const copy of ['customer','company']){const html=c.buildRetailReceiptHTML(make({}),copy,true);assert.match(html,/class="company-logo" src="https:\/\/example.com\/logo.png"/);assert.match(html,/max-width:100px;max-height:50px/);}
  assert.match(c.buildRetailReceiptHTML(make({LogoURL:'https://example.com/saved.png'})),/src="https:\/\/example.com\/saved.png"/);
  c.companySettings={LogoURL:'javascript:alert(1)'};assert.doesNotMatch(c.buildRetailReceiptHTML(make({})),/<img/);
  c.companySettings={LogoBase64:'data:image/png;base64,aGVsbG8='};assert.match(c.buildRetailReceiptHTML(make({}), 'company',true,true),/src="data:image\/png;base64,aGVsbG8="/);
});


test('receipt-only layout hides tax rows in every copy while retaining gross and internal tax calculation',()=>{
  const c=runtime();
  for(const mode of ['inclusive','exclusive']){
    const q={Title:'TEST',ClientName:'Customer',PricingMode:mode,DiscountPct:10,TotalAmount:963};
    const totals=c.retailReceiptTotals(q,[{Title:'Service',Quantity:1,UnitPrice:mode==='inclusive'?1070:1000}]);
    assert.equal(totals.base,900);assert.equal(totals.vat,63);assert.equal(totals.gross,963);
    const invoice={Title:'AR-TEST',DocumentDate:'2026-11-27',Snapshot:JSON.stringify({quote:q,company:{},totals})};
    const before=JSON.stringify(invoice);
    for(const copy of ['customer','company'])for(const advance of [true,false]){
      const html=c.buildRetailReceiptHTML(invoice,copy,advance);
      assert.doesNotMatch(html,/VAT|ภาษีมูลค่าเพิ่ม|TAX INVOICE|ใบกำกับภาษี/i);
      assert.match(html,/963.00/);assert.match(html,/เก้าร้อยหกสิบสามบาทถ้วน/);
      assert.match(html,/ผู้รับใบเสร็จ/);assert.match(html,/ผู้มีอำนาจลงนาม/);
    }
    assert.equal(JSON.stringify(invoice),before);
  }
});


test('paired receipt prints original and company copy on one landscape sheet with identical numbers',()=>{
  const c=runtime(),q={Title:'JK-PAIR',ClientName:'Customer',TotalAmount:1070,PricingMode:'inclusive'};
  const invoice={Title:'AR-PAIR',DocumentDate:'2026-11-28',Snapshot:JSON.stringify({quote:q,company:{CompanyName:'Test'},totals:c.retailReceiptTotals(q,[{Title:'Service',Quantity:1,UnitPrice:1070}])})};
  const html=c.buildRetailReceiptHTML(invoice,'company',true);
  assert.match(html,/@page\{size:A4 landscape/);
  assert.equal((html.match(/<article class="receipt-copy"/g)||[]).length,2);
  assert.equal((html.match(/data-copy="customer"/g)||[]).length,1);assert.equal((html.match(/data-copy="company"/g)||[]).length,1);
  assert.equal((html.match(/เลขที่ <span class="under">AR-PAIR/g)||[]).length,2);
  assert.equal((html.match(/1,070.00/g)||[]).length,4);
  assert.match(html,/แนวตัด/);assert.match(html,/border-left:1px dashed/);assert.doesNotMatch(html,/VAT|ภาษีมูลค่าเพิ่ม/);
});


test('receipt shows saved product descriptions, quantities and final line amounts on both copies',()=>{
 const c=runtime(),q={Title:'TEST',TotalAmount:11128},items=[{Title:'UPS T-1500',Description:'1500VA / 1350W\nWarranty 1 year',Quantity:1,Unit:'เครื่อง',UnitPrice:3400},{Title:'UPS T-3000',Description:'3000VA / 2700W',Quantity:1,Unit:'เครื่อง',UnitPrice:7000}];
 const totals=c.retailReceiptTotals(q,items),invoice={Title:'AR-TEST',DocumentDate:'2026-11-28',Snapshot:JSON.stringify({quote:q,company:{},totals})};const before=invoice.Snapshot;
 const html=c.buildRetailReceiptHTML(invoice,'both',true);
 assert.equal((html.match(/class="receipt-product"/g)||[]).length,4);
 for(const value of ['UPS T-1500','UPS T-3000','1500VA / 1350W','Warranty 1 year','จำนวน 1 เครื่อง','3,638.00','7,490.00'])assert.ok(html.includes(value),value);
 assert.equal(invoice.Snapshot,before);assert.doesNotMatch(html,/VAT|ภาษีมูลค่าเพิ่ม/);
});

test('line totals reconcile to saved gross after line and quotation discounts with exact rounding',()=>{
 const c=runtime(),q={PricingMode:'inclusive',DiscountPct:10,TotalAmount:0.09};
 const totals=c.retailReceiptTotals(q,[{Title:'A',Quantity:1,UnitPrice:0.05},{Title:'B',Quantity:1,UnitPrice:0.05}]);
 const amounts=c.retailReceiptLineAmounts(totals);assert.equal(Math.round(amounts.reduce((s,v)=>s+v,0)*100),9);assert.deepEqual(Array.from(amounts),[0.05,0.04]);
 const other=c.retailReceiptTotals({TotalAmount:1444.5,DiscountPct:10},[{Title:'A',Quantity:2,UnitPrice:1000,DiscountPct:25}]);assert.equal(c.retailReceiptLineAmounts(other)[0],1444.5);
});
