// Fresh database namespace. Never imports browser drafts/settings from the old deployment.
const AppStorage=(()=>{
  const prefix='donnet:admin-db-1HkB3y5gXPp2cLn4YmDAddMGfnqQtPmJJDZ_RKLS84DU:';
  return {getItem:key=>window.localStorage.getItem(prefix+key),setItem:(key,value)=>window.localStorage.setItem(prefix+key,value),removeItem:key=>window.localStorage.removeItem(prefix+key)};
})();
const AuthSession=(()=>{
  const key='donnet:admin-db:google-id-token';let memory='',aud='',timer=null,notice=null;
  function clear(){memory='';if(timer!==null){clearTimeout(timer);timer=null;}try{window.sessionStorage.removeItem(key);}catch(e){}}
  function expired(){
    clear();
    if(typeof document==='undefined'||!document.body||notice)return;
    notice=document.createElement('div');notice.id='session-expired-notice';
    notice.setAttribute('role','alertdialog');notice.setAttribute('aria-modal','true');notice.setAttribute('aria-labelledby','session-expired-title');notice.tabIndex=-1;
    notice.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#081324dd;display:flex;align-items:center;justify-content:center;padding:20px;color:#172b42;font:16px/1.65 sans-serif';
    const box=document.createElement('div');box.style.cssText='background:#fff;border-radius:16px;padding:28px;max-width:460px;width:100%;box-shadow:0 12px 48px #0006';
    const title=document.createElement('h2');title.id='session-expired-title';title.textContent='Session หมดอายุ กรุณาเข้าสู่ระบบใหม่';title.style.cssText='font-size:21px;margin:0 0 12px;color:#172b42';
    const text=document.createElement('p');text.textContent='ไม่สามารถบันทึกหรือโหลดข้อมูลเพิ่มได้จนกว่าจะเข้าสู่ระบบใหม่ ระบบจะไม่ส่งรายการที่ล้มเหลวซ้ำอัตโนมัติ เมื่อกลับหน้าเข้าสู่ระบบ ข้อมูลที่ยังไม่ได้บันทึกอาจหายไป';
    const button=document.createElement('button');button.type='button';button.textContent='กลับหน้าเข้าสู่ระบบ';button.style.cssText='padding:12px 18px;border:0;border-radius:8px;background:#075985;color:#fff;font:inherit;cursor:pointer';
    button.addEventListener('click',()=>{notice.remove();notice=null;if(typeof logout==='function')logout();else if(typeof signOut==='function')signOut();else window.location.reload();});
    box.append(title,text,button);notice.appendChild(box);document.body.appendChild(notice);notice.focus();
    notice.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();button.focus();}});
  }
  function error(){const e=new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ Google ใหม่');e.code='SESSION_EXPIRED';return e;}
  function watch(value,audience){aud=audience;if(timer!==null)clearTimeout(timer);if(typeof setTimeout!=='function')return;const p=claims(value,audience);if(p)timer=setTimeout(()=>{timer=null;token(aud);},Math.max(0,p.exp*1000-Date.now()-30000));}
  function claims(token,audience){try{const parts=token.split('.');if(parts.length!==3)return null;const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));if(value.aud!==audience||value.exp*1000<=Date.now()+30000||value.hd!=='dongroups.com'||value.email_verified!==true||!value.email||!value.sub)return null;return value;}catch(e){return null;}}
  function token(audience){let value=memory;try{value=value||window.sessionStorage.getItem(key)||'';}catch(e){}if(!claims(value,audience)){if(value)expired();else clear();return '';}if(!aud||timer===null)watch(value,audience);return value;}
  function accept(value,audience){if(!claims(value||'',audience)){clear();return false;}memory=value;try{window.sessionStorage.setItem(key,value);}catch(e){}if(notice){notice.remove();notice=null;}watch(value,audience);return true;}
  function profile(audience){const value=token(audience);return value?claims(value,audience):null;}
  if(typeof window.addEventListener==='function'){window.addEventListener('focus',()=>{if(aud)token(aud);});window.addEventListener('pageshow',()=>{if(aud)token(aud);});}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden&&aud)token(aud);});
  return {accept,token,profile,clear,expired,error};
})();
const GatewayClient={async call(url,payload){
  const token=AuthSession.token(CONFIG.googleClientId);
  if(!token){AuthSession.expired();throw AuthSession.error();}
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(payload),credentials:'omit',redirect:'error'});
  if(response.status===401){if(AuthSession.token(CONFIG.googleClientId)===token)AuthSession.expired();throw AuthSession.error();}
  let data;try{data=await response.json();}catch(e){throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง');}
  if(!response.ok||!data||data.ok!==true)throw new Error(data?.error||'Gateway HTTP '+response.status);
  return data;
}};
