// Fresh database namespace. Never imports browser drafts/settings from the old deployment.
const AppStorage=(()=>{
  const prefix='donnet:admin-db-1HkB3y5gXPp2cLn4YmDAddMGfnqQtPmJJDZ_RKLS84DU:';
  return {getItem:key=>window.localStorage.getItem(prefix+key),setItem:(key,value)=>window.localStorage.setItem(prefix+key,value),removeItem:key=>window.localStorage.removeItem(prefix+key)};
})();
const AuthSession=(()=>{
  const key='donnet:admin-db:google-id-token';let memory='';
  function clear(){memory='';try{window.sessionStorage.removeItem(key);}catch(e){}}
  function claims(token,audience){try{const parts=token.split('.');if(parts.length!==3)return null;const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));if(value.aud!==audience||value.exp*1000<=Date.now()+30000||value.hd!=='dongroups.com'||value.email_verified!==true||!value.email||!value.sub)return null;return value;}catch(e){return null;}}
  function token(audience){let value=memory;try{value=value||window.sessionStorage.getItem(key)||'';}catch(e){}if(!claims(value,audience)){clear();return '';}return value;}
  function accept(value,audience){if(!claims(value||'',audience)){clear();return false;}memory=value;try{window.sessionStorage.setItem(key,value);}catch(e){}return true;}
  function profile(audience){const value=token(audience);return value?claims(value,audience):null;}
  return {accept,token,profile,clear};
})();
const GatewayClient={async call(url,payload){
  const token=AuthSession.token(CONFIG.googleClientId);
  if(!token)throw new Error('กรุณาเข้าสู่ระบบ Google ใหม่ เซสชันยังไม่มีหรือหมดอายุ');
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(payload),credentials:'omit',redirect:'error'});
  let data;try{data=await response.json();}catch(e){throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง');}
  if(response.status===401){AuthSession.clear();throw new Error('กรุณาเข้าสู่ระบบ Google ใหม่ด้วยบัญชีบริษัทที่ได้รับอนุญาต');}
  if(!response.ok||!data||data.ok!==true)throw new Error(data?.error||'Gateway HTTP '+response.status);
  return data;
}};
