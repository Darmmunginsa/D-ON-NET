// Stable IDs link cash entries to sales work; titles alone are never used to infer a match.
const FinanceRelationships={
  resolve(record,quotes,jobs=[],ext={}){
    const purchaseId=String(record.PurchaseID||record.purchaseId||'');
    const job=jobs.find(p=>String(p.id)===purchaseId);
    const ref=ext.stageData?.purchasePurpose==='sale'?ext.stageData.salesReference:null;
    const quoteId=String(record.QuoteID||record.quoteId||job?.quoteId||ref?.id||'');
    const q=quotes.find(q=>String(q.id)===quoteId);
    return {quoteId,quoteTitle:q?.Title||ref?.title||record.QuoteTitle||'',quoteCustomer:q?.ClientName||ref?.client||'',purchaseId};
  }
};
