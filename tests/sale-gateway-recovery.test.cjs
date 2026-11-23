const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function runtime(call){
  const context=vm.createContext({console,CONFIG:{appsScriptUrl:'gateway',lists:{settings:'Settings'}},GatewayClient:{call}});
  vm.runInContext(fs.readFileSync('salepro/js/api.js','utf8'),context);
  context._sleep=async()=>{};
  return context;
}
test('lost Settings response is verified without writing the setting twice',async()=>{
  const requests=[];
  const c=runtime(async(url,payload)=>{
    requests.push(payload);
    if(payload.action==='create')throw new TypeError('Failed to fetch');
    return {ok:true,items:[{id:'saved',Title:'ZoneFonts_q',Value:'fonts'}]};
  });
  const result=await c._callRaw({action:'create',list:'Settings',fields:{Title:'ZoneFonts_q',Value:'fonts'}});
  assert.equal(result.item.id,'saved');
  assert.deepEqual(requests.map(r=>r.action),['create','list']);
});
test('different stored setting does not count as a successful save',async()=>{
  const c=runtime(async(url,payload)=>{
    if(payload.action==='update')throw new TypeError('Failed to fetch');
    return {ok:true,items:[{id:'saved',Value:'old'}]};
  });
  c._settingsCache=[{id:'saved',Title:'ZoneFonts_q'}];
  await assert.rejects(c._callRaw({action:'update',list:'Settings',id:'saved',fields:{Value:'new'}}),/Failed to fetch/);
});
test('read retries once after a temporary failure',async()=>{
  let attempts=0;
  const c=runtime(async()=>{if(++attempts===1)throw new TypeError('Failed to fetch');return {ok:true,items:[]};});
  await c._callRaw({action:'list',list:'Settings'});
  assert.equal(attempts,2);
});
test('service publication, report operations, uploads and emails are never retried or reconciled',async()=>{
  for(const payload of [
    {action:'update',list:'Settings',id:'deal',fields:{Value:'serials'}},
    {action:'create',list:'Settings',fields:{Title:'ServiceReportMeta_r',Value:'report'}},
    {action:'serviceReport',op:'publish'},
    {action:'serviceReport',op:'sign'},
    {action:'uploadFile'},
    {action:'publicWarrantyLookup',serial:'SERIAL'},
    {action:'publicServiceReport',reportId:'report'},
    {action:'sendEmail'},
  ]){
    const requests=[];
    const c=runtime(async(url,request)=>{requests.push(request);throw new TypeError('Failed to fetch');});
    c._settingsCache=[{id:'deal',Title:'DealStatus_q'}];
    await assert.rejects(c._callRaw(payload),/Failed to fetch/);
    assert.equal(requests.length,1,payload.action);
  }
});
