const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(overrides={}){
  const s=fs.readFileSync('purchasepro/js/app.js','utf8');
  const c=vm.createContext({console,CONFIG:{lists:{procurement:'Procurement'}},_settingsCache:[],...overrides});
  vm.runInContext(s.slice(s.indexOf('const purchaseSettingWrites='),s.indexOf('// ===== ธีมสี')),c);
  return c;
}
test('queued purchase writes create once and retain the newest values',async()=>{
  let creates=0,updates=0;
  const c=runtime({createListItem:async()=>{creates++;return {id:'p'};},updateListItem:async()=>{updates++;}});
  await Promise.all([c.putSetting('Purchase_p','first'),c.putSetting('Purchase_p','latest')]);
  assert.equal(creates,1);
  assert.equal(updates,1);
  assert.equal(c._settingsCache[0].Value,'latest');
});
test('lost response verifies saved purchase without repeating a write',async()=>{
  let writes=0;
  const c=runtime({createListItem:async()=>{writes++;throw new TypeError('Failed to fetch');},getListItems:async()=>[{id:'p',Title:'Purchase_p',Value:'shipping'}]});
  await c.putSetting('Purchase_p','shipping');
  assert.equal(writes,1);
  assert.equal(c._settingsCache[0].id,'p');
});
test('failed verification retains an error and does not claim success',async()=>{
  const c=runtime({createListItem:async()=>{throw new TypeError('Failed to fetch');},getListItems:async()=>[]});
  await assert.rejects(c.putSetting('Purchase_p','shipping'),/Failed to fetch/);
  assert.equal(c._settingsCache.length,0);
});
