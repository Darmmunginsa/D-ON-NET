// Cloudflare Worker: verify Google RS256 ID tokens with native Web Crypto.
// The Apps Script URL and shared secret are Worker variables, not browser code.
let cachedKeys=null;
function decode(segment){if(!/^[A-Za-z0-9_-]+$/.test(segment))throw new Error('Invalid token');return Uint8Array.from(atob(segment.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));}
function jsonSegment(segment){return JSON.parse(new TextDecoder().decode(decode(segment)));}
async function keys(force=false){
 if(!force&&cachedKeys&&cachedKeys.until>Date.now())return cachedKeys.value;
 const response=await fetch('https://www.googleapis.com/oauth2/v3/certs');if(!response.ok)throw new Error('Google keys unavailable');
 const data=await response.json();if(!Array.isArray(data.keys))throw new Error('Invalid Google keys');
 const age=Math.min(21600,Number((response.headers.get('cache-control')||'').match(/max-age=(\d+)/)?.[1]||300));
 cachedKeys={value:data.keys,until:Date.now()+age*1000};return data.keys;
}
export async function verifyGoogleToken(token,audience,allowedEmails){
 if(!token||token.length>16000)throw new Error('Sign in required');const parts=token.split('.');if(parts.length!==3)throw new Error('Invalid token');
 const header=jsonSegment(parts[0]);if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('Invalid algorithm');
 let jwk=(await keys()).find(key=>key.kid===header.kid);if(!jwk)jwk=(await keys(true)).find(key=>key.kid===header.kid);if(!jwk)throw new Error('Unknown key');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));if(!valid)throw new Error('Invalid signature');
 const claims=jsonSegment(parts[1]),now=Math.floor(Date.now()/1000);
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==audience||(claims.azp&&claims.azp!==audience)||typeof claims.exp!=='number'||claims.exp<=now||typeof claims.iat!=='number'||claims.iat>now+60||(claims.nbf&&claims.nbf>now+60))throw new Error('Invalid token claims');
 const email=String(claims.email||'').toLowerCase();if(claims.email_verified!==true||claims.hd!=='dongroups.com'||!email.endsWith('@dongroups.com')||!claims.sub||!allowedEmails.includes(email))throw new Error('Account not allowed');
 return {email,sub:claims.sub,name:String(claims.name||email)};
}
export default {async fetch(request,env){
 if(new URL(request.url).pathname==='/warranty')return publicWarrantyRoute(request,env);
 const origin=request.headers.get('origin')||'';
 const origins=String(env.ALLOWED_ORIGINS||'https://darmmunginsa.github.io').split(',').map(value=>value.trim());
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 if(origins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!origins.includes(origin))return reply({ok:false,error:'Origin not allowed'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({ok:false,error:'POST required'},405);
 if(!env.GOOGLE_CLIENT_ID||!env.APPS_SCRIPT_URL||!env.GATEWAY_SECRET||env.GATEWAY_SECRET.length<32)return reply({ok:false,error:'Gateway setup incomplete'},503);
 let identity;
 try{const token=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/)?.[1];identity=await verifyGoogleToken(token,env.GOOGLE_CLIENT_ID,String(env.ALLOWED_EMAILS||'admin@dongroups.com').split(',').map(value=>value.trim().toLowerCase()));}
 catch{return reply({ok:false,error:'กรุณาเข้าสู่ระบบ Google ด้วยบัญชีที่ได้รับอนุญาตอีกครั้ง'},401);}
 let payload;try{const raw=await request.text();if(raw.length>8*1024*1024)return reply({ok:false,error:'ไฟล์แนบใหญ่เกินขนาดที่รองรับ'},413);payload=JSON.parse(raw);if(!payload||Array.isArray(payload)||typeof payload!=='object')throw new Error();}catch{return reply({ok:false,error:'Invalid request'},400);}
 // Caller cannot override the verified actor or server-only shared secret.
 payload.email=identity.email;payload.replyTo=identity.email;payload._actor=identity;payload.gatewaySecret=env.GATEWAY_SECRET;
 try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),55000);let response;try{response=await fetch(env.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:controller.signal,redirect:'follow'});}finally{clearTimeout(timer);}
 if(!response.ok)return reply({ok:false,error:'Backend unavailable; check Apps Script Executions'},502);
 const data=await response.json();return reply(data);
 }catch{return reply({ok:false,error:'ยังยืนยันผลจากเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสถานะก่อนส่งซ้ำ'},502);}
}};

async function publicWarrantyRoute(request,env){
 const origin=request.headers.get('Origin')||'';
 const allowed=String(env.PUBLIC_WARRANTY_ORIGINS||'https://www.dongroups.com,https://dongroups.com').split(',').map(s=>s.trim());
 const headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed.includes(origin))return reply({ok:false,error:'Origin not allowed'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({ok:false,error:'POST required'},405);
 if(!env.WARRANTY_RATE_LIMITER||!env.APPS_SCRIPT_URL||!env.GATEWAY_SECRET)return reply({ok:false,error:'Warranty lookup not configured'},503);
 const ip=request.headers.get('CF-Connecting-IP');if(!ip)return reply({ok:false,error:'Request unavailable'},403);
 let limit;try{limit=await env.WARRANTY_RATE_LIMITER.limit({key:'warranty:'+ip});}catch{return reply({ok:false,error:'Lookup unavailable'},503);}if(!limit.success)return reply({ok:false,error:'กรุณารอสักครู่ก่อนค้นหาอีกครั้ง'},429);
 let input;try{const reader=request.body?.getReader();if(!reader)throw Error();let total=0,parts=[];for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>512){await reader.cancel();throw Error();}parts.push(chunk.value);}const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({ok:false,error:'Invalid request'},400);}
 const serial=String(input?.serial||'').trim().toUpperCase().replace(/\s+/g,'');if(!/^[A-Z0-9][A-Z0-9._\/-]{2,79}$/.test(serial))return reply({ok:true,found:false});
 try{const response=await fetch(env.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'publicWarrantyLookup',serial,gatewaySecret:env.GATEWAY_SECRET}),redirect:'follow',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();const result=await response.json();if(result.ok!==true)throw Error();if(!result.found)return reply({ok:true,found:false});const w=result.warranty;if(w?.serial!==serial||!/^\d{4}-\d{2}-\d{2}$/.test(w.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(w.expiryDate))throw Error();return reply({ok:true,found:true,warranty:{serial,model:String(w.model||'').slice(0,160),startDate:w.startDate,expiryDate:w.expiryDate}});}catch{return reply({ok:false,error:'ยังตรวจสอบข้อมูลไม่ได้ กรุณาติดต่อทีมงาน'},502);}
}
