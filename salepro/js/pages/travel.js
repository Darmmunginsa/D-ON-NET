const TravelQuote=(()=>{
 const T=TravelCost,$=id=>document.getElementById(id),key='TravelSettings_v1';let config=null,settingId=null,busy=false,lastAttached='',routeGeneration=0;
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
 function reset(){routeGeneration++;lastAttached='';for(const id of ['travel-km','travel-destination'])if($(id))$(id).value='';if($('travel-area'))$('travel-area').value='';if($('travel-confirmed'))$('travel-confirmed').checked=false;if($('travel-message'))message('');}
 function refresh(){
  const selected=$('travel-target')?.value;if(!selected)return fillOptions();fillOptions(selected);
 }
 function fillOptions(selected=''){
  const select=$('travel-target');if(!select)return;
  select.replaceChildren(new Option('เลือกรายการงานที่จะรวมค่าเดินทาง',''));
  for(const it of quoteItems.filter(T.eligible))select.add(new Option(it.name,String(it.id)));
  if([...select.options].some(o=>o.value===selected))select.value=selected;
  const attached=quoteItems.find(i=>i.travel);
  if(attached){const m=attached.travel,signature=String(attached.id)+'|'+m.at;if(lastAttached!==signature){$('travel-destination').value=m.destination;$('travel-area').value=m.area;$('travel-km').value=m.km;$('travel-confirmed').checked=true;lastAttached=signature;}select.value=String(attached.id);message(`รวมค่าเดินทาง ${fmt(m.amount)} บาท ใน “${attached.name}” แล้ว (ก่อนส่วนลดรวมและ VAT)\nอัตราที่ใช้ ${fmt(m.rate)} บาท/กม. × ${m.km} กม. × ${m.trips} เที่ยว`);}else lastAttached='';
  // Editing quantity/price/line discount requires removing the travel allocation first.
  for(const it of quoteItems){const row=[...document.querySelectorAll('#items-body tr[data-id]')].find(r=>r.dataset.id===String(it.id));if(row)for(const el of row.querySelectorAll('.col-qty input,.col-price input,.col-disc input')){el.disabled=!!it.travel;if(it.travel)el.title='นำค่าเดินทางออกก่อนแก้จำนวน ราคา หรือส่วนลด';}}
 }
 function remove(){T.remove(quoteItems);message('นำค่าเดินทางออกแล้ว คืนราคางานเดิม');$('items-body').innerHTML='';renderItems();}
 async function apply(){
  if(busy)return;
  try{busy=true;$('travel-apply').disabled=true;const previousOrigin=config?.origin;await load();summary();if(previousOrigin&&config?.origin!==previousOrigin){$('travel-confirmed').checked=false;throw Error('Admin เปลี่ยนจุดเริ่มเดินทาง กรุณาตรวจเส้นทางและยืนยันระยะทางใหม่');}
   const result=T.calculate(config,{destination:$('travel-destination').value,area:$('travel-area').value,confirmed:$('travel-confirmed').checked,km:$('travel-km').value});
   if(result.amount>0&&typeof pricePeriod!=='undefined'&&pricePeriod)throw Error('ค่าเดินทางใช้กับงานครั้งเดียว กรุณาเลือกงวดราคา/หน่วยปกติก่อนรวมค่าเดินทาง');
   T.apply(quoteItems,$('travel-target').value,result,{...context(),destination:T.text($('travel-destination').value)});$('items-body').innerHTML='';renderItems();
   if(result.amount===0)message(result.area==='bangkok'?'หน้างานกรุงเทพฯ ไม่คิดค่าเดินทาง':'ค่าเดินทางเป็น 0 บาทตามอัตราที่ตั้ง');
  }catch(e){message(e.message);}finally{busy=false;$('travel-apply').disabled=false;}
 }
 async function fetchDistance(){
  if(busy)return;
  const destination=T.text($('travel-destination').value),generation=routeGeneration;
  try{busy=true;$('travel-fetch').disabled=true;$('travel-confirmed').checked=false;await load();summary();
   if(!config?.enabled)throw Error('กรุณาให้ Admin เปิดใช้และตั้งค่าจุดเริ่มเดินทางก่อน');
   if(T.bangkok(destination)||$('travel-area').value==='bangkok')throw Error('หน้างานกรุงเทพฯ ไม่คิดค่าเดินทาง ไม่จำเป็นต้องเรียก API');
   if(destination.length<5)throw Error('กรุณาระบุที่อยู่หน้างานให้ชัดเจน');
   const origin=config.origin;message('กำลังดึงระยะทางขับรถจาก Google Maps…');
   const result=await GatewayClient.call(CONFIG.appsScriptUrl,{action:'travelDistance',origin,destination});
   if(generation!==routeGeneration)return;
   if(T.text($('travel-destination').value)!==destination||config.origin!==origin)throw Error('ที่อยู่เปลี่ยนระหว่างคำนวณ กรุณาดึงระยะทางใหม่');
   if(!Number.isFinite(result.km)||result.km<=0||result.km>3000)throw Error('ระยะทางจากเซิร์ฟเวอร์ไม่ถูกต้อง');
   $('travel-km').value=result.km;message(`Google Maps: ระยะทางขับรถเที่ยวเดียว ${result.km} กม. กรุณาตรวจเส้นทางและยืนยันพื้นที่นอกกรุงเทพฯ ก่อนรวมราคา`);
  }catch(e){if(generation===routeGeneration)message(e.message);}finally{busy=false;$('travel-fetch').disabled=false;}
 }
 function restore(){fillOptions();}
 function init(){
  const box=document.createElement('details');box.id='travel-quote-card';box.className='card travel-card';box.innerHTML=`<summary>ค่าเดินทางนอกกรุงเทพฯ · รวมในราคางาน</summary><div class="travel-body"><p id="travel-rate-summary"></p><p>เปิดเส้นทาง Google Maps แล้วตรวจและกรอกระยะทางขับรถเที่ยวเดียว ระบบคำนวณค่าเดินทางตามอัตรา Admin ยังไม่ได้เชื่อม API ดึงระยะทางอัตโนมัติ</p><label for="travel-destination">ที่อยู่หน้างานจริง</label><textarea id="travel-destination" rows="2"></textarea><button type="button" class="btn btn-sm" id="travel-use-address">ใช้ที่อยู่ลูกค้าในใบเสนอราคา</button> <a id="travel-maps" class="btn btn-sm" href="https://www.google.com/maps" target="_blank" rel="noopener">เปิดเส้นทาง Google Maps ↗</a><div class="travel-grid"><div><label for="travel-area">พื้นที่หน้างาน</label><select id="travel-area"><option value="">กรุณาตรวจพื้นที่</option><option value="bangkok">กรุงเทพมหานคร · ไม่คิดค่าเดินทาง</option><option value="outside">นอกกรุงเทพมหานคร</option></select></div><div><label for="travel-km">ระยะทางขับรถเที่ยวเดียว (กม.)</label><input id="travel-km" type="number" min="0" max="3000" step="0.1"></div></div><label><input id="travel-confirmed" type="checkbox"> ตรวจแล้วว่าหน้างานอยู่นอกกรุงเทพฯ และระยะทางเที่ยวเดียวถูกต้อง</label><label for="travel-target">รวมค่าเดินทางในรายการงาน</label><select id="travel-target"></select><p>เลือกรายการงานจำนวน 1 และไม่มีส่วนลดรายรายการ ค่าเดินทางรวมก่อนส่วนลดรวมและ VAT โดยไม่เพิ่มแถวใหม่ในเอกสาร</p><button type="button" class="btn btn-primary btn-sm" id="travel-apply">คำนวณและรวมในราคางาน</button> <button type="button" class="btn btn-sm" id="travel-remove">นำค่าเดินทางออก</button><p id="travel-message" role="status" aria-live="polite"></p></div>`;
  box.querySelector('.travel-body > p:nth-child(2)').textContent='ดึงระยะทางขับรถจาก Google Maps หรือตรวจเส้นทางแล้วกรอกเอง จากนั้นยืนยันพื้นที่นอกกรุงเทพฯ และรวมค่าเดินทางในราคางาน';
  const fetchButton=document.createElement('button');fetchButton.id='travel-fetch';fetchButton.type='button';fetchButton.className='btn btn-primary btn-sm';fetchButton.textContent='ดึงระยะทางจาก Google Maps';fetchButton.addEventListener('click',fetchDistance);box.querySelector('#travel-maps').after(fetchButton);
  const dialog=document.createElement('dialog');dialog.id='travel-dialog';dialog.setAttribute('aria-labelledby','travel-dialog-title');
  const header=document.createElement('div');header.className='travel-dialog-header';
  const title=document.createElement('h3');title.id='travel-dialog-title';title.textContent='ค่าเดินทางนอกกรุงเทพฯ · รวมในราคางาน';
  const close=document.createElement('button');close.type='button';close.className='btn btn-sm';close.textContent='ปิด';close.addEventListener('click',()=>dialog.close());header.append(title,close);
  box.open=true;dialog.append(header,box);document.body.appendChild(dialog);
  const tool=document.createElement('button');tool.type='button';tool.id='travel-tool-open';tool.className='btn btn-sm';tool.textContent='ค่าเดินทาง';tool.setAttribute('aria-haspopup','dialog');tool.setAttribute('aria-controls','travel-dialog');$('nq-tools').prepend(tool);
  window.addEventListener('resize',()=>{const fab=$('nq-fab');if(!fab||!fab.getClientRects().length)return;const rect=fab.getBoundingClientRect();if(rect.right>innerWidth||rect.left<0){fab.style.left=Math.max(4,Math.min(rect.left,innerWidth-rect.width-4))+'px';fab.style.right='auto';}if(rect.top>innerHeight-80)fab.style.top=Math.max(4,innerHeight-80)+'px';});
  tool.addEventListener('click',async()=>{if(dialog.open)return;dialog.showModal();try{await load();summary();}catch(e){message(e.message);}if(!$('travel-destination').value)$('travel-destination').value=$('q-cust-address').value;fillOptions();});
  dialog.addEventListener('close',()=>{if(tool.getClientRects().length)tool.focus();});
  const settings=document.createElement('section');settings.id='travel-settings-card';settings.className='card travel-card';settings.hidden=true;settings.innerHTML=`<div class="travel-body"><h3>ตั้งค่าเดินทางนอกกรุงเทพฯ · Admin</h3><label><input id="travel-setting-enabled" type="checkbox"> เปิดใช้ค่าเดินทาง</label><label for="travel-setting-origin">ที่อยู่จุดเริ่มเดินทาง</label><textarea id="travel-setting-origin" rows="2"></textarea><div class="travel-grid"><div><label for="travel-setting-rate">อัตราบาท / กิโลเมตร</label><input id="travel-setting-rate" type="number" min="0" step="0.01"></div><div><label for="travel-setting-trips">จำนวนเที่ยว</label><select id="travel-setting-trips"><option value="1">เที่ยวเดียว</option><option value="2">ไป–กลับ (ระยะทางเที่ยวเดียว × 2)</option></select></div></div><p>คิดเฉพาะระยะทาง ไม่รวมค่าทางด่วนหรือค่าใช้จ่ายอื่น ใบเสนอราคาเก่าไม่เปลี่ยนตามอัตราใหม่</p><button id="travel-setting-save" type="button" class="btn btn-primary btn-sm">บันทึกค่าเดินทาง</button><p id="travel-settings-message" role="status"></p></div>`;$('page-settings').appendChild(settings);
  $('travel-setting-save').addEventListener('click',saveSettings);$('travel-apply').addEventListener('click',apply);$('travel-remove').addEventListener('click',remove);
  $('travel-destination').addEventListener('input',()=>{$('travel-confirmed').checked=false;});
  $('travel-area').addEventListener('change',()=>{$('travel-confirmed').checked=false;if($('travel-area').value==='bangkok'){remove();message('หน้างานกรุงเทพฯ ไม่คิดค่าเดินทาง');}});
  $('travel-use-address').addEventListener('click',()=>{$('travel-destination').value=$('q-cust-address').value;$('travel-area').value=T.bangkok($('travel-destination').value)?'bangkok':'';$('travel-confirmed').checked=false;});
  $('travel-maps').addEventListener('click',event=>{if(!config?.origin||!T.text($('travel-destination').value)){event.preventDefault();message('โหลดอัตรา Admin และระบุที่อยู่หน้างานก่อนเปิดเส้นทาง');return;}const params=new URLSearchParams({api:'1',origin:config.origin,destination:T.text($('travel-destination').value),travelmode:'driving'});event.currentTarget.href='https://www.google.com/maps/dir/?'+params;});
 }
 document.addEventListener('DOMContentLoaded',init);
 return {refresh,restore,reset,openSettings,validate:()=>{TravelCost.validate(quoteItems,context());const m=quoteItems.find(it=>it.travel)?.travel;if(m&&(!$('travel-confirmed').checked||T.text($('travel-destination').value)!==T.text(m.destination)||$('travel-area').value!==m.area||Number($('travel-km').value)!==m.km||(typeof pricePeriod!=='undefined'&&pricePeriod)))throw Error('ข้อมูลค่าเดินทางเปลี่ยน กรุณาตรวจหน้างานและคำนวณใหม่ก่อนบันทึก');}};
})();
