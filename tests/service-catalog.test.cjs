const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function api(){const c=vm.createContext({document:{addEventListener(){}}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../salepro/js/pages/service-catalog.js'),'utf8'),c);return vm.runInContext('ServiceCatalogDraft',c);}
test('service template excludes device identifiers and customer fields, keeps unit price before discount',()=>{
 const a=api(),d=a.fromItem({type:'item',name:'ติดตั้ง Battery APC SURT10K XLI',desc:'เปลี่ยนและทดสอบ\nS/N: SECRET1\nSerial No SECRET2\nหมายเลขเครื่อง SECRET3',pn:'SURT10K XLI',unit:'Unit',price:60000,cost:40000,qty:3,disc:10,ClientName:'CUSTOMER'}),f=a.fields(d);
 assert.equal(f.Description,'เปลี่ยนและทดสอบ');assert.equal(f.Price,60000);assert.equal(f.Cost,40000);assert.equal(f.Category,'Service');assert.equal(f.Unit,'Unit');assert.equal(f.CatalogStatus,'Active');assert(!JSON.stringify(f).includes('SECRET'));assert(!JSON.stringify(f).includes('CUSTOMER'));assert.equal(f.qty,undefined);assert.equal(f.disc,undefined);
});
test('non-product rows and invalid prices/cost cannot become active service catalog entries',()=>{
 const a=api();for(const item of [{type:'note'},{type:'group'},{type:'item',asHeader:true}])assert.throws(()=>a.fromItem(item));for(const price of ['',0,-1,'Included',Infinity])assert.throws(()=>a.fields({Title:'งาน',Price:price}));assert.throws(()=>a.fields({Title:'งาน',Price:100,Cost:-1}));
});
