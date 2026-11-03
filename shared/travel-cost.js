(function(root){'use strict';
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const text=v=>String(v||'').replace(/\s+/g,' ').trim();
 function bangkok(address){return /กรุงเทพมหานคร|กรุงเทพฯ|\bbangkok\b/i.test(text(address));}
 function settings(v){
  if(!v||typeof v!=='object')throw Error('Admin ยังไม่ได้ตั้งค่าเดินทาง');
  const rate=Number(v.rate),trips=Number(v.trips),origin=text(v.origin);
  if(!origin||String(v.rate??'').trim()===''||!Number.isFinite(rate)||rate<0||!['1','2'].includes(String(trips)))throw Error('กรุณาตั้งจุดเริ่มเดินทาง อัตราต่อ กม. และจำนวนเที่ยว');
  return {enabled:v.enabled===true,origin,rate,trips};
 }
 function calculate(config,input){
  const s=settings(config);if(!s.enabled)throw Error('Admin ยังไม่เปิดใช้ค่าเดินทาง');
  if(!text(input.destination))throw Error('กรุณาระบุที่อยู่หน้างานให้ชัดเจน');
  if(input.area==='bangkok'||bangkok(input.destination))return {...s,amount:0,km:0,area:'bangkok'};
  if(input.area!=='outside'||input.confirmed!==true)throw Error('กรุณายืนยันว่าหน้างานอยู่นอกกรุงเทพฯ และตรวจระยะทางขับรถแล้ว');
  const km=Number(input.km);if(!String(input.km).trim()||!Number.isFinite(km)||km<=0||km>3000)throw Error('ระบุระยะทางขับรถเที่ยวเดียวมากกว่า 0 และไม่เกิน 3,000 กม.');
  const amount=round(km*s.rate*s.trips);if(!Number.isFinite(amount))throw Error('ค่าเดินทางสูงเกินขนาดตัวเลขที่รองรับ');return {...s,km,amount,area:'outside'};
 }
 function eligible(item){return item?.type==='item'&&!item.asHeader&&text(item.name)&&Number(item.qty)===1&&Number(item.disc||0)===0&&String(item.price).trim()!==''&&Number.isFinite(Number(item.price))&&Number(item.price)>=0;}
 function remove(items){for(const it of items)if(it.travel){it.price=it.travel.basePrice;delete it.travel;}}
 function apply(items,id,result,context){
  if(result.amount===0){remove(items);return;}
  const it=items.find(x=>String(x.id)===String(id));if(!eligible(it))throw Error('เลือกรายการงานจำนวน 1 ที่มีราคาตัวเลข และไม่มีส่วนลดรายรายการ');
  const base=it.travel?Number(it.travel.basePrice):Number(it.price);if(!Number.isFinite(round(base+result.amount)))throw Error('ราคางานสูงเกินขนาดตัวเลขที่รองรับ');remove(items);
  it.price=round(base+result.amount);it.travel={version:1,basePrice:base,amount:result.amount,chargedPrice:it.price,...result,...context,source:'manual-google-maps',at:new Date().toISOString()};
 }
 function validate(items,context){for(const it of items)if(it.travel){const m=it.travel;if(!eligible(it)||Number(it.price)!==Number(m.chargedPrice)||text(m.quoteAddress)!==text(context.quoteAddress)||text(m.clientName)!==text(context.clientName)||bangkok(m.destination)||m.area!=='outside')throw Error('ข้อมูลหน้างานหรือรายการที่รวมค่าเดินทางเปลี่ยน กรุณานำค่าเดินทางออกแล้วตรวจและคำนวณใหม่');}}
 const api={round,text,bangkok,settings,calculate,eligible,remove,apply,validate};if(typeof module==='object'&&module.exports)module.exports=api;else root.TravelCost=api;
})(globalThis);
