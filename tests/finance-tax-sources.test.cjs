const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');function runtime(){const c=vm.createContext({Date,console,fmt:v=>Number(v||0).toFixed(2),esc:String,allEntries:()=>[],inPeriod:()=>true});vm.runInContext(fs.readFileSync('finance/js/tax.js','utf8'),c);vm.runInContext("let finTx=[],impTax=[],_period='all'",c);return {c,run:s=>vm.runInContext(s,c)};}
test('imported SalePro snapshot contributes sales VAT 595 and WHT 255 with detail rows',()=>{const r=runtime();r.run("impTax=[{TaxVersion:'1',Date:'2026-11-14',TaxDate:'2026-11-14',TxType:'income',VatAmount:595,WhtAmount:255,WhtRate:3,Amount:8840,quoteTitle:'JK13',_source:'SalePro',_vatKnown:true}]");const rows=r.c.financeTaxRows(),tot=r.c.financeTaxTotals(rows);assert.equal(tot.sales,595);assert.equal(tot.credit,255);const html=r.c.renderFinanceTaxReport();assert.match(html,/595.00/);assert.match(html,/255.00/);assert.match(html,/JK13/);assert.match(html,/SalePro/);});
test('purchase withholding is included even when purchase VAT is unknown',()=>{const r=runtime();r.run("impTax=[{TaxVersion:'1',Date:'2026-11-14',TaxDate:'2026-11-14',TxType:'expense',VatAmount:0,WhtAmount:26.55,WhtRate:0.5,_source:'PurchasePro',_vatKnown:false}]");const tot=r.c.financeTaxTotals(r.c.financeTaxRows());assert.equal(tot.purchase,0);assert.equal(tot.withheld,26.55);assert.match(r.c.renderFinanceTaxReport(),/เราหักผู้ขาย 0.5%/);});
test('manual and imported tax rows are combined without adding cash amounts into VAT totals',()=>{const r=runtime();r.run("finTx=[{TaxVersion:'1',Date:'2026-11-14',TaxDate:'2026-11-14',TxType:'expense',VatAmount:70,VatEligible:'true'}];impTax=[{TaxVersion:'1',Date:'2026-11-14',TaxDate:'2026-11-14',TxType:'income',VatAmount:595,Amount:8840,_vatKnown:true}]");const t=r.c.financeTaxTotals(r.c.financeTaxRows());assert.equal(t.sales,595);assert.equal(t.purchase,70);});

test('Finance counts a sales invoice once across installments and keeps withholding on each receipt', async () => {
  const common = { QuoteID: 'q', TaxInvoiceId: 'tax-1', TaxDocumentMode: 'document', PaymentVatAmount: 297.5, PaymentVersion: '2' };
  const sheets = {
    Payments: [
      { ...common, PaymentDate: '2026-11-12', AmountPaid: 4547.5, WHTAmount: 127.5, WHTPercent: 3, ReceivedAmount: 4420 },
      { ...common, PaymentDate: '2026-11-14', AmountPaid: 4547.5, WHTAmount: 127.5, WHTPercent: 3, ReceivedAmount: 4420 },
      { QuoteID: 'q', PaymentDate: '2026-11-15', AmountPaid: 107, PaymentVatAmount: 7 },
    ],
    SalesTaxInvoices: [{ id: 'tax-1', QuoteID: 'q', Title: 'TAX-1', TaxDate: '2026-11-11', VatAmount: 595, BaseAmount: 8500 }],
    Quotations: [{ id: 'q', Title: 'JK13' }],
  };
  const ctx = vm.createContext({
    Date, console, CONFIG: { lists: { payments: 'Payments', quotations: 'Quotations' } },
    AppStorage: { getItem: () => null }, BankDetails: { read: () => ({}) },
    getListItems: async key => sheets[key] || [],
  });
  for (const path of ['shared/sale-payment-core.js', 'finance/js/tax.js', 'finance/js/relationships.js', 'finance/js/app.js']) {
    vm.runInContext(fs.readFileSync(path, 'utf8'), ctx);
  }
  vm.runInContext("_period='all'", ctx);
  await ctx.loadAll();
  const totals = ctx.financeTaxTotals(ctx.financeTaxRows());
  assert.equal(totals.sales, 595);
  assert.equal(totals.credit, 255);
  const entries = ctx.allEntries();
  assert.equal(entries[0].taxDoc, 'TAX-1');
  assert.equal(entries[1].amount, 4420);
  assert.equal(entries[2].taxKnown, false);
});
