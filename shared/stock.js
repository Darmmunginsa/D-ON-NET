(function(root){'use strict';
let state=null,busy=false,generation=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id),labels={receive:'รับเข้า',issue:'เบิกออก',return:'คืนจากงาน',count:'ปรับยอดตรวจนับ'};
const actor=()=>String(typeof currentUser!=='undefined'?currentUser?.email||'':'').trim().toLowerCase();
const key=()=> 'donnet-stock-pending:'+actor();
const qty=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:3});
function pending(){try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}}
function savePending(value){if(value)sessionStorage.setItem(key(),JSON.stringify(value));else sessionStorage.removeItem(key());}
function message(text){if($('stock-message'))$('stock-message').textContent=text;}
async function api(payload){const account=state?.account;if(!account||account!==actor())throw Error('บัญชีเปลี่ยน กรุณาเปิด Stock ใหม่');const result=await _call({action:'inventory',...payload});if(!state||state.account!==account||actor()!==account)throw Error('บัญชีเปลี่ยน กรุณาเปิด Stock ใหม่');return result;}
function lock(value){busy=value;const panel=$('stock-workspace');if(panel)panel.inert=value;const bar=$('stock-progress');if(bar)bar.hidden=!value;}
function reset(){generation++;$('stock-overlay')?.remove();state=null;busy=false;}
function close(){if(busy)return;reset();}
async function open(mode='sale',context={}){
  if(busy)return;if(!actor())return;
  close();state={mode,context,account:actor(),data:null};
  const el=document.createElement('div');el.id='stock-overlay';el.className='stock-overlay';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Stock สินค้า');
  el.innerHTML='<div class="stock-dialog"><header><div><h2>Stock สินค้า</h2><small>จัดซื้อรับเข้า · ช่างเบิกตามงาน · Sale ดูสถานะ</small></div><button type="button" id="stock-close">ปิด</button></header><progress id="stock-progress" aria-label="กำลังโหลดหรือบันทึก Stock"></progress><div id="stock-message" class="stock-message" role="status"></div><div id="stock-workspace"></div></div>';
  document.body.append(el);$('stock-close').onclick=close;await refresh();
}
async function refresh(){
  if(!state)return;const run=++generation;lock(true);message('กำลังโหลด Stock…');
  try{const data=await api({op:'list',quoteId:state.context.quoteId||'',jobId:state.context.jobId||''});if(run!==generation)return;state.data=data;render();message(pending()?'มีรายการรอตรวจผลจากครั้งก่อน กดตรวจสอบผลก่อนเริ่มรายการใหม่':'ข้อมูล Stock ล่าสุด · เวลา '+new Date().toLocaleTimeString('th-TH'));}
  catch(error){message(error.message);}finally{if(run===generation)lock(false);}
}
function render(){
  const d=state.data,ctx=state.context,manager=state.mode==='purchase'&&d.permissions.receive,tech=state.mode==='tech',write=manager||tech;
  $('stock-workspace').innerHTML=(ctx.quoteId?'<p class="stock-context">งานที่เกี่ยวข้อง: '+esc(d.quotes.find(q=>q.id===ctx.quoteId)?.title||d.jobs.find(j=>j.quoteId===ctx.quoteId)?.quoteTitle||ctx.quoteId)+'</p>':'')+
    '<div class="stock-toolbar"><input id="stock-search" type="search" placeholder="ค้นหาสินค้า / SKU" aria-label="ค้นหาสินค้า"><button id="stock-refresh" type="button">โหลดล่าสุด</button>'+(pending()?'<button id="stock-check" type="button">ตรวจสอบผลรายการเดิม</button>':'')+'</div><div id="stock-summary" class="stock-summary"></div><section><h3>คงเหลือพร้อมเบิก</h3><div class="stock-scroll"><table><thead><tr><th>สินค้า / SKU</th><th>คงเหลือ</th><th>สถานะ</th>'+(ctx.quoteId?'<th>เบิกสุทธิในงานนี้</th>':'')+'</tr></thead><tbody id="stock-products"></tbody></table></div></section>'+
    (write?'<section><h3>'+ (manager?'รับสินค้าเข้า / ตรวจนับ':'เบิกสินค้า / คืนสินค้า')+'</h3><p class="stock-help">'+(manager?'เลือกสินค้าจาก Catalog · รับเฉพาะจำนวนที่รับจริง · ยอดตั้งต้นใช้รับเข้าและระบุเอกสาร “ยอดยกมา” · รายการนี้ไม่สร้างค่าใช้จ่ายซ้ำใน Finance':'เบิกแล้วตัด Stock ทันที · ต้องเลือกงานที่ได้รับมอบหมาย · คืนได้ไม่เกินยอดเบิกค้าง')+'</p><form id="stock-form"><div class="stock-grid"><label>ประเภทรายการ<select id="stock-type">'+(manager?'<option value="receive">รับเข้า</option><option value="count">ปรับยอดตรวจนับ</option>':'<option value="issue">เบิกออก</option><option value="return">คืนจากงาน</option>')+'</select></label><label>สินค้า<select id="stock-product" required></select></label><label>จำนวน<input id="stock-quantity" type="number" min="0.001" step="0.001" required></label>'+
    (tech?'<label class="stock-wide">งานช่างที่เกี่ยวข้อง<select id="stock-job" required><option value="">เลือกงานช่าง</option>'+d.jobs.filter(j=>!ctx.quoteId||j.quoteId===ctx.quoteId).map(j=>'<option value="'+esc(j.quoteId+'|'+j.jobId)+'" '+(j.jobId===ctx.jobId?'selected':'')+'>'+esc(j.quoteTitle+' · '+j.customer+' · '+j.techName+' · '+j.status)+'</option>').join('')+'</select></label>':'<label>ใบเสนอราคาที่เกี่ยวข้อง (ถ้ามี)<select id="stock-quote"><option value="">รับเข้าคลังทั่วไป</option>'+d.quotes.map(q=>'<option value="'+esc(q.id)+'">'+esc(q.title+' · '+q.customer)+'</option>').join('')+'</select></label>')+
    '<label>เลขอ้างอิงเอกสาร<input id="stock-reference" maxlength="200" placeholder="เช่น PO / ใบส่งของ / ยอดยกมา"></label><label class="stock-wide">หมายเหตุ / เหตุผลปรับยอด<textarea id="stock-note" maxlength="1000"></textarea></label><div class="stock-wide"><button type="submit">ยืนยันบันทึก Stock</button> <small id="stock-available"></small></div></div></form></section>':'<p class="stock-help">ดูสถานะได้อย่างเดียว'+(state.mode==='purchase'?' · Admin กำหนดผู้รับผิดชอบ Stock ได้ด้านล่าง':'')+'</p>')+
    '<section><h3>ประวัติรับเข้า / เบิก / คืน / ปรับยอด</h3><p class="stock-help">แสดงไม่เกิน 200 รายการล่าสุดตามสิทธิ์'+(ctx.quoteId?'ของงานนี้':'')+'</p><div class="stock-scroll"><table><thead><tr><th>วันเวลา / ผู้บันทึก</th><th>รายการ</th><th>จำนวน</th><th>งาน / เอกสารอ้างอิง</th><th>หมายเหตุ</th></tr></thead><tbody>'+d.moves.map(m=>'<tr><td>'+esc(new Date(m.At).toLocaleString('th-TH'))+'<br><small>'+esc(m.ActorName||m.Actor)+'</small></td><td>'+esc(labels[m.Type]||m.Type)+'<br>'+esc(m.ProductTitle)+'</td><td class="stock-number">'+(Number(m.DeltaUnits)>0?'+':'')+qty(Number(m.DeltaUnits)/1000)+' '+esc(m.Unit)+'</td><td>'+esc(m.QuoteTitle||'คลังทั่วไป')+'<br><small>'+esc(m.Reference||'')+'</small></td><td>'+esc(m.Note)+'</td></tr>').join('')+'</tbody></table></div></section>'+
    (state.mode==='purchase'&&d.permissions.admin?'<section><details><summary>Admin · กำหนดผู้รับผิดชอบรับเข้า Stock</summary><form id="stock-access-form"><label>อีเมลจัดซื้อ (หนึ่งอีเมลต่อบรรทัด)<textarea id="stock-access-emails">'+esc(d.purchasers.join('\n'))+'</textarea></label><button type="submit">บันทึกสิทธิ์จัดซื้อ</button></form><small>บัญชีต้องได้รับอนุญาตเข้าใช้งานระบบอยู่แล้ว · Admin มีสิทธิ์โดยอัตโนมัติ</small></details></section>':'');
  $('stock-refresh').onclick=refresh;$('stock-search').oninput=renderProducts;if($('stock-check'))$('stock-check').onclick=checkPending;
  if(write){$('stock-form').onsubmit=submit;$('stock-type').onchange=productOptions;$('stock-product').onchange=available;productOptions();}
  if($('stock-access-form'))$('stock-access-form').onsubmit=async e=>{e.preventDefault();lock(true);try{await api({op:'access',emails:$('stock-access-emails').value.split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean)});message('บันทึกสิทธิ์แล้ว');await refresh();}catch(error){message(error.message);}finally{lock(false);}};
  renderProducts();
}
function renderProducts(){if(!state?.data)return;const search=($('stock-search')?.value||'').trim().toLowerCase(),d=state.data;
  const products=d.products.filter(p=>(p.title+' '+p.sku).toLowerCase().includes(search));
  $('stock-products').innerHTML=products.map(p=>'<tr><td>'+esc(p.title)+'<br><small>'+esc(p.sku)+'</small></td><td class="stock-number">'+qty(p.quantity)+' '+esc(p.unit)+'</td><td class="'+(p.quantity>0?'stock-good':'stock-zero')+'">'+(p.quantity>0?'พร้อมเบิก':'หมด')+(p.active?'':' · ปิดใช้งาน')+'</td>'+(state.context.quoteId?'<td class="stock-number">'+qty((d.jobBalances||{})[p.id]||0)+' '+esc(p.unit)+'</td>':'')+'</tr>').join('')||'<tr><td colspan="4">ไม่พบสินค้า · เพิ่มสินค้าจริงใน Catalog ก่อนรับเข้า Stock</td></tr>';
  $('stock-summary').textContent='แสดง '+products.length+' รายการ · พร้อมเบิก '+products.filter(p=>p.quantity>0).length+' รายการ · หมด '+products.filter(p=>p.quantity<=0).length+' รายการ';
}
function productOptions(){const type=$('stock-type').value;$('stock-quantity').min=type==='count'?'0':'0.001';$('stock-reference').required=type==='receive';$('stock-note').required=type==='count';
  const prior=$('stock-product').value;$('stock-product').innerHTML='<option value="">เลือกสินค้า</option>'+state.data.products.filter(p=>p.active||['return','count'].includes(type)).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title+' · คงเหลือ '+qty(p.quantity)+' '+p.unit)+'</option>').join('');$('stock-product').value=prior;jobOptions();available();}
