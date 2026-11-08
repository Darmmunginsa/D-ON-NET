const TravelQuote=(()=>{
 const T=TravelCost,$=id=>document.getElementById(id),key='TravelSettings_v1';let config=null,settingId=null,busy=false,lastAttached='',routeGeneration=0,lastRoute=null;
 const point=()=>T.coordinates($('travel-point')?.value||'');
 const context=()=>({quoteAddress:$('q-cust-address').value,clientName:$('q-client').value});
 function message(s){$('travel-message').textContent=s;}
 async function load(){
  const rows=await getListItems(CONFIG.lists.settings),row=rows.find(r=>r.Title===key);settingId=row?.id||null;
  config=row?T.settings(JSON.parse(row.Value)):null;return config;
 }
 function summary(){$('travel-rate-summary').textContent=config?`${config.origin} · ${fmt(config.rate)} บาท/กม. · ${config.trips===2?'ไป–กลับ':'เที่ยวเดียว'}${config.enabled?'':' · ยังไม่เปิดใช้'}`:'Admin ยังไม่ได้ตั้งค่าเดินทาง';}
 async function openSettings(){
  const box=$('travel-settings-card');box.hidden=!isAdminUser();if(box.hidden)return;
  try{await load();const s=config||{enabled:false,origin:'',rate:'',trips:2};$('travel-setting-enabled').checked=s.enabled;$('travel-setting-origin').value=s.origin;$('travel-setting-rate').value=s.rate;$('travel-setting-trips').value=s.trips;$('travel-settings-message').textContent='';summary();}catch(e){$('travel-settings-message').textContent=e.message;}
 }
 async function saveSettings(){
  if(!isAdminUser()||busy)return;
  try{const s=T.settings({enabled:$('travel-setting-enabled').checked,origin:$('travel-setting-origin').value,rate:$('travel-setting-rate').value,trips:$('travel-setting-trips').value});busy=true;$('travel-setting-save').disabled=true;
   // Re-read the settings row so a previously missing row is not created again.
   const rows=await getListItems(CONFIG.lists.settings),row=rows.find(x=>x.Title===key),fields={Value:JSON.stringify(s)};
   if(row)await updateListItem(CONFIG.lists.settings,row.id,fields);else{const created=await createListItem(CONFIG.lists.settings,{Title:key,...fields});if(!created?.id)throw Error('ยังไม่ยืนยันการบันทึก');}
   config=s;summary();$('travel-settings-message').textContent='บันทึกอัตราค่าเดินทางแล้ว ใช้เมื่อคำนวณใหม่ ใบเก่าไม่เปลี่ยนราคา';
  }catch(e){$('travel-settings-message').textContent=e.message;}finally{busy=false;$('travel-setting-save').disabled=false;}
 }
 function reset(){routeGeneration++;lastRoute=null;lastAttached='';for(const id of ['travel-km','travel-destination','travel-point'])if($(id))$(id).value='';if($('travel-recalc-required'))$('travel-recalc-required').value='';if($('travel-area'))$('travel-area').value='';if($('travel-confirmed'))$('travel-confirmed').checked=false;if($('travel-message'))message('');}
 function refresh(){fillOptions();}
 function fillOptions(){
  const attached=quoteItems.find(i=>i.travel);
  if(attached){const m=attached.travel,signature=String(attached.id)+'|'+m.at;if(lastAttached!==signature){$('travel-destination').value=m.destination;if($('travel-point'))$('travel-point').value=m.routePoint||'';$('travel-area').value=m.area;$('travel-km').value=m.km;$('travel-confirmed').checked=true;lastAttached=signature;}
   const total=m.version===2?m.actualAmount:m.amount,count=quoteItems.filter(i=>i.travel).length;
   message('รวมค่าเดินทาง '+fmt(total)+' บาท ใน '+count+' รายการแล้ว (ก่อนส่วนลดรายรายการ ส่วนลดรวม และ VAT)'+(m.version===2&&m.actualAmount!==m.totalAmount?' · ยอดตามระยะทาง '+fmt(m.totalAmount)+' บาท ต่างกันจากการปัดราคาต่อหน่วย 2 ตำแหน่ง':'')+'\nอัตราที่ใช้ '+fmt(m.rate)+' บาท/กม. × '+m.km+' กม. × '+m.trips+' เที่ยว');
  }else lastAttached='';
  // Quantity stays editable. Its input handler invalidates the entire travel allocation.
  for(const it of quoteItems){const row=[...document.querySelectorAll('#items-body tr[data-id]')].find(r=>r.dataset.id===String(it.id));if(row){const qty=row.querySelector('.col-qty input');if(qty){qty.disabled=false;if(it.travel)qty.title='แก้จำนวนได้ ระบบจะคืนราคาก่อนรวมค่าเดินทาง และให้คำนวณค่าเดินทางใหม่';}for(const el of row.querySelectorAll('.col-price input,.col-disc input')){el.disabled=!!it.travel;if(it.travel)el.title='นำค่าเดินทางออกก่อนแก้ราคา หรือส่วนลด';}}}
  if($('travel-recalc-required')?.value==='1')message('จำนวนเปลี่ยนแล้ว คืนราคาก่อนรวมค่าเดินทางทุกรายการ กรุณาคำนวณและรวมค่าเดินทางใหม่ หรือเลือกนำค่าเดินทางออก');
 }
 function quantityChanged(id){
  if(!quoteItems.some(it=>String(it.id)===String(id))||!quoteItems.some(it=>it.travel))return;
  T.remove(quoteItems);lastAttached='';if($('travel-recalc-required'))$('travel-recalc-required').value='1';
  // Update prices/totals in place: rebuilding rows would destroy the active quantity input/caret.
  for(const it of quoteItems){const row=[...document.querySelectorAll('#items-body tr[data-id]')].find(r=>r.dataset.id===String(it.id));if(!row)continue;const price=row.querySelector('.col-price input'),total=row.querySelector('.col-total');if(price)price.value=String(it.price??'');if(total)total.textContent=totalCell(it);}
  fillOptions();if(typeof toast==='function')toast('จำนวนเปลี่ยนแล้ว กรุณารวมค่าเดินทางใหม่ก่อนส่งอนุมัติ','info');
 }
 function remove(){T.remove(quoteItems);if($('travel-recalc-required'))$('travel-recalc-required').value='';message('นำค่าเดินทางออกแล้ว คืนราคางานเดิม');$('items-body').innerHTML='';renderItems();}
 async function apply(){
  if(busy)return;
  try{busy=true;$('travel-apply').disabled=true;const previousOrigin=config?.origin;await load();summary();if(previousOrigin&&config?.origin!==previousOrigin){$('travel-confirmed').checked=false;throw Error('Admin เปลี่ยนจุดเริ่มเดินทาง กรุณาตรวจเส้นทางและยืนยันระยะทางใหม่');}
   const routePoint=point(),label=T.text($('travel-destination').value)||routePoint;T.routeTarget(label,routePoint);
   const result=T.calculate(config,{destination:label,area:$('travel-area').value,confirmed:$('travel-confirmed').checked,km:$('travel-km').value});
   if(result.amount>0&&typeof pricePeriod!=='undefined'&&pricePeriod)throw Error('ค่าเดินทางใช้กับงานครั้งเดียว กรุณาเลือกงวดราคา/หน่วยปกติก่อนรวมค่าเดินทาง');
   T.applyAll(quoteItems,result,{...context(),destination:label,routePoint,routeSource:lastRoute&&lastRoute.km===Number($('travel-km').value)&&lastRoute.target===T.routeTarget(label,routePoint)?'google-routes':'manual'});if($('travel-recalc-required'))$('travel-recalc-required').value='';$('items-body').innerHTML='';renderItems();
   if(result.amount===0)message(result.area==='bangkok'?'หน้างานกรุงเทพฯ ไม่คิดค่าเดินทาง':'ค่าเดินทางเป็น 0 บาทตามอัตราที่ตั้ง');
  }catch(e){message(e.message);}finally{busy=false;$('travel-apply').disabled=false;}
 }
 async function fetchDistance(){
  if(busy)return;
  const destination=T.text($('travel-destination').value),rawPoint=T.text($('travel-point')?.value||''),generation=++routeGeneration;
  $('travel-km').value='';$('travel-confirmed').checked=false;lastRoute=null;
  try{busy=true;$('travel-fetch').disabled=true;const target=T.routeTarget(destination,rawPoint);await load();summary();
   if(!config?.enabled)throw Error('กรุณาให้ Admin เปิดใช้และตั้งค่าจุดเริ่มเดินทางก่อน');
   if(T.bangkok(destination)||$('travel-area').value==='bangkok')throw Error('หน้างานกรุงเทพฯ ไม่คิดค่าเดินทาง กรุณาตรวจพื้นที่ให้ตรงหน้างาน');
   const origin=config.origin;message('กำลังดึงระยะทางขับรถจาก Google Maps…');
   const result=await GatewayClient.call(CONFIG.appsScriptUrl,{action:'travelDistance',origin,destination:target});
   if(generation!==routeGeneration)return;
   if(T.text($('travel-destination').value)!==destination||T.text($('travel-point')?.value||'')!==rawPoint||config.origin!==origin)throw Error('หน้างานหรือพิกัดเปลี่ยนระหว่างคำนวณ กรุณาดึงระยะทางใหม่');
   if(!Number.isFinite(result.km)||result.km<=0||result.km>3000)throw Error('ระยะทางจากเซิร์ฟเวอร์ไม่ถูกต้อง');
   $('travel-km').value=result.km;lastRoute={km:result.km,target};message('Google Maps: ระยะทางขับรถเที่ยวเดียว '+result.km+' กม. · '+(rawPoint?'ใช้พิกัดหมุด':'ใช้ข้อความที่อยู่ ยังไม่ได้ยืนยันหมุด')+' กรุณาเปิดเส้นทางตรวจทางเข้าหน้างาน และยืนยันพื้นที่ก่อนรวมราคา');
  }catch(e){if(generation===routeGeneration)message(e.message+' · ยังไม่ใช้ระยะเดิม หากค้นหาไม่พบให้ใช้พิกัดหมุด หรือเปิดเส้นทางตรวจแล้วกรอกระยะเที่ยวเดียวเอง');}finally{busy=false;$('travel-fetch').disabled=false;}
 }
 function restore(){fillOptions();}
 function init(){
  const box=document.createElement('details');box.id='travel-quote-card';box.className='card travel-card';box.innerHTML=`<summary>ค่าเดินทางนอกกรุงเทพฯ · รวมในราคางาน</summary>
<div class="travel-body travel-workflow">
  <input type="hidden" id="travel-recalc-required" value="">
  <div class="travel-intro"><p id="travel-rate-summary"></p><p>ระบุหน้างาน ตรวจระยะทาง แล้วจึงยืนยันรวมค่าเดินทางในราคา</p></div>
  <section class="travel-section" aria-labelledby="travel-site-heading">
    <h4 id="travel-site-heading"><span>1</span> ระบุหน้างาน</h4>
    <div class="travel-grid travel-site-grid">
      <div class="travel-field"><div class="travel-field-label"><label for="travel-destination">ที่อยู่หน้างานจริง</label><button type="button" class="btn btn-sm" id="travel-use-address">ใช้ที่อยู่จากใบเสนอราคา</button></div><textarea id="travel-destination" rows="2" placeholder="ชื่อสถานที่ / ที่อยู่หน้างาน"></textarea><p class="travel-hint">แก้เฉพาะหน้างานได้ ที่อยู่บนใบเสนอราคาจะไม่เปลี่ยน</p></div>
      <div class="travel-field"><label for="travel-point">พิกัดหน้างาน <span class="travel-optional">(ถ้ามี)</span></label><input id="travel-point" type="text" placeholder="ละติจูด, ลองจิจูด เช่น 13.7500, 100.5000"><p class="travel-hint">หากค้นหาที่อยู่ไม่เจอ ให้ใช้พิกัดหมุดตรงทางเข้าจริง</p><a href="https://www.google.com/maps" target="_blank" rel="noopener" class="btn btn-sm travel-pin-link">ค้นหาหมุดใน Google Maps ↗</a></div>
    </div>
  </section>
  <section class="travel-section" aria-labelledby="travel-distance-heading">
    <h4 id="travel-distance-heading"><span>2</span> ตรวจระยะทางและพื้นที่</h4>
    <div class="travel-grid travel-distance-grid">
      <div class="travel-field"><label for="travel-km">ระยะทางขับรถเที่ยวเดียว (กม.)</label><div class="travel-distance-entry"><input id="travel-km" type="number" min="0" max="3000" step="0.1" placeholder="ระบุระยะเที่ยวเดียว"><button type="button" class="btn btn-sm travel-fetch-button" id="travel-fetch">ดึงระยะทาง</button></div><div class="travel-route-review"><a id="travel-maps" href="https://www.google.com/maps" target="_blank" rel="noopener">เปิดตรวจเส้นทาง ↗</a><span>ดึงจาก Google Maps หรือกรอกระยะเองหลังตรวจเส้นทาง</span></div></div>
      <div class="travel-field"><label for="travel-area">พื้นที่หน้างาน</label><select id="travel-area"><option value="">กรุณาตรวจพื้นที่</option><option value="bangkok">กรุงเทพมหานคร · ไม่คิดค่าเดินทาง</option><option value="outside">นอกกรุงเทพมหานคร</option></select><p class="travel-hint">เลือกตามหน้างานจริง ไม่ใช่ที่อยู่ออกเอกสาร</p></div>
    </div>
    <p id="travel-message" role="status" aria-live="polite"></p>
  </section>
  <section class="travel-section travel-confirm-section" aria-labelledby="travel-confirm-heading">
    <h4 id="travel-confirm-heading"><span>3</span> ยืนยันก่อนรวมราคา</h4>
    <label class="travel-confirm-row"><input id="travel-confirmed" type="checkbox"><span>ตรวจหมุดและเส้นทางแล้ว หน้างานอยู่นอกกรุงเทพฯ และระยะทางเที่ยวเดียวถูกต้อง</span></label>
    <details class="travel-allocation-help"><summary>ดูวิธีรวมค่าเดินทางในราคา</summary><p>เฉลี่ยค่าเดินทางเท่ากันในทุกรายการสินค้า/บริการที่มีจำนวนและราคาตัวเลข โดยหารตามจำนวนเพื่อบวกในราคาต่อหน่วย ปัดราคา 2 ตำแหน่ง ไม่รวมแถวหัวข้อหรือหมายเหตุ ค่าเดินทางรวมก่อนส่วนลดและ VAT โดยไม่เพิ่มแถวในเอกสาร</p></details>
  </section>
</div>
<footer class="travel-actions"><button type="button" class="btn btn-sm travel-remove-button" id="travel-remove">นำค่าเดินทางออก</button><button type="button" class="btn btn-primary" id="travel-apply">ยืนยันและรวมค่าเดินทางในราคา →</button></footer>`;
  box.querySelector('#travel-fetch').addEventListener('click',fetchDistance);
  const dialog=document.createElement('dialog');dialog.id='travel-dialog';dialog.className='quote-floating';dialog.setAttribute('aria-labelledby','travel-dialog-title');
  const header=document.createElement('div');header.className='travel-dialog-header';
  const title=document.createElement('h3');title.id='travel-dialog-title';title.textContent='ค่าเดินทางนอกกรุงเทพฯ · รวมในราคางาน';
  const close=document.createElement('button');close.type='button';close.className='btn btn-sm';close.textContent='ปิด';close.addEventListener('click',()=>dialog.close());header.append(title,close);
  box.open=true;dialog.append(header,box);document.body.appendChild(dialog);
  const tool=document.createElement('button');tool.type='button';tool.id='travel-tool-open';tool.className='btn btn-sm';tool.textContent='ค่าเดินทาง';tool.setAttribute('aria-haspopup','dialog');tool.setAttribute('aria-controls','travel-dialog');$('nq-tools').prepend(tool);
  window.addEventListener('resize',()=>{const fab=$('nq-fab');if(!fab||!fab.getClientRects().length)return;const rect=fab.getBoundingClientRect();if(rect.right>innerWidth||rect.left<0){fab.style.left=Math.max(4,Math.min(rect.left,innerWidth-rect.width-4))+'px';fab.style.right='auto';}if(rect.top>innerHeight-80)fab.style.top=Math.max(4,innerHeight-80)+'px';});
  const openWindow=QuoteTools.floating(dialog,header);
  tool.addEventListener('click',async()=>{openWindow();try{await load();summary();}catch(e){message(e.message);}if(!$('travel-destination').value)$('travel-destination').value=$('q-cust-address').value;fillOptions();});
  dialog.addEventListener('close',()=>{if(tool.getClientRects().length)tool.focus();});
  const settings=document.createElement('section');settings.id='travel-settings-card';settings.className='card travel-card';settings.hidden=true;settings.innerHTML=`<div class="travel-body"><h3>ตั้งค่าเดินทางนอกกรุงเทพฯ · Admin</h3><label><input id="travel-setting-enabled" type="checkbox"> เปิดใช้ค่าเดินทาง</label><label for="travel-setting-origin">ที่อยู่จุดเริ่มเดินทาง</label><textarea id="travel-setting-origin" rows="2"></textarea><div class="travel-grid"><div><label for="travel-setting-rate">อัตราบาท / กิโลเมตร</label><input id="travel-setting-rate" type="number" min="0" step="0.01"></div><div><label for="travel-setting-trips">จำนวนเที่ยว</label><select id="travel-setting-trips"><option value="1">เที่ยวเดียว</option><option value="2">ไป–กลับ (ระยะทางเที่ยวเดียว × 2)</option></select></div></div><p>คิดเฉพาะระยะทาง ไม่รวมค่าทางด่วนหรือค่าใช้จ่ายอื่น ใบเสนอราคาเก่าไม่เปลี่ยนตามอัตราใหม่</p><button id="travel-setting-save" type="button" class="btn btn-primary btn-sm">บันทึกค่าเดินทาง</button><p id="travel-settings-message" role="status"></p></div>`;$('page-settings').appendChild(settings);
  $('travel-setting-save').addEventListener('click',saveSettings);$('travel-apply').addEventListener('click',apply);$('travel-remove').addEventListener('click',remove);
  for(const id of ['travel-destination','travel-point'])$(id).addEventListener('input',()=>{routeGeneration++;lastRoute=null;$('travel-km').value='';$('travel-confirmed').checked=false;});
  $('travel-km').addEventListener('input',()=>{routeGeneration++;lastRoute=null;$('travel-confirmed').checked=false;});
  $('travel-area').addEventListener('change',()=>{$('travel-confirmed').checked=false;if($('travel-area').value==='bangkok'){remove();message('หน้างานกรุงเทพฯ ไม่คิดค่าเดินทาง');}});
  $('travel-use-address').addEventListener('click',()=>{$('travel-destination').value=$('q-cust-address').value;routeGeneration++;lastRoute=null;$('travel-point').value='';$('travel-km').value='';$('travel-area').value=T.bangkok($('travel-destination').value)?'bangkok':'';$('travel-confirmed').checked=false;});
  $('travel-maps').addEventListener('click',event=>{try{if(!config?.origin)throw Error('โหลดอัตรา Admin ก่อนเปิดเส้นทาง');const target=T.routeTarget($('travel-destination').value,point()),params=new URLSearchParams({api:'1',origin:config.origin,destination:target,travelmode:'driving'});event.currentTarget.href='https://www.google.com/maps/dir/?'+params;}catch(e){event.preventDefault();message(e.message);}});
 }
 document.addEventListener('DOMContentLoaded',init);
 return {refresh,restore,reset,fetchDistance,openSettings,quantityChanged,validate:()=>{if($('travel-recalc-required')?.value==='1')throw Error('จำนวนเปลี่ยนหลังรวมค่าเดินทาง กรุณารวมค่าเดินทางใหม่ หรือเลือกนำค่าเดินทางออกก่อนบันทึก');TravelCost.validate(quoteItems,context());const m=quoteItems.find(it=>it.travel)?.travel;if(m&&(!$('travel-confirmed').checked||(T.text($('travel-destination').value)||point())!==T.text(m.destination)||point()!==T.text(m.routePoint||'')||$('travel-area').value!==m.area||Number($('travel-km').value)!==m.km||(typeof pricePeriod!=='undefined'&&pricePeriod)))throw Error('ข้อมูลค่าเดินทางเปลี่ยน กรุณาตรวจหน้างานและคำนวณใหม่ก่อนบันทึก');}};
})();
