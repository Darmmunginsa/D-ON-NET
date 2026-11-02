(function(){
 'use strict';
 const defaults={custom:false,color:'#060b16',image:'',opacity:85,shade:35,blur:0,shadow:35,panel:96,fit:'cover',position:'center'};
 let identity='',saved={...defaults},draft=null,dialog,layer,fileGeneration=0,processing=false,returnFocus;
 const $=id=>document.getElementById(id);
 function email(){return typeof currentUser!=='undefined'?String(currentUser?.email||'').trim().toLowerCase():'';}
 function key(){return 'WorkspaceAppearance_v1_'+identity;}
 function clean(value){
   const v=value&&typeof value==='object'?value:{},out={...defaults};out.custom=v.custom===true;
   if(/^#[0-9a-f]{6}$/i.test(v.color||''))out.color=v.color;
   if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v.image||'')&&v.image.length<=1500000)out.image=v.image;
   for(const name of ['opacity','shade','shadow','panel','blur'])if(Number.isFinite(Number(v[name]))&&v[name]!==undefined)out[name]=Math.max(name==='panel'?70:0,Math.min(name==='blur'?20:100,Number(v[name])));
   if(['cover','contain','repeat'].includes(v.fit))out.fit=v.fit;
   if(['center','top','bottom','left','right'].includes(v.position))out.position=v.position;
   return out;
 }
 function apply(value){
   const v=clean(value);document.body.classList.toggle('ws-custom',!!identity&&v.custom);
   layer.style.backgroundColor=v.color;layer.style.setProperty('--ws-image',v.image?'url("'+v.image+'")':'none');
   layer.style.setProperty('--ws-opacity',v.opacity/100);layer.style.setProperty('--ws-shade',v.shade/100);layer.style.setProperty('--ws-blur',v.blur+'px');
   layer.style.setProperty('--ws-size',v.fit==='repeat'?'auto':v.fit);layer.style.setProperty('--ws-repeat',v.fit==='repeat'?'repeat':'no-repeat');layer.style.setProperty('--ws-position',v.position);
   document.body.style.setProperty('--ws-card-shadow',v.shadow===0?'none':`0 ${Math.round(v.shadow/6)}px ${Math.round(v.shadow*.65)}px rgba(0,0,0,${(v.shadow*.006).toFixed(2)})`);
   document.body.style.setProperty('--ws-panel-opacity',v.panel+'%');
 }
 function read(){try{return clean(JSON.parse(AppStorage.getItem(key())||'null'));}catch{return {...defaults};}}
 function account(){const next=email();if(next===identity)return;fileGeneration++;processing=false;if(dialog.open)dialog.close();identity=next;saved=identity?read():{...defaults};draft=null;apply(saved);}
 function fill(){
   for(const name of ['color','opacity','shade','blur','shadow','panel','fit','position'])$('ws-'+name).value=draft[name];
   $('ws-image-status').textContent=draft.image?'มีภาพพื้นหลังที่เลือกไว้':'ยังไม่ได้เลือกภาพ';
   for(const name of ['opacity','shade','blur','shadow','panel'])$('ws-'+name+'-value').textContent=draft[name]+(name==='blur'?' px':'%');
 }
 function open(){account();if(!identity)return;returnFocus=document.activeElement;draft={...saved};$('ws-status').textContent='';$('ws-file').value='';$('ws-save').disabled=false;processing=false;fill();dialog.showModal();}
 function cancel(){fileGeneration++;processing=false;apply(saved);draft=null;dialog.close();if(returnFocus?.isConnected)returnFocus.focus();}
 async function image(file){
   if(!file)return;
   const generation=++fileGeneration,owner=identity;processing=true;$('ws-save').disabled=true;$('ws-status').textContent='กำลังเตรียมภาพ…';
   try{
     if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB');
     const bitmap=await createImageBitmap(file);
     try{
       const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
       const ctx=canvas.getContext('2d');ctx.fillStyle=draft?.color||defaults.color;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
       let data=canvas.toDataURL('image/jpeg',.82);if(data.length>1500000)data=canvas.toDataURL('image/jpeg',.6);if(data.length>1500000)throw Error('รูปมีรายละเอียดมากเกินไป กรุณาเลือกรูปขนาดเล็กลง');
       if(generation!==fileGeneration||owner!==email()||!dialog.open)return;
       draft.image=data;draft.custom=true;apply(draft);fill();$('ws-status').textContent='เตรียมภาพแล้ว กดบันทึกเพื่อเก็บไว้';
     }finally{bitmap.close();}
   }catch(e){if(generation===fileGeneration)$('ws-status').textContent=e.message||'เปิดภาพไม่ได้';}
   finally{if(generation===fileGeneration){processing=false;$('ws-save').disabled=false;}}
 }
 function save(){
   if(processing||!draft)return;
   if(email()!==identity){account();return;}
   try{const value=clean(draft);AppStorage.setItem(key(),JSON.stringify(value));saved=value;apply(saved);dialog.close();draft=null;if(returnFocus?.isConnected)returnFocus.focus();}
   catch{$('ws-status').textContent='บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม กรุณาลดขนาดภาพหรือนำภาพออก แล้วลองใหม่';}
 }
 function init(){
   layer=document.createElement('div');layer.id='workspace-background';layer.setAttribute('aria-hidden','true');document.body.prepend(layer);
   dialog=document.createElement('dialog');dialog.id='workspace-appearance';dialog.setAttribute('aria-labelledby','ws-heading');
   dialog.innerHTML=`<div class="ws-heading"><h2 id="ws-heading">ปรับพื้นที่ทำงาน</h2><button type="button" id="ws-close" aria-label="ปิดการปรับพื้นที่ทำงาน">✕</button></div><p>ตั้งค่าเฉพาะบัญชีในเบราว์เซอร์เครื่องนี้ ใช้ร่วมกันทั้ง 4 ระบบ ภาพไม่ถูกส่งขึ้นเซิร์ฟเวอร์</p><label for="ws-file">ภาพพื้นหลังของคุณ</label><input id="ws-file" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG / PNG / WebP ไม่เกิน 10 MB ระบบย่อภาพก่อนเก็บ</small><div class="ws-image-tools"><span id="ws-image-status"></span><button type="button" id="ws-remove">นำภาพออก</button></div><div class="ws-grid"><div><label for="ws-color">สีพื้นหลัง</label><input id="ws-color" type="color"></div><div><label for="ws-fit">การวางภาพ</label><select id="ws-fit"><option value="cover">เต็มพื้นที่ (ครอบภาพ)</option><option value="contain">เห็นภาพครบ</option><option value="repeat">เรียงภาพซ้ำ</option></select></div><div><label for="ws-position">ตำแหน่งภาพ</label><select id="ws-position"><option value="center">ตรงกลาง</option><option value="top">ด้านบน</option><option value="bottom">ด้านล่าง</option><option value="left">ด้านซ้าย</option><option value="right">ด้านขวา</option></select></div></div>${[['opacity','ความเข้มของภาพ',0,100],['shade','ความมืดทับภาพ',0,100],['blur','ความเบลอของภาพ',0,20],['panel','ความทึบของการ์ด',70,100],['shadow','ระดับเงาการ์ด',0,100]].map(([id,label,min,max])=>`<label for="ws-${id}">${label} <output id="ws-${id}-value"></output></label><input id="ws-${id}" type="range" min="${min}" max="${max}" step="1">`).join('')}<p id="ws-status" role="status" aria-live="polite"></p><div class="ws-actions"><button type="button" id="ws-reset">คืนค่าเริ่มต้น</button><button type="button" id="ws-cancel">ยกเลิก</button><button type="button" id="ws-save">บันทึกพื้นที่ทำงาน</button></div>`;
   document.body.appendChild(dialog);
   for(const name of ['color','opacity','shade','blur','shadow','panel','fit','position'])$('ws-'+name).addEventListener('input',e=>{draft[name]=['color','fit','position'].includes(name)?e.target.value:Number(e.target.value);draft.custom=true;apply(draft);fill();});
   $('ws-file').addEventListener('change',e=>image(e.target.files[0]));
   $('ws-remove').addEventListener('click',()=>{fileGeneration++;processing=false;$('ws-save').disabled=false;draft.image='';draft.custom=true;$('ws-file').value='';$('ws-status').textContent='';apply(draft);fill();});
   $('ws-reset').addEventListener('click',()=>{fileGeneration++;processing=false;$('ws-save').disabled=false;draft={...defaults};$('ws-file').value='';$('ws-status').textContent='กดบันทึกเพื่อคืนค่าเริ่มต้น';apply(draft);fill();});
   $('ws-save').addEventListener('click',save);$('ws-close').addEventListener('click',cancel);$('ws-cancel').addEventListener('click',cancel);dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
   const button=document.createElement('button');button.type='button';button.className='btn btn-sm workspace-appearance-button';button.textContent='▧ พื้นที่ทำงาน';button.title='ปรับพื้นหลังและเงาของพื้นที่ทำงาน';button.addEventListener('click',open);
   const host=document.querySelector('#app-screen .topbar-right')||document.querySelector('#app-screen .topbar');if(host)host.appendChild(button);
   account();
   new MutationObserver(account).observe($('app-screen'),{attributes:true,attributeFilter:['style','class']});
   window.addEventListener('focus',account);
   window.addEventListener('storage',e=>{account();if(!dialog.open&&e.key?.endsWith(key())){saved=read();apply(saved);}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
