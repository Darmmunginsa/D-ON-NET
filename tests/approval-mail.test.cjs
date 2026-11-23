const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('approval request reports a missing recipient and propagates server delivery failures',async()=>{
  const source=fs.readFileSync('salepro/js/pages/saletracker.js','utf8');
  let attempts=0,request;
  const context=vm.createContext({
    _approvalSubject:()=> 'Approval',
    buildApprovalReportHTML:async()=>'<p>Approval</p>',
    _approvalThreadMid:async()=>null,
    apiPost:async(action,list,id,payload)=>{attempts++;request=payload;throw Error('mail quota');},
    console,
  });
  vm.runInContext(source.slice(source.indexOf('async function sendApprovalRequestEmail('),source.indexOf('async function sendApprovalResultEmail(')),context);
  await assert.rejects(context.sendApprovalRequestEmail({}),/อีเมลผู้อนุมัติ/);
  assert.equal(attempts,0);
  await assert.rejects(context.sendApprovalRequestEmail({ApproverEmail:'approver@example.com'}),/mail quota/);
  assert.equal(attempts,1);
  assert.equal(request.to,'approver@example.com');
  context.apiPost=async()=>{attempts++;};
  await context.sendApprovalRequestEmail({ApproverEmail:'approver@example.com'});
  assert.equal(attempts,2);
});
