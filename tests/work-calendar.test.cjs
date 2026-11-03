const test=require('node:test'),assert=require('node:assert/strict'),C=require('../shared/work-calendar.js');
const q={id:'q1',Title:'QT-1',ClientName:'Customer',Status:'PO Received',TotalAmount:1000,PaidAmount:100,PaymentDueDate:'2026-11-05',DealStatus:JSON.stringify({techJobs:[{id:'j',scheduledAt:'2026-11-05T09:30',techEmail:'tech@test',status:'assigned'}],expiries:[{id:'e',expiryDate:'2026-11-06',name:'UPS'}]})};
test('Bangkok dates retain local days and convert UTC near midnight; invalid dates rejected',()=>{assert.equal(C.date('2026-11-01T20:00:00Z'),'2026-11-02');assert.equal(C.clock('2026-11-01T20:00:00Z'),'03:00');assert.equal(C.date('2026-11-01T09:00'),'2026-11-01');for(const v of ['2026-02-30','not-a-date','2026-13-01',''])assert.equal(C.date(v),'');});
test('collects four source types without altering data, and settings override old deal status',()=>{
 const c={spId:'c1',quoteId:'q1',party:'Customer',end:'2027-01-01',serviceAgreement:{type:'PM',visits:[{id:'v',plannedDate:'2026-11-05',status:'planned'}]}};
 const copy=JSON.stringify([q,c]),result=C.collect([q],[c]);assert.equal(result.events.length,5);assert.equal(result.events.find(e=>e.type==='payment').amount,900);assert.equal(C.count(result.events.filter(e=>e.date==='2026-11-05')).field,2);assert.equal(JSON.stringify([q,c]),copy);
 const override=C.collect([q],[],[{Title:'DealStatus_q1',Value:JSON.stringify({techJobs:[{id:'new',scheduledAt:'2026-11-10'}]})}]);assert.equal(override.events.filter(e=>e.type==='install').length,1);assert.equal(override.events.find(e=>e.type==='install').date,'2026-11-10');
});
test('cancelled quotes and linked contracts, paid dues, renewed assets and cancelled visits are excluded',()=>{
 assert.equal(C.collect([{...q,Status:'Cancelled'}],[{spId:'c',quoteId:'q1',end:'2026-11-01',serviceAgreement:{visits:[{plannedDate:'2026-11-01'}]}}]).events.length,0);
 const result=C.collect([{...q,PaidAmount:1000,DealStatus:JSON.stringify({techJobs:[{scheduledAt:'2026-11-01',status:'cancelled'}],expiries:[{expiryDate:'2026-11-01',renewed:true}]})}],[{spId:'c',serviceAgreement:{visits:[{plannedDate:'2026-11-01',status:'cancelled'},{month:'2026-11',status:'planned'}]}}]);assert.equal(result.events.length,0);assert.equal(result.missing.service,1);
});
test('completion stays visible as history but no longer counts as field queue; time collision needs same tech and start',()=>{
 const events=C.collect([{...q,DealStatus:JSON.stringify({techJobs:[{id:'1',scheduledAt:'2026-11-05T09:00',techName:'A'},{id:'2',scheduledAt:'2026-11-05T09:00',techName:'A'},{id:'3',scheduledAt:'2026-11-05T09:00',techName:'B'},{id:'4',scheduledAt:'2026-11-05T09:00',techName:'A',status:'completed'}]})}],[]).events;
 assert.equal(C.count(events).field,3);assert.equal(C.collisions(events).size,2);
});
test('missing scheduled dates are reported rather than invented from visit months',()=>{const result=C.collect([{...q,DealStatus:'{"techJobs":[{"id":"unscheduled"}]}' }],[{spId:'c',serviceAgreement:{visits:[{month:'2026-11'}]}}]);assert.equal(result.missing.install,1);assert.equal(result.missing.service,1);assert.equal(result.events.filter(e=>e.type==='service').length,0);});
