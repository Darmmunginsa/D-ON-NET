// Read-only purchase rollup. Purchase payments are a settlement of cost, not a second expense.
const PurchaseExpenseSummary=(()=>{
  const amount=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  function build(quoteId,settings,procurement,payments,financeTx=[],financeReq=[]){
    const records=new Map();for(const row of [...settings,...procurement])records.set(row.Title,row);
    const parse=key=>{const row=records.get(key);return row?JSON.parse(row.Value||'{}'):null;};
    const jobs=parse('Procurements')||[];if(!Array.isArray(jobs))throw Error('ข้อมูลรายการจัดซื้อไม่ถูกต้อง');
    const seen=new Set(),rows=[];
    for(const p of jobs){
      if(seen.has(String(p.id)))continue;seen.add(String(p.id));
      const ext=parse('Purchase_'+p.id)||{},sd=ext.stageData||{},ref=sd.purchasePurpose==='sale'?sd.salesReference:null;
      if(String(p.quoteId||'')!==String(quoteId)&&String(ref?.id||'')!==String(quoteId))continue;
      if(['cancelled','canceled'].includes(String(ext.status||p.status||'').toLowerCase())||ext.cancelled||p.cancelled)continue;
      const payments=Object.values(sd.payment?.vendors||{}),paid=payments.reduce((n,v)=>n+amount(v.amount),0);
      const stage=Math.max(Number(ext.maxStage)||0,Number(ext.stage)||1);
      const ordered=sd.approval?.status==='approved'||paid>0||(stage>=6&&Object.values(sd.po?.vendorDocs||{}).some(v=>v.poNo));
      const value=sd.po?.total!=null?amount(sd.po.total):p.total!=null?amount(p.total):(p.items||[]).reduce((n,i)=>n+amount(i.qty)*amount(i.cost),0);
      rows.push({id:String(p.id),title:p.quoteTitle||'',vendor:ext.vendorName||p.vendorName||'',amount:value,paid,ordered,date:String(p.createdAt||'').split('T')[0],items:(p.items||[]).map(i=>i.name||'').join(', ')});
    }
    const receipts=payments.filter(p=>String(p.QuoteID)===String(quoteId)).map(p=>({id:p.id||p._id,date:String(p.PaymentDate||'').slice(0,10),cash:SalePaymentCore.cash(p),wht:Number(p.WHTAmount)||0,reference:p.Reference||'',docUrl:p.SlipURL||p.SlipUrl||''}));
    const finance=financeTx.filter(t=>String(t.QuoteID||'')===String(quoteId)).map(t=>({id:String(t.id||t._id),date:String(t.Date||'').slice(0,10),type:t.TxType||'expense',amount:amount(t.Amount),cat:t.Category||'Finance',detail:(t.Party||'')+' · '+(t.Note||''),receiptUrl:t.DocURL||''}));
    financeReq.filter(r=>r.Status==='Paid'&&String(r.QuoteID||'')===String(quoteId)).forEach(r=>finance.push({id:'req-'+String(r.id||r._id),date:String(r.PaidDate||r.Date||'').slice(0,10),type:'expense',amount:amount(r.Amount),cat:'เบิกจ่าย',detail:(r.ReqNo||'')+' · '+(r.Reason||''),receiptUrl:r.DocURL||''}));
    return {finance,receipts,rows,total:rows.filter(r=>r.ordered).reduce((n,r)=>n+r.amount,0),paid:rows.reduce((n,r)=>n+r.paid,0),pending:rows.filter(r=>!r.ordered).reduce((n,r)=>n+r.amount,0),received:payments.filter(p=>String(p.QuoteID)===String(quoteId)).reduce((n,p)=>n+SalePaymentCore.cash(p),0)+finance.filter(t=>t.type==='income').reduce((n,t)=>n+t.amount,0)};
  }
  return {build};
})();
let expensePurchaseState=null,expensePurchaseRequest=0;
function ensureExpensePurchases(force=false){
  const quoteId=String(stQuoteId||''),owner=currentUser?.email;if(!quoteId||!owner)return;
  if(!force&&expensePurchaseState?.quoteId===quoteId&&expensePurchaseState.owner===owner)return;
  const request=++expensePurchaseRequest;expensePurchaseState={quoteId,owner,status:'loading'};
  getListItemsMulti([CONFIG.lists.procurement,CONFIG.lists.settings,CONFIG.lists.payments,'FinanceTx','FinanceReq'],{strict:true}).then(data=>{
    if(request!==expensePurchaseRequest||String(stQuoteId)!==quoteId||currentUser?.email!==owner)return;
    const summary=PurchaseExpenseSummary.build(quoteId,data[CONFIG.lists.settings]||[],data[CONFIG.lists.procurement]||[],data[CONFIG.lists.payments]||[],data.FinanceTx||[],data.FinanceReq||[]);
    expensePurchaseState={quoteId,owner,status:'ready',summary};renderExpenseTab();
  }).catch(e=>{if(request!==expensePurchaseRequest||String(stQuoteId)!==quoteId||currentUser?.email!==owner)return;expensePurchaseState={quoteId,owner,status:'error',error:e.message};renderExpenseTab();});
}
function refreshExpensePurchases(){ensureExpensePurchases(true);renderExpenseTab();}
