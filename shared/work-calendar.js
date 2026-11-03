(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorkCalendar=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const labels={install:'ติดตั้ง',payment:'นัดชำระเงิน',expiry:'หมดอายุ',service:'PM / MA'};
 const text=v=>String(v??'');
 function date(value){
  let s=text(value).trim();
  if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s)){const d=new Date(s);if(!Number.isFinite(d.getTime()))return '';s=new Date(d.getTime()+7*3600000).toISOString().slice(0,10);}
  else s=s.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
 }
 function clock(value){const s=text(value);if(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s)){const d=new Date(s);return Number.isFinite(d.getTime())?new Date(d.getTime()+7*3600000).toISOString().slice(11,16):'';}return /T\d{2}:\d{2}/.test(s)?s.slice(11,16):'';}
 function collect(quotes,contracts,settings=[]){
  const events=[],missing={install:0,payment:0,expiry:0,service:0},problems=[];
  const saved=new Map(settings.filter(r=>text(r.Title).startsWith('DealStatus_')).map(r=>[text(r.Title).slice(11),r.Value]));
  const add=e=>{e.date=date(e.date);if(!e.date){missing[e.type]++;return;}events.push(e);};
  for(const q of quotes){if(q.Status==='Cancelled')continue;let ds={};try{ds=JSON.parse(saved.get(text(q.id))||q.DealStatus||'{}')||{};}catch{problems.push('ข้อมูลติดตาม '+text(q.Title));}
   const base={quoteId:q.id,client:text(q.ClientName),ref:text(q.Title),owner:text(q.SaleName||q.SaleEmail),source:'quote'};
   for(const [i,j] of (Array.isArray(ds.techJobs)?ds.techJobs:[]).entries()){if(!j||j.status==='cancelled')continue;add({...base,id:'job:'+q.id+':'+(j.id??i),type:'install',title:j.note||'งานติดตั้ง / งานช่าง',date:j.scheduledAt,time:clock(j.scheduledAt),owner:text(j.techName||j.techEmail),technician:text(j.techEmail||j.techName).trim().toLowerCase(),done:j.status==='completed',status:text(j.status),detail:text(j.materials)});}
   const due=q.PaymentDueDate||ds.paymentDueDate;if(due&&Number(q.TotalAmount||0)>Number(q.PaidAmount||0))add({...base,id:'pay:'+q.id,type:'payment',title:'กำหนดชำระเงิน',date:due,time:'',done:false,amount:Number(q.TotalAmount||0)-Number(q.PaidAmount||0)});
   for(const [i,e] of (Array.isArray(ds.expiries)?ds.expiries:[]).entries()){if(!e||e.renewed)continue;add({...base,id:'expiry:'+q.id+':'+(e.id??i),type:'expiry',title:text(e.type)+' '+text(e.name),date:e.expiryDate,time:'',done:false,detail:text(e.serial)});}
  }
  const quoteMap=new Map(quotes.map(q=>[text(q.id),q]));
  for(const c of contracts){if(['cancelled','Cancelled'].includes(c.status))continue;const ids=Array.isArray(c.quoteId)?c.quoteId.map(text):text(c.quoteId).split(',').map(s=>s.trim()).filter(Boolean);if(ids.length&&!ids.some(id=>quoteMap.has(id)&&quoteMap.get(id).Status!=='Cancelled'))continue;
   const base={contractId:c.spId??c.id,client:text(c.party),ref:text(c.contractNo||c.name||c.invNo),owner:text(c.coordinator),source:'contract'};
   if(c.end)add({...base,id:'contract-expiry:'+base.contractId,type:'expiry',title:'หมดอายุสัญญา '+text(c.name),date:c.end,time:'',done:false});
   const plan=c.serviceAgreement||{};
   for(const [i,v] of (Array.isArray(plan.visits)?plan.visits:[]).entries()){if(!v||v.status==='cancelled')continue;add({...base,id:'service:'+base.contractId+':'+(v.id??i),type:'service',title:(plan.type||'PM / MA')+' · '+text(c.name),date:v.plannedDate,time:'',done:v.status==='completed',status:text(v.status),detail:text(v.note)});}
  }
  return {events:events.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)||a.id.localeCompare(b.id)),missing,problems};
 }
 function field(e){return !e.done&&(e.type==='install'||e.type==='service');}
 function count(events){return {total:events.length,field:events.filter(field).length,other:events.filter(e=>!field(e)).length};}
 function collisions(events){const groups=new Map();for(const e of events){if(!field(e)||!e.technician||!e.time)continue;const key=e.date+'|'+e.time+'|'+e.technician;groups.set(key,[...(groups.get(key)||[]),e.id]);}return new Set([...groups.values()].filter(g=>g.length>1).flat());}
 return {labels,date,clock,collect,field,count,collisions};
});
