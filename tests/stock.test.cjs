const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('salepro/apps-script/Code.gs','utf8');
function runtime(){
  const tables=new Map();let locked=false,locks=0;
  function sheet(name){if(!tables.has(name))tables.set(name,[['_id']]);const rows=tables.get(name);return {getLastRow:()=>rows.length,getLastColumn:()=>Math.max(...rows.map(r=>r.length)),getRange:(r,c,h=1,w=1)=>({getValues:()=>Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>rows[r+y-1]?.[c+x-1]??'')),setNumberFormat(){return this;},setValues(values){assert.ok(locked||name!=='StockMoves','stock writes must hold lock');for(let y=0;y<h;y++){rows[r+y-1]??=[];for(let x=0;x<w;x++)rows[r+y-1][c+x-1]=values[y][x];}return this;}})};}
  function seed(name,records){const keys=['_id',...new Set(records.flatMap(r=>Object.keys(r).filter(k=>k!=='id')))];tables.set(name,[keys,...records.map(r=>keys.map(k=>k==='_id'?r.id:r[k]??''))]);}
  const c=vm.createContext({console,ID_COL:'_id',_sheet:sheet,LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;locks++;},releaseLock(){locked=false;}})}});
  vm.runInContext(source.slice(source.indexOf('function _headers('),source.indexOf('function _uuid(')),c);
  vm.runInContext(source.slice(source.indexOf('function listRows('),source.indexOf('function createRow(')),c);
  vm.runInContext(source.slice(source.indexOf('function _findRowIndex('),source.indexOf('function updateRow(')),c);
  vm.runInContext(source.slice(source.indexOf('// Stock: immutable movement ledger.')),c);
  seed('Catalog',[{id:'p1',Title:'Battery',SKU:'BAT',Unit:'ลูก',Category:'Hardware',CatalogStatus:'Active'},{id:'p2',Title:'Cable',Unit:'เมตร',Category:'Consumable'},{id:'svc',Title:'Service',Category:'Service'}]);
  seed('Quotations',[{id:'q1',Title:'JK1',ClientName:'Client',SaleEmail:'sale@example.com',Status:'Approved'},{id:'q2',Title:'JK2',ClientName:'Other client',SaleEmail:'other@example.com',Status:'Approved'}]);
  seed('Settings',[{id:'ds1',Title:'DealStatus_q1',Value:JSON.stringify({techJobs:[{id:'j1',techEmail:'tech@example.com',techName:'Tech',status:'inprogress'},{id:'j2',techEmail:'tech2@example.com',status:'assigned'}]})}]);
  let counter=0;const call=(email,op,extra={})=>c.stockHandle({_actor:{email,name:email},op,requestId:'request-'+(++counter),productId:'p1',quantity:1,reference:'PO-1',...extra});
  return {c,seed,tables,call,locks:()=>locks,locked:()=>locked};
}

test('purchasing access is admin-controlled; sales cannot receive, count, or grant permissions',()=>{
 const r=runtime();assert.throws(()=>r.call('sale@example.com','receive'),/เฉพาะจัดซื้อ/);assert.throws(()=>r.call('sale@example.com','count'),/เฉพาะจัดซื้อ/);assert.throws(()=>r.call('sale@example.com','access',{emails:['sale@example.com']}),/เฉพาะ Admin/);
 r.call('admin@dongroups.com','access',{emails:[' Buyer@Example.Com ']});r.call('buyer@example.com','receive',{quantity:10});
 assert.equal(r.call('sale@example.com','list').products.find(p=>p.id==='p1').quantity,10);assert.equal(r.c.listRows('StockMoves')[0].Actor,'buyer@example.com');assert.equal(r.c.listRows('StockMoves')[0].DeltaUnits,'10000');assert.equal(r.locked(),false);
});

test('receive, technician issue, return and stocktake retain an exact immutable ledger',()=>{
 const r=runtime();r.call('admin@dongroups.com','receive',{quantity:10});
 r.call('tech@example.com','issue',{quantity:4,quoteId:'q1',jobId:'j1'});
 let snapshot=r.call('sale@example.com','list',{quoteId:'q1'});assert.equal(snapshot.products.find(p=>p.id==='p1').quantity,6);assert.equal(snapshot.jobBalances.p1,4);assert.equal(snapshot.moves[0].QuoteTitle,'JK1');
 r.call('tech@example.com','return',{quantity:1,quoteId:'q1',jobId:'j1'});assert.throws(()=>r.call('tech@example.com','return',{quantity:4,quoteId:'q1',jobId:'j1'}),/คืนเกินยอด/);
 r.call('admin@dongroups.com','count',{quantity:5,note:'ตรวจนับจริง'});snapshot=r.call('sale@example.com','list',{quoteId:'q1'});assert.equal(snapshot.products.find(p=>p.id==='p1').quantity,5);assert.equal(snapshot.jobBalances.p1,3);assert.equal(r.c.listRows('StockMoves').length,4);assert.ok(r.locks()>=7);
});

