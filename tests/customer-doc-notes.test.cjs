const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){const c=vm.createContext({console,Date,Map,Set,setTimeout,clearTimeout,document:{},window:{addEventListener(){}},escHtml:s=>String(s??''),fmtDate:String,companySettings:{},currentUser:{},quotesData:[]});for(const file of ['salepro/js/pages/saletracker.js','salepro/js/pages/pdf.js','salepro/js/pages/retail-receipt.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);return c;}
const quote={id:'q',Title:'JK-TEST',ClientName:'Customer',TotalAmount:1070,Note:'กรุณานัดหมายก่อนจัดส่ง\nติดต่อคุณทดสอบ <test> & ทีมงาน',Terms:'ชำระภายใน 30 วัน\nแจ้งหลังโอนเงิน'};
const items=[{Title:'Service',Quantity:1,UnitPrice:1000}];

test('invoice, delivery and receipt include quote notes and payment terms in every copy, escaping markup',()=>{
 const c=runtime();for(const kind of ['tax','delivery','receipt','tempdelivery'])for(const copy of ['customer','acct','company']){
  const html=c.buildCustomerDocHTML(kind,copy,quote,items,{},{},null,'อ้างอิงเอกสารเดิม');
  assert.match(html,/กรุณานัดหมายก่อนจัดส่ง\nติดต่อคุณทดสอบ &lt;test&gt; &amp; ทีมงาน/);assert.match(html,/ชำระภายใน 30 วัน\nแจ้งหลังโอนเงิน/);assert.match(html,/white-space:pre-line;overflow-wrap:anywhere/);assert.match(html,/อ้างอิงเอกสารเดิม/);assert.doesNotMatch(html,/<test>/);
 }
});

test('default customer document notes remain when quotation notes or terms are blank',()=>{
 const c=runtime(),html=c.buildCustomerDocHTML('receipt','customer',{...quote,Note:'',Terms:''},items,{},{},null,'');
 assert.match(html,/สินค้าจำหน่ายแล้วไม่รับเปลี่ยนคืน/);assert.match(html,/โปรดชำระเงินด้วยเช็ค/);
});

test('paired receipt inherits notes on legacy records and repeats them once per copy without changing totals',()=>{
 const c=runtime();c.quotesData=[quote];const totals=c.retailReceiptTotals(quote,items),invoice={QuoteID:'q',Title:'AR-TEST',DocumentDate:'2026-11-28',Snapshot:JSON.stringify({quote:{Title:quote.Title,ClientName:quote.ClientName},company:{},totals})},before=JSON.stringify(invoice);
 const html=c.buildRetailReceiptHTML(invoice,'both',true);
 assert.equal((html.match(/class="receipt-remarks"/g)||[]).length,2);assert.equal((html.match(/กรุณานัดหมายก่อนจัดส่ง/g)||[]).length,2);assert.match(html,/&lt;test&gt; &amp; ทีมงาน/);assert.equal(JSON.stringify(invoice),before);assert.equal(totals.gross,1070);
 const saved={...invoice,Snapshot:JSON.stringify({quote:{...quote,Note:'หมายเหตุฉบับที่บันทึก'},company:{},totals})};assert.match(c.buildRetailReceiptHTML(saved),/หมายเหตุฉบับที่บันทึก/);assert.doesNotMatch(c.buildRetailReceiptHTML(saved),/กรุณานัดหมายก่อนจัดส่ง/);
});


const inserted='Scope of work\n- Free delivery within Bangkok area.\n- Calibration & configuration <test>.';
const noteRow={id:'n1',Title:'__NOTE__',QuoteID:'q',Description:inserted,Quantity:0,UnitPrice:0};

test('inserted tool notes stay between product rows, have no price or item number, and do not affect totals',()=>{
 const c=runtime(),list=[{...items[0],Title:'Product before'},noteRow,{...items[0],Title:'Product after'}];
 for(const kind of ['tax','delivery','receipt','tempdelivery']){
  const html=c.buildCustomerDocHTML(kind,'customer',{...quote,TotalAmount:2140},list,{},{},null,'');
  assert.ok(html.indexOf('Product before')<html.indexOf('Scope of work'));assert.ok(html.indexOf('Scope of work')<html.indexOf('Product after'));
  assert.match(html,/Calibration &amp; configuration &lt;test&gt;/);assert.doesNotMatch(html,/__NOTE__/);
  assert.equal((html.match(/class="inserted-document-note"/g)||[]).length,1);
  if(kind!=='tempdelivery')assert.match(html,/2,140.00/);
 }
});

test('document loading includes inserted notes only when requested, with manual layout seed retaining note type',async()=>{
 const c=runtime();vm.runInContext("stQuoteId='q';",c);c.CONFIG={lists:{quoteItems:'QuoteItems'}};c.getListItems=async()=>[{...items[0],QuoteID:'q'},noteRow,{...noteRow,QuoteID:'other'}];
 assert.equal((await c.getQuoteItemsForST()).length,1);const loaded=await c.getQuoteItemsForST(true);assert.equal(loaded.length,2);
 c.loaded=loaded;vm.runInContext('_cdItemsCache=loaded;',c);const rows=c._cdSeedRowsFromItems();assert.equal(rows[1].t,'note');assert.equal(rows[1].desc,inserted);assert.equal(rows[1].sourceItemId,'n1');
});

test('old manual layouts recover missing tool notes without duplicating notes already seeded or edited',()=>{
 const c=runtime(),manual={on:true,rows:[{t:'item',name:'Service',qty:1,price:1000,amount:1000}]};
 let html=c.buildCustomerDocHTML('receipt','customer',quote,[...items,noteRow],{},{},manual,'');assert.equal((html.match(/Scope of work/g)||[]).length,1);
 manual.rows.push({t:'note',desc:inserted,sourceItemId:'n1'});html=c.buildCustomerDocHTML('receipt','customer',quote,[...items,noteRow],{},{},manual,'');assert.equal((html.match(/Scope of work/g)||[]).length,1);
 manual.rows[1].desc='Edited scope';html=c.buildCustomerDocHTML('receipt','customer',quote,[...items,noteRow],{},{},manual,'');assert.match(html,/Edited scope/);assert.doesNotMatch(html,/Scope of work/);
});

test('paired receipt retrieves tool notes for older approvals and preserves the saved financial snapshot',async()=>{
 const c=runtime(),invoice={QuoteID:'q',Title:'AR-TEST',DocumentDate:'2026-11-28',Snapshot:JSON.stringify({quote:{Title:'JK-TEST'},company:{},totals:c.retailReceiptTotals(quote,items)})};
 const snapshot=JSON.parse(invoice.Snapshot);delete snapshot.totals.documentNotes;invoice.Snapshot=JSON.stringify(snapshot);const before=invoice.Snapshot;
 c.CONFIG={lists:{quoteItems:'QuoteItems'}};c.getListItems=async()=>[noteRow,{...noteRow,QuoteID:'other'}];
 const html=await c.buildRetailReceiptPrintHTML(invoice,'both',true);assert.equal((html.match(/Scope of work/g)||[]).length,2);assert.doesNotMatch(html,/__NOTE__/);assert.equal(invoice.Snapshot,before);assert.match(html,/1,070.00/);
 const totals=c.retailReceiptTotals(quote,[...items,noteRow]);assert.equal(totals.gross,1070);assert.equal(totals.documentNotes[0],inserted);
});
