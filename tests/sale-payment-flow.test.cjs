const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');const core=fs.readFileSync('shared/sale-payment-core.js','utf8'),source=fs.readFileSync('salepro/js/pages/saletracker.js','utf8');
test('tracker saves cash and WHT fields while closing invoice at gross settlement',async()=>{const writes=[],updates=[],els={},el=id=>els[id]||(els[id]={value:'',style:{}}),c=vm.createContext({console,Date,document:{getElementById:el},CONFIG:{lists:{payments:'Payments',quotations:'Quotations'}},currentUser:{displayName:'Sales'},fmt:String,toast:(m,t)=>{if(t==='error')throw Error(m);},createListItem:async(l,f)=>writes.push(f),updateListItem:async(l,id,f)=>updates.push(f),renderQuotes(){},sendPaymentCompleteEmail:async()=>{},saveSTDealData:async()=>{},clearSTSlip(){},renderWHTHint(){},renderSTPaySummary(){},renderSTPayHistory(){},renderSTTimeline(){}});vm.runInContext(core,c);vm.runInContext("let stQuoteId='q',stCurrentSlipFile=null,stDealData={},paymentsCache=[],quotesData=[{id:'q',TotalAmount:9095,PaidAmount:0,Status:'PO Received'}]",c);vm.runInContext(source.slice(source.indexOf('function calculateSTPayment('),source.indexOf('// ---- PROCUREMENT ----')),c);el('st-pay-amount').value='9095';el('st-pay-wht').value='3';el('st-pay-date').value='2026-11-14';await c.saveSTPayment();assert.equal(writes[0].ReceivedAmount,8840);assert.equal(writes[0].WHTAmount,255);assert.equal(writes[0].AmountPaid,9095);assert.equal(updates[0].PaidAmount,9095);assert.equal(updates[0].Status,'Closed');assert.equal(vm.runInContext('paymentsCache[0].ReceivedAmount',c),8840);});
test('Finance imports only cash 8840 while retaining withholding and quotation relation',async()=>{const c=vm.createContext({Date,console,AppStorage:{getItem:()=>null},CONFIG:{lists:{financeTx:'Tx',financeReq:'Req',financeCat:'Cat',payments:'Payments',quotations:'Quotations',settings:'Settings',procurement:'Procurement'}},BankDetails:{read:()=>({})},getListItems:async l=>l==='Payments'?[{QuoteID:'q',PaymentDate:'2026-11-14',AmountPaid:9095,ReceivedAmount:8840,PaymentVersion:'2',WHTAmount:255,SlipURL:'https://example.test/slip',WHTCertificateURL:'https://example.test/certificate'}]:l==='Quotations'?[{id:'q',Title:'JK13'}]:[]});vm.runInContext(core,c);vm.runInContext(fs.readFileSync('finance/js/relationships.js','utf8'),c);vm.runInContext(fs.readFileSync('finance/js/app.js','utf8'),c);await c.loadAll();const rows=c.allEntries();assert.equal(rows.length,1);assert.equal(rows[0].amount,8840);assert.equal(rows[0].whtAmount,255);assert.equal(rows[0].settledAmount,9095);assert.equal(rows[0].quoteTitle,'JK13');assert.equal(rows[0].docUrl,'https://example.test/slip');assert.equal(rows[0].whtCertificateUrl,'https://example.test/certificate');});

test('payment uploads keep slip and private certificate distinct and surface upload failures', async () => {
  const uploads = [];
  const ctx = vm.createContext({
    toast() {},
    fileToBase64: async file => 'data:' + file.type + ';base64,ZmFrZQ==',
    apiPost: async (action, list, id, payload) => {
      uploads.push(payload);
      return { fileUrl: 'https://example.test/slip' };
    },
    _call: async payload => {
      uploads.push(payload);
      return { fileUrl: 'https://example.test/certificate' };
    },
  });
  vm.runInContext(fs.readFileSync('salepro/js/pages/payment.js', 'utf8'), ctx);
  const slip = { name: 'slip.png', type: 'image/png', size: 20 };
  const certificate = { name: 'certificate.pdf', type: 'application/pdf', size: 30 };
  const fields = await ctx.uploadPaymentAttachments('PAY-1', slip, certificate);
  assert.equal(fields.SlipURL, 'https://example.test/slip');
  assert.equal(fields.WHTCertificateURL, 'https://example.test/certificate');
  assert.equal(uploads[0].base64Data, 'ZmFrZQ==');
  assert.equal(uploads[1].base64, 'ZmFrZQ==');
  assert.equal(uploads[1].privateFile, true);
  ctx._call = async () => { throw Error('upload failed'); };
  await assert.rejects(ctx.uploadPaymentAttachments('PAY-2', null, certificate), /upload failed/);
});