function jobOptions(){const select=$('stock-job');if(!select)return;const old=select.value,type=$('stock-type').value,ctx=state.context;select.innerHTML='<option value="">เลือกงานช่าง</option>'+state.data.jobs.filter(j=>(!ctx.quoteId||j.quoteId===ctx.quoteId)&&(type==='return'||(!j.cancelled&&j.status!=='completed'))).map(j=>'<option value="'+esc(j.quoteId+'|'+j.jobId)+'">'+esc(j.quoteTitle+' · '+j.customer+' · '+j.techName+' · '+j.status)+'</option>').join('');const selected=old||((ctx.quoteId&&ctx.jobId)?ctx.quoteId+'|'+ctx.jobId:'');select.value=selected;}
function available(){const p=state.data.products.find(p=>p.id===$('stock-product').value);$('stock-available').textContent=p?'คงเหลือ '+qty(p.quantity)+' '+p.unit+($('stock-type').value==='count'?' · กรอกยอดที่นับได้จริง':''):'';}
function readForm(requestId){const job=($('stock-job')?.value||'').split('|');return {op:$('stock-type').value,requestId,productId:$('stock-product').value,quantity:$('stock-quantity').value,quoteId:job[0]||$('stock-quote')?.value||'',jobId:job[1]||'',reference:$('stock-reference').value,note:$('stock-note').value};}
async function submit(event){event.preventDefault();if(busy)return;lock(true);
  try{const old=pending();if(old){const result=await api({op:'status',requestId:old.requestId});if(result.item){savePending(null);await refresh();message('พบรายการเดิมบันทึกแล้ว กรุณาตรวจประวัติก่อนทำรายการใหม่');return;}savePending(readForm(old.requestId));await checkPending();return;}
    const req=readForm(crypto.randomUUID());
    savePending(req);const result=await api(req);savePending(null);await refresh();message('บันทึก '+labels[result.item.Type]+' '+result.item.ProductTitle+' สำเร็จ · คงเหลือ '+qty(Number(result.item.BalanceUnits)/1000)+' '+result.item.Unit);
  }catch(error){message(error.message+' · ระบบเก็บรายการเดิมไว้ กดตรวจสอบผลเพื่อป้องกันบันทึกซ้ำ');if($('stock-check')==null){const b=document.createElement('button');b.id='stock-check';b.textContent='ตรวจสอบผลรายการเดิม';b.onclick=checkPending;$('stock-workspace').prepend(b);}}
  finally{lock(false);}
}
async function checkPending(){const req=pending();if(!req)return;lock(true);try{const result=await api({op:'status',requestId:req.requestId});if(result.item){savePending(null);await refresh();message('พบรายการเดิมบันทึกแล้ว: '+labels[result.item.Type]+' '+result.item.ProductTitle+' · กรุณาตรวจประวัติ');}else{const result=await api(req);savePending(null);await refresh();message('บันทึกรายการเดิมสำเร็จ: '+result.item.ProductTitle);}}catch(error){message(error.message+' · ถ้าเป็นข้อมูลกรอกผิด สามารถแก้ฟอร์มแล้วบันทึกใหม่ด้วยรหัสรายการเดิมได้');}finally{lock(false);}}
root.StockPortal={open,close,refresh,reset};
})(globalThis);
