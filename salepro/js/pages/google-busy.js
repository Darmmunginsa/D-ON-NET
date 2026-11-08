// Private Google Calendar overlay. Tokens and availability stay in memory only.
const GoogleBusy=(()=>{
 const scope='https://www.googleapis.com/auth/calendar.freebusy';
 let token='',expires=0,owner='',generation=0,pending=false,active=false,cache=new Map(),notify=()=>{};
 const user=()=>String(currentUser?.email||'');
 const day=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
 const time=ms=>new Date(ms+7*3600000).toISOString().slice(11,16);
 const bound=date=>Date.parse(date+'T00:00:00+07:00');
 function status(message){const el=document.getElementById('google-busy-status');if(el)el.textContent=message;}
 function clear(){generation++;token='';expires=0;owner='';active=false;pending=false;cache.clear();status('ยังไม่เชื่อม Google Calendar ส่วนตัว');notify();}
 function validOwner(){if(owner&&owner!==user())clear();return !!owner&&owner===user();}
 function range(month){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return [month+'-01',d.toISOString().slice(0,10)];}
 async function query(start,end){
  if(!validOwner()||!token||Date.now()>=expires)throw Error('สิทธิ์ Calendar หมดอายุ กรุณากดเชื่อม Google Calendar อีกครั้ง');
  const request=generation,who=owner;
  const response=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start+'T00:00:00+07:00',timeMax:end+'T00:00:00+07:00',timeZone:'Asia/Bangkok',items:[{id:'primary'}]})});
  if(request!==generation||who!==user())throw Error('บัญชีเปลี่ยน กรุณาเชื่อม Calendar ใหม่');
  if(!response.ok){if(response.status===401){token='';expires=0;}throw Error(response.status===403?'อ่าน Calendar ไม่ได้ กรุณาเปิด Google Calendar API และอนุญาตสิทธิ์ใน Google Cloud':'โหลด Calendar ไม่สำเร็จ ('+response.status+')');}
  const result=await response.json(),calendar=result.calendars?.primary;
  if(request!==generation||who!==user())throw Error('บัญชีเปลี่ยน กรุณาเชื่อม Calendar ใหม่');
  if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw Error('Google ส่งข้อมูลเวลาว่างไม่ครบ กรุณาลองใหม่');
  const periods=calendar.busy.map(b=>({start:Date.parse(b.start),end:Date.parse(b.end)}));
  if(periods.some(b=>!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.end<=b.start))throw Error('รูปแบบช่วงไม่ว่างไม่ถูกต้อง กรุณาโหลดใหม่');
  return periods;
 }
 async function connect(){
  if(pending)return;
  if(!user())return toast('กรุณาเข้าสู่ระบบก่อน','error');
  if(typeof google==='undefined'||!google.accounts?.oauth2)return toast('Google Login ยังไม่พร้อม กรุณาโหลดหน้าใหม่','error');
  clear();owner=user();const request=generation;pending=true;status('เลือกบัญชี Google และอนุญาตอ่านช่วงไม่ว่าง...');
  const fail=message=>{if(request!==generation)return;pending=false;status(message);};
  try{
   const client=google.accounts.oauth2.initTokenClient({client_id:CONFIG.googleClientId,scope,include_granted_scopes:false,
    callback:response=>{if(request!==generation||owner!==user())return;
     if(!response.access_token||response.error||!google.accounts.oauth2.hasGrantedAllScopes(response,scope))return fail('ยังไม่ได้อนุญาต Calendar กรุณากดเชื่อมใหม่');
     token=response.access_token;expires=Date.now()+Math.max(0,Number(response.expires_in||3600)*1000-60000);active=true;pending=false;status('เชื่อมแล้ว · ปฏิทินหลัก · เฉพาะช่วงไม่ว่างของฉัน');notify();},
    error_callback:()=>fail('ยังไม่เชื่อมต่อ · ปิดหน้าต่างหรือไม่ได้อนุญาต')});
   client.requestAccessToken({prompt:'select_account'});
  }catch(e){fail('เชื่อมไม่ได้: '+e.message);}
 }
 async function syncMonth(month,force=false){
  if(!validOwner()||!active||!/^\d{4}-\d{2}$/.test(month))return;
  const existing=cache.get(month);
  if(existing?.loading||(!force&&existing))return;
  const request=generation,entry={loading:true,busy:[]};cache.set(month,entry);status('กำลังโหลดช่วงไม่ว่าง '+month+'...');
  try{const dates=range(month),busy=await query(...dates);if(request!==generation)return;cache.set(month,{busy,loading:false});status('อัปเดตช่วงไม่ว่าง '+month+' แล้ว · แสดงเฉพาะตัวเอง');}
  catch(e){if(request!==generation)return;cache.set(month,{busy:[],loading:false,error:e.message});status(e.message+' · ยังยืนยันเวลาว่างไม่ได้');}
  finally{if(request===generation)notify();}
 }
 function events(month){
  if(!validOwner()||!active||!/^\d{4}-\d{2}$/.test(month))return [];
  if(Date.now()>=expires){status('สิทธิ์ Calendar หมดอายุ กรุณากดเชื่อมใหม่ · ยังยืนยันเวลาว่างไม่ได้');return [];}
  const dates=range(month),start=bound(dates[0]),end=bound(dates[1]),out=[];
  for(const [index,b] of (cache.get(month)?.busy||[]).entries()){
   for(let cursor=bound(day(Math.max(start,b.start)));cursor<Math.min(end,b.end);cursor+=86400000){
    const a=Math.max(cursor,b.start),z=Math.min(cursor+86400000,b.end);if(z<=a)continue;
    const date=day(cursor),from=time(a),to=z===cursor+86400000?'24:00':time(z);
    out.push({id:'googlebusy:'+date+':'+index,source:'googlebusy',type:'googlebusy',date,time:from,title:'ไม่ว่าง (ส่วนตัว)',client:'Google Calendar',ref:'',owner:'เฉพาะฉัน',done:false,detail:from+'–'+to+' น. · ไม่เปิดเผยรายละเอียดนัด',durationMinutes:(z-a)/60000});
   }
  }
  return out;
 }
 async function confirmSlot(scheduledAt,duration){
  if(!validOwner()||!active)return true;
  const start=Date.parse(scheduledAt+':00+07:00');if(!Number.isFinite(start))throw Error('วันเวลานัดไม่ถูกต้อง');
  const minutes=Number(duration),known=minutes>0,end=start+(known?minutes:1)*60000;
  const until=day(end-1),next=new Date(bound(until)+86400000+7*3600000).toISOString().slice(0,10);
  const blocks=await query(day(start),next);
  const hit=blocks.some(b=>known?start<b.end&&end>b.start:day(b.start)<=day(start)&&day(b.end-1)>=day(start));
  if(!hit)return true;
  return confirm((known?'นัดนี้ทับช่วงไม่ว่างใน Google Calendar ส่วนตัว':'วันนี้มีช่วงไม่ว่างใน Google Calendar ส่วนตัว และยังไม่ระบุระยะเวลาทำงาน')+'\nตรวจสอบเวลารวมการเดินทางแล้ว ต้องการจัดคิวต่อหรือไม่?');
 }
 function mount(host,repaint,getMonth){
  notify=repaint;const box=document.createElement('div');box.className='cal-help';box.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="google-busy-connect">เชื่อม Google Calendar ส่วนตัว</button><button type="button" class="btn" id="google-busy-refresh">โหลดช่วงไม่ว่างใหม่</button><button type="button" class="btn" id="google-busy-disconnect">ตัดการเชื่อมต่อ</button></div><p id="google-busy-status" role="status">ยังไม่เชื่อม Google Calendar ส่วนตัว</p><small>แสดงเฉพาะปฏิทินหลักของบัญชีที่เลือก เฉพาะตัวเองในรอบใช้งานนี้ · ไม่บันทึกรายละเอียดนัดลงระบบ · ติ๊กตัวกรองเพื่อซ่อน/แสดง</small>';
  host.prepend(box);document.getElementById('google-busy-connect').onclick=connect;document.getElementById('google-busy-refresh').onclick=()=>syncMonth(getMonth(),true);document.getElementById('google-busy-disconnect').onclick=clear;
 }
 return {mount,syncMonth,events,confirmSlot,clear};
})();
