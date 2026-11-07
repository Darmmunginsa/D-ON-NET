(function(root){'use strict';
 const name=v=>String(v||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase(),tax=v=>String(v||'').replace(/\D/g,'');
 function resolve(form,profiles){
   const n=name(form.name),t=tax(form.tax);if(!n)return null;
   const named=profiles.filter(p=>[p.Title,p.nameEN].some(v=>name(v)===n));
   if(t.length===13){
     if(named.length&&named.every(p=>tax(p.TaxID)!==t))return null;
     const matches=profiles.filter(p=>tax(p.TaxID)===t),profile=matches.find(p=>named.includes(p))||(matches.length===1?matches[0]:null);
     return {key:'tax:'+t,tax:t,profile,name:form.name};
   }
   if(named.length!==1)return null;
   const p=named[0],pt=tax(p.TaxID);if(t&&t!==pt)return null;
   return {key:pt.length===13?'tax:'+pt:'profile:'+p.id,tax:pt.length===13?pt:'',profile:p,name:form.name};
 }
 function matches(quote,identity,profiles){
   if(!identity)return false;const qt=tax(quote.CustomerTaxID);
   if(qt)return !!identity.tax&&qt===identity.tax;
   if(quote.CustomerID&&identity.profile)return String(quote.CustomerID)===String(identity.profile.id);
   const found=resolve({name:quote.ClientName,tax:''},profiles);return !!found&&found.key===identity.key;
 }
 function toItem(row,extra,id){
   if(!row||String(row.Title||'').startsWith('__')||extra?.asHeader)return null;
   const ex=extra||{},price=ex.travel?ex.travel.basePrice:(ex.price!==undefined&&ex.price!==''?ex.price:row.UnitPrice);
   if(ex.travel&&(price===null||price===undefined||price===''||!Number.isFinite(Number(price))||Number(price)<0))throw Error('ข้อมูลราคาเดิมก่อนรวมค่าเดินทางไม่ครบ กรุณาตรวจต้นทาง');
   return {id,type:'item',no:'',pn:ex.pn||'',name:row.Title||'',desc:row.Description||'',qty:ex.qtyRaw!==undefined&&ex.qtyRaw!==''?ex.qtyRaw:row.Quantity??'',unit:row.Unit||'ชิ้น',price:price??'',disc:Number(row.DiscountPct)||0,cost:Number(ex.cost)||0,vendorId:ex.vendorId||'',catalogId:String(ex.catalogId||''),internalNotes:String(ex.internalNotes||''),travel:null};
 }
 const api={resolve,matches,toItem};if(typeof module==='object'&&module.exports)module.exports=api;else root.CustomerHistoryCore=api;
})(globalThis);
