// Stable IDs link cash entries to sales work; titles alone are never used to infer a match.
const FinanceRelationships={
  workExpenses(settings,quotes){
    const rows=[],seen=new Set();
    for(const row of [...new Map(settings.map(r=>[r.Title,r])).values()]){
      if(!String(row.Title||'').startsWith('DealStatus_'))continue;
      const quoteId=row.Title.slice('DealStatus_'.length),d=JSON.parse(row.Value||'{}');
      const add=(e,source,job)=>{
        const key=source+':'+quoteId+':'+(job?.id||'sale')+':'+(e.id||e.ts||JSON.stringify(e));if(seen.has(key))return;seen.add(key);
        const amount=Number(e.amount)||0;if(amount<=0)return;
        rows.push({...this.resolve({QuoteID:quoteId},quotes),_id:key,date:String(e.date||e.ts||job?.scheduledAt||'').slice(0,10),type:'expense',category:e.cat||e.category||'ค่าใช้จ่ายหน้างาน',amount,party:job?.techName||e.by||'ทีมงาน',method:e.method||'',note:e.detail||e.desc||e.description||'',docUrl:e.receiptUrl||'',docName:e.receiptName||'ใบเสร็จ',source});
      };
      (d.expenses||[]).forEach(e=>add(e,'SaleExpense'));
      (d.techJobs||[]).forEach((j,i)=>(j.expenses||[]).forEach(e=>add(e,'TechPro',{...j,id:j.id||'job-'+i})));
    }
    return rows;
  },
  resolve(record,quotes,jobs=[],ext={}){
    const purchaseId=String(record.PurchaseID||record.purchaseId||'');
    const job=jobs.find(p=>String(p.id)===purchaseId);
    const ref=ext.stageData?.purchasePurpose==='sale'?ext.stageData.salesReference:null;
    const quoteId=String(record.QuoteID||record.quoteId||job?.quoteId||ref?.id||'');
    const q=quotes.find(q=>String(q.id)===quoteId);
    return {quoteId,quoteTitle:q?.Title||ref?.title||record.QuoteTitle||'',quoteCustomer:q?.ClientName||ref?.client||'',purchaseId};
  }
};
