// Fresh database namespace. Never imports browser drafts/settings from the old deployment.
const AppStorage=(()=>{
  const prefix='donnet:admin-db-1HkB3y5gXPp2cLn4YmDAddMGfnqQtPmJJDZ_RKLS84DU:';
  return {getItem:key=>window.localStorage.getItem(prefix+key),setItem:(key,value)=>window.localStorage.setItem(prefix+key,value),removeItem:key=>window.localStorage.removeItem(prefix+key)};
})();
const AuthSession=(()=>{
  const key='donnet:admin-db:google-id-token',activityKey=key+':activity';
  const idleMs=60*60*1000,warningMs=5*60*1000;
  let memory='',aud='',timer=null,notice=null,warning=null,warningKind='',lastActivity=0,identity='',refreshing=false,attempted='';
  function removeWarning(){if(warning){warning.remove();warning=null;warningKind='';}}
  function clear(){if(refreshing){try{if(typeof google!=='undefined')google.accounts?.id?.cancel?.();}catch(e){}}memory='';identity='';refreshing=false;attempted='';lastActivity=0;if(timer!==null){clearTimeout(timer);timer=null;}removeWarning();if(notice){notice.remove();notice=null;}try{window.sessionStorage.removeItem(key);window.sessionStorage.removeItem(activityKey);}catch(e){}}
  function error(){const e=new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ Google ใหม่');e.code='SESSION_EXPIRED';return e;}
  function claims(token,audience){try{const parts=token.split('.');if(parts.length!==3)return null;const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));if(value.aud!==audience||value.exp*1000<=Date.now()+30000||value.hd!=='dongroups.com'||value.email_verified!==true||!value.email||!value.sub)return null;return value;}catch(e){return null;}}
  function rememberActivity(){try{window.sessionStorage.setItem(activityKey,String(lastActivity));}catch(e){}}
  function googleButton(host){try{if(typeof _initGIS==='function')_initGIS();if(typeof google!=='undefined'&&google.accounts?.id)google.accounts.id.renderButton(host,{theme:'filled_blue',size:'large',text:'continue_with'});}catch(e){}}
  function expired(reason='token'){
    if(notice)return;const previous=identity;clear();identity=previous;
    if(typeof document==='undefined'||!document.body)return;
    notice=document.createElement('div');notice.id='session-expired-notice';notice.setAttribute('role','alertdialog');notice.setAttribute('aria-modal','true');notice.setAttribute('aria-labelledby','session-expired-title');notice.tabIndex=-1;
    notice.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#081324dd;display:flex;align-items:center;justify-content:center;padding:20px;color:#172b42;font:16px/1.65 sans-serif';
    const box=document.createElement('div');box.style.cssText='background:#fff;border-radius:16px;padding:28px;max-width:480px;width:100%;box-shadow:0 12px 48px #0006';
    const title=document.createElement('h2');title.id='session-expired-title';title.textContent=reason==='idle'?'ไม่ได้ใช้งานเกิน 60 นาที':'Session Google หมดอายุ';title.style.cssText='font-size:21px;margin:0 0 12px;color:#172b42';
    const text=document.createElement('p');text.id='session-expired-message';text.textContent='ยืนยัน Google ด้วยบัญชีเดิมเพื่อทำงานต่อในหน้านี้ ข้อมูลที่กรอกยังอยู่ตราบใดที่ไม่ปิดหรือโหลดหน้าใหม่ ระบบจะไม่ส่งรายการที่ล้มเหลวซ้ำอัตโนมัติ';
    const button=document.createElement('button');button.type='button';button.textContent='กลับหน้าเข้าสู่ระบบ';button.style.cssText='padding:12px 18px;border:0;border-radius:8px;background:#075985;color:#fff;font:inherit;cursor:pointer';button.addEventListener('click',()=>{clear();if(typeof logout==='function')logout();else if(typeof signOut==='function')signOut();else window.location.reload();});
    const host=document.createElement('div');host.style.cssText='margin-top:16px;min-height:44px';box.append(title,text,button,host);notice.appendChild(box);document.body.appendChild(notice);googleButton(host);notice.focus();
    notice.addEventListener('keydown',e=>{if(e.key==='Tab'&&typeof notice.querySelectorAll==='function'){const controls=[...notice.querySelectorAll('button,[tabindex="0"],iframe')];const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  }
  function showWarning(kind){
    if(typeof document==='undefined'||!document.body||notice)return;
    if(!warning){warning=document.createElement('div');warning.id='session-warning';warning.setAttribute('role','status');warning.style.cssText='position:fixed;bottom:18px;right:18px;z-index:2147483646;max-width:440px;background:#fff;color:#172b42;border:2px solid #d97706;border-radius:10px;padding:16px;font:14px/1.6 sans-serif;box-shadow:0 6px 25px #0004';document.body.appendChild(warning);}
    if(warningKind===kind)return;warningKind=kind;warning.replaceChildren();const text=document.createElement('p');text.textContent=kind==='idle'?'อีกไม่เกิน 5 นาทีจะครบเวลาไม่ใช้งาน 60 นาที คลิกหรือพิมพ์เพื่อใช้งานต่อ':'Google ใกล้หมดอายุ กรุณายืนยันบัญชีเดิมเพื่อทำงานต่อโดยไม่ล้างฟอร์ม';warning.appendChild(text);
    if(kind==='token'){const host=document.createElement('div');warning.appendChild(host);googleButton(host);}
  }
  function watch(value,audience){aud=audience;if(timer!==null)clearTimeout(timer);if(typeof setTimeout!=='function')return;const p=claims(value,audience);if(!p){expired();return;}const now=Date.now(),expiry=p.exp*1000-30000,remaining=lastActivity+idleMs-now;
    if(remaining<=0){expired('idle');return;}
    const nearToken=expiry-now<=warningMs;
    if(remaining<=warningMs)showWarning('idle');else if(nearToken)showWarning('token');else removeWarning();
    if(nearToken&&attempted!==value&&remaining>warningMs){attempted=value;try{if(typeof _initGIS==='function')_initGIS();if(typeof google!=='undefined'&&google.accounts?.id){refreshing=true;google.accounts.id.prompt();}}catch(e){refreshing=false;}}
    const next=Math.min(expiry,lastActivity+idleMs,remaining>warningMs?lastActivity+idleMs-warningMs:Infinity,!nearToken?expiry-warningMs:Infinity);
    timer=setTimeout(()=>{timer=null;token(aud);},Math.max(1,next-now));
  }
  function token(audience){let value=memory;try{value=value||window.sessionStorage.getItem(key)||'';if(!lastActivity)lastActivity=Number(window.sessionStorage.getItem(activityKey))||Date.now();}catch(e){}if(value&&Date.now()-lastActivity>=idleMs){expired('idle');return '';}
    const p=claims(value,audience);if(!p){if(value)expired();return '';}
    memory=value;identity=p.sub;if(!aud||timer===null)watch(value,audience);return value;
  }
  function accept(value,audience){const p=claims(value||'',audience);if(!p){clear();return false;}memory=value;identity=p.sub;lastActivity=Date.now();rememberActivity();try{window.sessionStorage.setItem(key,value);}catch(e){}if(notice){notice.remove();notice=null;}removeWarning();refreshing=false;watch(value,audience);return true;}
  // Consume re-authentication without running afterLogin/initNewQuote again.
  function refreshCredential(value,audience){if(!refreshing&&!notice)return false;const p=claims(value||'',audience);if(!p||!identity||p.sub!==identity){const message=typeof document!=='undefined'?document.getElementById('session-expired-message'):null;if(message)message.textContent='กรุณาใช้บัญชีเดิมเพื่อกลับไปยังข้อมูลที่ค้างอยู่ หากต้องการเปลี่ยนบัญชี ให้กลับหน้าเข้าสู่ระบบ';return true;}
    const previousActivity=lastActivity,wasExpired=!!notice;accept(value,audience);if(!wasExpired){lastActivity=previousActivity;rememberActivity();watch(value,audience);}return true;}
  function activity(){if(!memory||notice)return;const now=Date.now();if(now-lastActivity>=idleMs){expired('idle');return;}if(now-lastActivity<5000)return;lastActivity=now;rememberActivity();watch(memory,aud);}
  function profile(audience){const value=token(audience);return value?claims(value,audience):null;}
  if(typeof window.addEventListener==='function'){window.addEventListener('focus',()=>{if(aud)token(aud);});window.addEventListener('pageshow',()=>{if(aud)token(aud);});}
  if(typeof document!=='undefined'){document.addEventListener('visibilitychange',()=>{if(!document.hidden&&aud)token(aud);});for(const event of ['pointerdown','keydown','input','wheel','touchstart'])document.addEventListener(event,activity,{passive:true});}
  return {accept,token,profile,clear,expired,error,refreshCredential};
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
