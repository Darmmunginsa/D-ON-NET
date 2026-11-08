const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const writes=[],messages=[];
 const c=vm.createContext({console,Date,Map,Set,setTimeout,clearTimeout,currentUser:{email:'sale@test'},quotesData:[{id:'q1'}],ServicePlan:{publicRecord:e=>e.serial?e:null},document:{querySelectorAll:()=>[],getElementById:()=>null},window:{addEventListener(){}},toast:m=>messages.push(m)});
 vm.runInContext(fs.readFileSync('salepro/js/pages/saletracker.js','utf8'),c);
 c.writes=writes;c.messages=messages;
 vm.runInContext("stQuoteId='q1';stDealData={expiries:[{id:'e1',name:'UPS',serial:'AB12345',publicLookup:false}]};expiryManualSaved=JSON.stringify(stDealData.expiries);getStoredDealStatus=()=>JSON.stringify({expiries:JSON.parse(expiryManualSaved),notes:['saved note']});putStoredDealStatus=async(q,raw)=>writes.push({q,raw});",c);
 return c;
}
test('publish persists saved record and only marks published after success',async()=>{
 const c=setup();await c.setExpiryPublic('e1',true);
 assert.equal(c.writes.length,1);assert.equal(JSON.parse(c.writes[0].raw).expiries[0].publicLookup,true);
 assert.deepEqual(JSON.parse(c.writes[0].raw).notes,['saved note']);
 assert.equal(vm.runInContext('stDealData.expiries[0].publicLookup',c),true);
 assert.equal(vm.runInContext('JSON.stringify(stDealData.expiries)===expiryManualSaved',c),true);
});
test('unsaved edits block publish',async()=>{const c=setup();vm.runInContext("stDealData.expiries[0].serial='EDITED'",c);await c.setExpiryPublic('e1',true);assert.equal(c.writes.length,0);assert.equal(vm.runInContext('stDealData.expiries[0].publicLookup',c),false);});
test('failed publication leaves original flag and baseline intact',async()=>{const c=setup();c.putStoredDealStatus=async()=>{throw Error('offline')};await c.setExpiryPublic('e1',true);assert.equal(vm.runInContext('stDealData.expiries[0].publicLookup',c),false);assert.equal(vm.runInContext('warrantyPublishPending',c),false);});