test('stock cannot be oversold across technicians and assignment is verified on the server',()=>{
 const r=runtime();r.call('admin@dongroups.com','receive',{quantity:10});r.call('tech@example.com','issue',{quantity:6,quoteId:'q1',jobId:'j1'});
 assert.throws(()=>r.call('tech2@example.com','issue',{quantity:5,quoteId:'q1',jobId:'j2'}),/ไม่เพียงพอ/);assert.throws(()=>r.call('sale@example.com','issue',{quantity:1,quoteId:'q1',jobId:'j1'}),/ได้รับมอบหมาย/);
 assert.throws(()=>r.call('tech@example.com','issue',{quantity:1,quoteId:'q1',jobId:'j2'}),/ได้รับมอบหมาย/);
 assert.equal(r.c.listRows('StockMoves').length,2);assert.equal(r.call('sale@example.com','list').products.find(p=>p.id==='p1').quantity,4);
});

test('retry with stable request ID never receives or issues twice, and changed payload cannot reuse ID',()=>{
 const r=runtime();const req={requestId:'stable-receipt',quantity:10};r.call('admin@dongroups.com','receive',req);assert.equal(r.call('admin@dongroups.com','receive',req).reused,true);
 assert.throws(()=>r.call('admin@dongroups.com','receive',{...req,quantity:11}),/ถูกใช้แล้ว/);
 const issue={requestId:'stable-issue',quantity:3,quoteId:'q1',jobId:'j1'};r.call('tech@example.com','issue',issue);r.call('tech@example.com','issue',issue);
 assert.equal(r.call('tech@example.com','status',{requestId:'stable-issue'}).item.Type,'issue');assert.equal(r.call('sale@example.com','status',{requestId:'stable-issue'}).item,null);
 assert.equal(r.c.listRows('StockMoves').length,2);assert.equal(r.call('sale@example.com','list').products.find(p=>p.id==='p1').quantity,7);
});

test('three decimal quantities are exact, zero stocktake works, and invalid or service items are rejected',()=>{
 const r=runtime();r.call('admin@dongroups.com','receive',{productId:'p2',quantity:0.3});r.call('tech@example.com','issue',{productId:'p2',quantity:0.1,quoteId:'q1',jobId:'j1'});assert.equal(r.call('sale@example.com','list').products.find(p=>p.id==='p2').quantity,0.2);
 for(const quantity of [-1,0,'',null,'bad',Infinity,0.0001])assert.throws(()=>r.call('admin@dongroups.com','receive',{quantity}),/จำนวน/);
 assert.throws(()=>r.call('admin@dongroups.com','receive',{productId:'svc'}),/ไม่ใช่สินค้าคลัง/);assert.throws(()=>r.call('admin@dongroups.com','count',{quantity:0,note:''}),/เหตุผล/);assert.throws(()=>r.call('admin@dongroups.com','receive',{reference:''}),/เอกสารรับเข้า/);
 r.call('admin@dongroups.com','count',{quantity:0,note:'ปรับยอดเริ่มต้น'});assert.equal(r.call('sale@example.com','list').products.find(p=>p.id==='p1').quantity,0);
});

test('sales see their own job movements; aggregate job balance is not truncated by 200 row history limit',()=>{
 const r=runtime();r.call('admin@dongroups.com','receive',{quantity:1000});for(let i=0;i<205;i++)r.call('tech@example.com','issue',{quoteId:'q1',jobId:'j1'});
 const data=r.call('sale@example.com','list',{quoteId:'q1'});assert.equal(data.moves.length,200);assert.equal(data.jobBalances.p1,205);
 assert.throws(()=>r.call('other@example.com','list',{quoteId:'q1'}),/ไม่มีสิทธิ/);assert.equal(r.call('other@example.com','list').moves.length,0);assert.equal(r.call('tech@example.com','list').jobs.length,1);
});

test('completed or cancelled jobs cannot issue more but may return material previously issued',()=>{
 const r=runtime();r.call('admin@dongroups.com','receive',{quantity:10});r.call('tech@example.com','issue',{quoteId:'q1',jobId:'j1',quantity:3});
 r.seed('Settings',[{id:'ds1',Title:'DealStatus_q1',Value:JSON.stringify({techJobs:[{id:'j1',techEmail:'tech@example.com',status:'completed'}]})}]);
 assert.throws(()=>r.call('tech@example.com','issue',{quoteId:'q1',jobId:'j1'}),/เสร็จหรือถูกยกเลิก/);r.call('tech@example.com','return',{quoteId:'q1',jobId:'j1',quantity:2});assert.equal(r.call('sale@example.com','list').products.find(p=>p.id==='p1').quantity,9);
});

test('generic write, delete and direct read endpoints cannot bypass protected stock operations',()=>{
 const c=vm.createContext({stockHandle:()=>({ok:true})});vm.runInContext(source.slice(source.indexOf('function handle('),source.indexOf('function _json(')),c);
 for(const action of ['create','update','delete','batchCreate','deleteWhere','list'])for(const list of ['StockMoves','StockAccess'])assert.throws(()=>c.handle({action,list}),/เมนู Stock/);
 assert.throws(()=>c.handle({action:'multiList',lists:['Catalog','StockAccess']}),/เมนู Stock/);
});


test('stock reference and notes are written as text rather than spreadsheet formulas',()=>{
 const r=runtime();r.call('admin@dongroups.com','receive',{reference:'=1+2',note:'=HYPERLINK("https://example.com")'});
 const row=r.c.listRows('StockMoves')[0];assert.equal(row.Reference,"'=1+2");assert.equal(row.Note.charAt(0),"'");
});
