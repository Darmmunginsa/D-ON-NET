const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

for(const file of ['salepro/js/pages/pdf.js','purchasepro/js/app.js']){
  test(file+' rounds satang before converting baht to Thai words',()=>{
    const source=fs.readFileSync(file,'utf8');
    const start=source.indexOf('function bahtText(');
    const end=source.indexOf('\n}',start)+2;
    const context=vm.createContext({});
    vm.runInContext(source.slice(start,end),context);
    for(const [amount,words] of [
      [8500*1.07,'เก้าพันเก้าสิบห้าบาทถ้วน'],
      [9095,'เก้าพันเก้าสิบห้าบาทถ้วน'],
      [5681.7,'ห้าพันหกร้อยแปดสิบเอ็ดบาทเจ็ดสิบสตางค์'],
      [100.999999999,'หนึ่งร้อยเอ็ดบาทถ้วน'],
      [0.999999999,'หนึ่งบาทถ้วน'],
      [0,'ศูนย์บาทถ้วน'],
      [0.25,'ยี่สิบห้าสตางค์'],
      [-9095,'ลบเก้าพันเก้าสิบห้าบาทถ้วน'],
    ])assert.equal(context.bahtText(amount),words);
  });
}
