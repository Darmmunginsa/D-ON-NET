const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../purchasepro/js/app.js'),'utf8');
function runtime(){const c=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function decodePOCompany'),source.indexOf('function loadPOCompany')),c);return c;}
test('three large original images survive save and reload within Sheets cell limits',async()=>{
  const c=runtime(),rows=[];
  const company={name:'D ON NET',logo:'data:image/png;base64,'+'a'.repeat(120000),stamp:'data:image/png;base64,'+'b'.repeat(70000),approverSign:'data:image/png;base64,'+'c'.repeat(60000)};
  await c.persistPOCompany(company,async(Title,Value)=>{assert.ok(Value.length<50000);rows.push({Title,Value});});
  assert.equal(rows.at(-1).Title,'POCompany');
  const restored=c.decodePOCompany(rows.at(-1).Value,rows);
  assert.equal(JSON.stringify(restored),JSON.stringify(company));
});
test('failed image upload cannot publish incomplete company settings',async()=>{
  const c=runtime(),writes=[];
  await assert.rejects(c.persistPOCompany({logo:'a'.repeat(100000)},async(key)=>{writes.push(key);if(writes.length===2)throw Error('offline');}));
  assert.ok(!writes.includes('POCompany'));
});
test('legacy inline images and removed images still load',()=>{
  const c=runtime();assert.equal(c.decodePOCompany('{"logo":"data:image/png;base64,abc","stamp":""}',[]).logo,'data:image/png;base64,abc');
  assert.equal(c.decodePOCompany('{"logo":""}',[]).logo,'');
});
test('missing image part reports failure rather than showing an incomplete image',()=>{
  const c=runtime();assert.throws(()=>c.decodePOCompany('{"logo":{"parts":["missing"]}}',[]));
});
