const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(blocks=[]){
 const els={},requests=[],prompts=[];let oauth;
 const c=vm.createContext({console,Date,Map,Set,CONFIG:{googleClientId:'test'},currentUser:{email:'work@test'},toast(){},confirm:m=>{prompts.push(m);return false;},document:{getElementById:id=>els[id],createElement:()=>({})},google:{accounts:{oauth2:{initTokenClient:options=>{oauth=options;return {requestAccessToken(){}}},hasGrantedAllScopes:()=>true}}},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({calendars:{primary:{busy:blocks}}})};}});
 vm.runInContext(fs.readFileSync('salepro/js/pages/google-busy.js','utf8'),c);
 const api=vm.runInContext('GoogleBusy',c);
 api.mount({prepend(box){els['google-busy-connect']={};els['google-busy-refresh']={};els['google-busy-disconnect']={};els['google-busy-status']={};}},()=>{},()=> '2026-11');
 const connect=()=>{els['google-busy-connect'].onclick();oauth.callback({access_token:'PRIVATE_TOKEN',expires_in:3600});};
 return {c,api,requests,prompts,connect,els};
}
test('private busy time splits across Bangkok days without titles or tokens in events',async()=>{
 const s=setup([{start:'2026-11-08T16:00:00Z',end:'2026-11-09T02:00:00Z',summary:'SECRET'}]);s.connect();await s.api.syncMonth('2026-11');
 const events=s.api.events('2026-11');assert.equal(events.length,2);assert.equal(events[0].date,'2026-11-08');assert.equal(events[0].time,'23:00');assert.equal(events[1].date,'2026-11-09');assert.match(events[1].detail,/00:00–09:00/);assert.doesNotMatch(JSON.stringify(events),/SECRET|PRIVATE_TOKEN/);
 assert.deepEqual(JSON.parse(s.requests[0].options.body).items,[{id:'primary'}]);
});
test('overlap warns but exact endpoint adjacency does not',async()=>{
 const s=setup([{start:'2026-11-08T02:00:00Z',end:'2026-11-08T03:00:00Z'}]);s.connect();
 assert.equal(await s.api.confirmSlot('2026-11-08T09:30',60),false);assert.equal(s.prompts.length,1);
 assert.equal(await s.api.confirmSlot('2026-11-08T10:00',60),true);
});
test('missing duration warns for busy day and disconnect clears private data',async()=>{
 const s=setup([{start:'2026-11-08T02:00:00Z',end:'2026-11-08T03:00:00Z'}]);s.connect();
 assert.equal(await s.api.confirmSlot('2026-11-08T08:00',null),false);
 await s.api.syncMonth('2026-11');s.api.clear();assert.equal(s.api.events('2026-11').length,0);assert.equal(await s.api.confirmSlot('2026-11-08T09:00',60),true);
});
test('API errors are not treated as free availability',async()=>{const s=setup();s.connect();s.c.fetch=async()=>({ok:false,status:403});await assert.rejects(s.api.confirmSlot('2026-11-08T09:00',60),/Google Calendar API/);});
test('late response is discarded after account changes',async()=>{
 const s=setup();s.connect();let release;s.c.fetch=()=>new Promise(r=>release=r);const promise=s.api.syncMonth('2026-11');s.c.currentUser={email:'other@test'};release({ok:true,json:async()=>({calendars:{primary:{busy:[{start:'2026-11-08T02:00:00Z',end:'2026-11-08T03:00:00Z'}]}}})});await promise;assert.equal(s.api.events('2026-11').length,0);
});
