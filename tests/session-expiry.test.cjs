const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../shared/gateway-client.js'),'utf8');
function runtime(){
  let now=1800000000000,next=0,requests=0,logouts=0;
  const timers=new Map(),events={},nodes=[],session=new Map();
  function element(){return {style:{},children:[],setAttribute(){},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},addEventListener(name,fn){this[name]=fn;},focus(){},remove(){this.removed=true;}};}
  const body=element(),document={body,hidden:false,createElement(){const n=element();nodes.push(n);return n;},addEventListener(name,fn){events[name]=fn;}};
  const storage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
  const c=vm.createContext({document,window:{sessionStorage:storage,localStorage:storage,addEventListener:(name,fn)=>{events[name]=fn;}},Date:{now:()=>now},TextDecoder,Uint8Array,atob,setTimeout:(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next;},clearTimeout:id=>timers.delete(id),logout:()=>logouts++,fetch:async()=>{requests++;return {status:200,ok:true,json:async()=>({ok:true})};}});
  vm.runInContext("const CONFIG={googleClientId:'test'};"+code,c);
  const auth=vm.runInContext('AuthSession',c),client=vm.runInContext('GatewayClient',c);
  const token=(sub='user')=>'header.'+Buffer.from(JSON.stringify({aud:'test',exp:(now+90000)/1000,hd:'dongroups.com',email_verified:true,email:'user@dongroups.com',sub})).toString('base64url')+'.signature';
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
