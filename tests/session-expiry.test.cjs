const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../shared/gateway-client.js'),'utf8');
function runtime(){
  let now=1800000000000,next=0,requests=0,logouts=0;
  const timers=new Map(),events={},nodes=[],session=new Map();
  function element(){return {style:{},children:[],setAttribute(){},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},replaceChildren(...items){this.children=items;},addEventListener(name,fn){this[name]=fn;},focus(){},remove(){this.removed=true;}};}
  const body=element(),document={body,hidden:false,getElementById:id=>nodes.find(n=>n.id===id&&!n.removed),createElement(){const n=element();nodes.push(n);return n;},addEventListener(name,fn){events[name]=fn;}};
  const storage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
  const c=vm.createContext({document,window:{sessionStorage:storage,localStorage:storage,addEventListener:(name,fn)=>{events[name]=fn;}},Date:{now:()=>now},TextDecoder,Uint8Array,atob,setTimeout:(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next;},clearTimeout:id=>timers.delete(id),logout:()=>logouts++,fetch:async()=>{requests++;return {status:200,ok:true,json:async()=>({ok:true})};}});
  vm.runInContext("const CONFIG={googleClientId:'test'};"+code,c);
  const auth=vm.runInContext('AuthSession',c),client=vm.runInContext('GatewayClient',c);
  const token=(sub='user',life=90000)=>'header.'+Buffer.from(JSON.stringify({aud:'test',exp:(now+life)/1000,hd:'dongroups.com',email_verified:true,email:'user@dongroups.com',sub})).toString('base64url')+'.signature';
  return {c,auth,client,token,timers,events,session,nodes,body,advance(ms){now+=ms;},fire(){for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},notices:()=>body.children.filter(n=>n.id==='session-expired-notice'&&!n.removed),requests:()=>requests,logouts:()=>logouts};
}
test('idle expiry notifies once, clears token and prevents network writes',async()=>{
 const r=runtime();r.auth.accept(r.token(),'test');r.advance(60000);r.fire();assert.equal(r.notices().length,1);assert.equal(r.session.size,0);assert.equal(r.logouts(),0);
 await assert.rejects(r.client.call('/gateway',{action:'create'}),{code:'SESSION_EXPIRED'});r.events.focus();assert.equal(r.notices().length,1);assert.equal(r.requests(),0);
 r.notices()[0].children[0].children[2].click();assert.equal(r.logouts(),1);assert.equal(r.notices().length,0);
});
test('returning to sleeping tab catches expiry even without timer execution',()=>{
 const r=runtime();r.auth.accept(r.token(),'test');r.advance(100000);r.events.visibilitychange();assert.equal(r.notices().length,1);
});
test('manual logout cancels expiry timer without an expiry warning',()=>{
 const r=runtime();r.auth.accept(r.token(),'test');r.auth.clear();r.advance(100000);r.fire();r.events.focus();assert.equal(r.notices().length,0);assert.equal(r.timers.size,0);
});
test('401 with non-JSON body still displays expiry; no retry',async()=>{
 const r=runtime();r.auth.accept(r.token(),'test');let calls=0;r.c.fetch=async()=>{calls++;return {status:401,json:async()=>{throw Error('HTML');}};};await assert.rejects(r.client.call('/gateway',{action:'create'}),{code:'SESSION_EXPIRED'});assert.equal(r.notices().length,1);assert.equal(calls,1);
});
test('late 401 from old request does not clear newly accepted session',async()=>{
 const r=runtime();r.auth.accept(r.token(),'test');let finish;r.c.fetch=()=>new Promise(resolve=>{finish=resolve;});const request=r.client.call('/gateway',{});const renewed=r.token('renewed');r.auth.accept(renewed,'test');finish({status:401});await assert.rejects(request);assert.equal(r.auth.token('test'),renewed);assert.equal(r.notices().length,0);
});
test('403 permission denial and network failure do not expire valid session',async()=>{
 const r=runtime(),value=r.token();r.auth.accept(value,'test');r.c.fetch=async()=>({status:403,ok:false,json:async()=>({ok:false,error:'Forbidden'})});await assert.rejects(r.client.call('/gateway',{}),/Forbidden/);r.c.fetch=async()=>{throw Error('offline');};await assert.rejects(r.client.call('/gateway',{}),/offline/);assert.equal(r.auth.token('test'),value);assert.equal(r.notices().length,0);
});

