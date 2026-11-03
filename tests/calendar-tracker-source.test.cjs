const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('real tracker opener reads the stored deal status before an older quotation snapshot',()=>{
 const source=fs.readFileSync('salepro/js/pages/saletracker.js','utf8');
 const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const latest=JSON.stringify({closed:false,techJobs:[{id:1,techName:'Existing technician',status:'accepted'}]});
 const c={_dsCache:new Map(),_settingsCache:[{Title:'DealStatus_q',Value:latest}],quotesData:[{id:'q',DealStatus:'{}',Title:'QT',TotalAmount:100,PaidAmount:0}],currentUser:{displayName:'Test'},document:{getElementById:()=>({style:{}}),querySelector:()=>({})},canManageSaleActions:()=>true};
 for(const name of ['clearSTSlip','applyTrackerVisibility','switchSTTab','renderSTTimeline','renderSTDocs','renderSTPaySummary','renderPOStatusBar','renderPayDueDateDisplay','renderReminderDisplay','renderCustPOTab','updateFollowUpBtn','openModal'])c[name]=()=>{};
 c.renderSTPayHistory=async()=>{};vm.createContext(c);
 vm.runInContext(between('function parseDealStatus(', 'function serializeDealStatus(')+between('function getStoredDealStatus(', 'async function putStoredDealStatus(')+between('function openSaleTrackerModal(', '// PO STATUS —'),c);
 vm.runInContext("openSaleTrackerModal('q')",c);assert.equal(c.stDealData.techJobs.length,1);assert.equal(c.stDealData.techJobs[0].techName,'Existing technician');
 c._settingsCache=[];c.quotesData[0].DealStatus=latest;vm.runInContext("openSaleTrackerModal('q')",c);assert.equal(c.stDealData.techJobs.length,1);
});
