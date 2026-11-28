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