test('4-hour inactivity limit warns at 235 minutes and blocks requests at 240',async()=>{
 const r=runtime();r.auth.accept(r.token('user',10*60*60*1000),'test');r.advance(235*60*1000);r.fire();assert.equal(r.notices().length,0);assert.ok(r.nodes.some(n=>n.id==='session-warning'&&!n.removed));r.advance(5*60*1000);r.fire();assert.equal(r.notices().length,1);assert.match(r.notices()[0].children[0].children[0].textContent,/4 ชั่วโมง/);await assert.rejects(r.client.call('/gateway',{}),{code:'SESSION_EXPIRED'});assert.equal(r.requests(),0);
});
test('real input extends idle deadline; background API calls do not',async()=>{
 const r=runtime();r.auth.accept(r.token('user',10*60*60*1000),'test');r.advance(230*60*1000);r.events.keydown();r.advance(20*60*1000);r.fire();assert.equal(r.notices().length,0);await r.client.call('/gateway',{});r.advance(220*60*1000);r.fire();assert.equal(r.notices().length,1);
});
test('late input after sleeping beyond idle deadline cannot revive the session',()=>{
 const r=runtime();r.auth.accept(r.token('user',10*60*60*1000),'test');r.advance(241*60*1000);r.events.pointerdown();assert.equal(r.notices().length,1);assert.equal(r.auth.token('test'),'');
});
test('Google renewal preserves original idle deadline and consumes same-user callback',()=>{
 const r=runtime();let prompts=0;r.c.google={accounts:{id:{prompt(){prompts++;},renderButton(){}}}};r.auth.accept(r.token('user',60*60*1000),'test');r.advance(55*60*1000);r.fire();assert.equal(prompts,1);r.events.input();assert.equal(prompts,1);const renewed=r.token('user',6*60*60*1000);assert.equal(r.auth.refreshCredential(renewed,'test'),true);assert.equal(r.auth.token('test'),renewed);r.advance(4*60*60*1000);r.fire();assert.equal(r.notices().length,1);
});
test('reauthentication keeps the draft screen and rejects a different account',()=>{
 const r=runtime();r.auth.accept(r.token(),'test');r.advance(100000);r.fire();assert.equal(r.auth.refreshCredential(r.token('another'),'test'),true);assert.equal(r.notices().length,1);const renewed=r.token();assert.equal(r.auth.refreshCredential(renewed,'test'),true);assert.equal(r.notices().length,0);assert.equal(r.auth.token('test'),renewed);assert.equal(r.logouts(),0);
});
test('manual logout clears idle clock and renewal UI',()=>{
 const r=runtime();r.auth.accept(r.token(),'test');r.auth.clear();assert.equal(r.session.size,0);assert.equal(r.timers.size,0);assert.equal(r.auth.refreshCredential(r.token(),'test'),false);
});
test('manual renewal from warning remains in-place when Google prompt is blocked',()=>{
 const r=runtime();r.c.google={accounts:{id:{prompt(){throw Error('blocked');},renderButton(){}}}};r.auth.accept(r.token(),'test');const renewed=r.token('user',60*60*1000);assert.equal(r.auth.refreshCredential(renewed,'test'),true);assert.equal(r.auth.token('test'),renewed);assert.equal(r.logouts(),0);
});

test('mouse movement counts as activity and is throttled to avoid writes on every event',()=>{const r=runtime();r.auth.accept(r.token('user',10*60*60*1000),'test');r.advance(230*60*1000);r.events.pointermove({isTrusted:true});const activity=[...r.session].find(([k])=>k.endsWith(':activity'))[1];r.advance(100);r.events.pointermove({isTrusted:true});assert.equal([...r.session].find(([k])=>k.endsWith(':activity'))[1],activity);r.advance(20*60*1000);r.fire();assert.equal(r.notices().length,0);});
test('hidden tab and synthetic mouse events cannot keep an unattended session alive',()=>{const r=runtime();r.auth.accept(r.token('user',10*60*60*1000),'test');r.advance(230*60*1000);r.events.pointermove({isTrusted:false});r.c.document.hidden=true;r.events.pointermove({isTrusted:true});r.advance(11*60*1000);r.fire();assert.equal(r.notices().length,1);});
