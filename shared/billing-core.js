/* Billing snapshots do not modify quotations, sales results or payments. */
(function(root){
 const cents=v=>{const n=Number(v||0);if(!Number.isFinite(n))throw Error('ยอดเงินไม่ถูกต้อง');return Math.round(n*100);};
 const money=n=>n/100;
 function customerKey(q,profiles=[]){
  const tax=String(q.CustomerTaxID||'').replace(/\D/g,'');
  if(tax.length===13)return 'tax:'+tax;
  const matches=profiles.filter(c=>q.CustomerID?String(c.id)===String(q.CustomerID):String(c.Title||'').trim()===String(q.ClientName||'').trim());
  if(matches.length!==1)return null;
  const ct=String(matches[0].TaxID||'').replace(/\D/g,'');if(tax&&tax!==ct)return null;
  return ct.length===13?'tax:'+ct:'profile:'+matches[0].id;
 }
 function poNumbers(q,deal={}){return [...new Set([...(deal.custPOs||[]).map(p=>p.poNumber),q.PONumber].map(v=>String(v||'').trim()).filter(Boolean))];}
 function reason(q,deal={}){
  if(!q||!q.Title||!['PO Received','Closed'].includes(q.Status))return 'ต้องเป็นใบที่ได้รับ PO แล้ว';
  if(!poNumbers(q,deal).length)return 'ยังไม่ระบุเลข PO ลูกค้า';
  if(cents(q.TotalAmount)<=0)return 'ยอดรวมต้องมากกว่า 0';
  if(cents(q.PaidAmount)>=cents(q.TotalAmount))return 'ชำระครบแล้ว';
  return '';
 }
 function build({quotes,items,profiles=[],dealFor=()=>({}),extraFor=()=>[],documents=[],id,date,dueDate,owner,note=''}){
  if(!quotes.length)throw Error('กรุณาเลือกใบเสนอราคา');
  if(new Set(quotes.map(q=>String(q.id))).size!==quotes.length)throw Error('มีใบเสนอราคาซ้ำ');
  const key=customerKey(quotes[0],profiles);if(!key||quotes.some(q=>customerKey(q,profiles)!==key))throw Error('ต้องเป็นลูกค้าเดียวกัน โดยมีเลขผู้เสียภาษีหรือ Customer Profile ตรงกัน');
  if(documents.some(d=>d.status!=='cancelled'&&d.sourceIds?.some(s=>quotes.some(q=>String(q.id)===String(s)))))throw Error('บางใบอยู่ในใบวางบิลแล้ว กรุณายกเลิกใบวางบิลเดิมก่อน');
  let gross=0,discount=0,net=0,vat=0,total=0,paid=0;
  const rows=[],sources=[];
  for(const q of quotes){
   const deal=dealFor(q),why=reason(q,deal);if(why)throw Error((q.Title||'')+': '+why);
   const sub=cents(q.SubTotal),pct=Number(q.DiscountPct||0);if(!Number.isFinite(pct)||pct<0||pct>100)throw Error('ส่วนลดไม่ถูกต้อง');
   const disc=Math.round(sub*pct/100),base=sub-disc,grand=cents(q.TotalAmount),p=cents(q.PaidAmount);
   if(p<0||grand<base)throw Error('ยอดต้นฉบับไม่ถูกต้อง กรุณาตรวจ '+q.Title);
   const pos=poNumbers(q,deal),srcItems=items.filter(it=>String(it.QuoteID)===String(q.id)),extra=extraFor(q)||[];
   rows.push({t:'group',name:'Refer PO เลขที่ '+pos.join(', ')+' · '+q.Title});
   let lineSum=0,itemCount=0;
   srcItems.forEach((it,i)=>{
    const title=String(it.Title||'');const ex=extra[i]||{};
    if(title.startsWith('__GROUP__:')){rows.push({t:'group',name:title.slice(10)});return;}
    if(title==='__NOTE__'){rows.push({t:'note',desc:it.Description||''});return;}
    if(['__BLANK__','__PAGEBREAK__'].includes(title))return;
    const qty=Number(it.Quantity||0),price=Number(it.UnitPrice||0),d=Number(it.DiscountPct||0);
    if(![qty,price,d].every(Number.isFinite)||qty<0||price<0||d<0||d>100)throw Error('ราคาหรือจำนวนไม่ถูกต้องใน '+q.Title);
    const amt=cents(it.LineTotal!=null&&it.LineTotal!==''?it.LineTotal:qty*price*(1-d/100));lineSum+=amt;itemCount++;
    rows.push({name:title,desc:it.Description||'',pn:ex.pn||it.PartNumber||'',qty:ex.qtyRaw??it.Quantity,unit:it.Unit||'',price:ex.price??it.UnitPrice,amount:money(amt)});
   });
   if(!itemCount||Math.abs(lineSum-sub)>Math.max(2,itemCount))throw Error('รายการสินค้าไม่ตรงกับยอดต้นฉบับ '+q.Title+' กรุณาตรวจต้นฉบับก่อน');
   if(disc)rows.push({name:'ส่วนลดท้ายใบ '+q.Title,qty:1,unit:'รายการ',price:-money(disc),amount:-money(disc)});
   gross+=sub;discount+=disc;net+=base;vat+=grand-base;total+=grand;paid+=p;
   sources.push({id:String(q.id),title:q.Title,poNumbers:pos,total:money(grand),paid:money(p)});
  }
  const first=quotes[0];
  return {version:1,id,number:'BL-'+date.replace(/-/g,'')+'-'+id.replace(/-/g,'').slice(0,8).toUpperCase(),date,dueDate,note,owner,status:'issued',customerKey:key,sourceIds:sources.map(s=>s.id),sources,rows,customer:{ClientName:first.ClientName,CustomerAddress:first.CustomerAddress||'',CustomerTaxID:first.CustomerTaxID||'',SaleName:first.SaleName||'',PaymentMethod:'Credit'},totals:{gross:money(gross),discount:money(discount),net:money(net),vat:money(vat),total:money(total),paid:money(paid),balance:money(total-paid)}};
 }
 function layoutTotals(doc,rows){
  const netCents=rows.reduce((sum,r)=>{if(r.t==='group'||r.t==='note')return sum;const raw=String(r.amount??'').trim().replace(/,/g,'');return sum+(/^-?\d*(?:\.\d+)?$/.test(raw)?cents(raw):0);},0);
  const net=money(netCents),vat=netCents===cents(doc.totals.net)?doc.totals.vat:money(Math.round(netCents*0.07)),total=money(netCents+cents(vat)),paid=doc.totals.paid,balance=money(cents(total)-cents(paid));
  return {...doc.totals,net,vat,total,paid,balance};
 }
 function copiesHTML(original,copy){const content=html=>{const body=html.match(/<body[^>]*>([\s\S]*)<\/body>/i);if(!body)throw Error('รูปแบบเอกสารไม่ถูกต้อง');return body[1].replace(/<div class="no-print"[^>]*>[\s\S]*?<\/div>/gi,'');};return original.replace(/<body[^>]*>[\s\S]*<\/body>/i,'<body>'+content(original)+content(copy)+'</body>');}
 function workflowState(doc){return doc.status==='cancelled'?'cancelled':doc.status==='submitted'?'submitted':'issued';}
 function inPeriod(value,year='',month=''){if(!year&&!month)return true;const match=String(value||'').match(/^(\d{4})-(\d{2})-\d{2}/);return !!match&&(!year||match[1]===String(year))&&(!month||match[2]===String(month).padStart(2,'0'));}
 root.BillingCore={cents,customerKey,poNumbers,reason,build,layoutTotals,copiesHTML,workflowState,inPeriod};
})(globalThis);
