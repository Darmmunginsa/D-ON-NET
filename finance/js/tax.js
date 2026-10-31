// Tax values are explicit transaction snapshots; never infer VAT from cash amounts.
function calcFinanceTax(amount,mode,vatRate,whtRate){
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  amount=Number(amount); vatRate=Number(vatRate); whtRate=Number(whtRate);
  if(!Number.isFinite(amount)||amount<=0||!['exclusive','inclusive'].includes(mode)||![0,7].includes(vatRate)||![0,1,3,5].includes(whtRate))throw Error('กรุณาตรวจจำนวนเงินและอัตราภาษี');
  const base=mode==='inclusive'?round(amount/(1+vatRate/100)):round(amount);
  const vat=vatRate?(mode==='inclusive'?round(amount-base):round(base*vatRate/100)):0;
  const wht=round(base*whtRate/100),gross=round(base+vat);
  return {base,vat,wht,gross,net:round(gross-wht)};
}
let finParties=[];
function txTaxForm(r,type){
  const opts=(values,current)=>values.map(([v,l])=>`<option value="${v}" ${String(current)===String(v)?'selected':''}>${l}</option>`).join('');
  return `<div class="fg"><label>จำนวนเงินที่กรอก</label><select id="tx-tax-mode" onchange="updateTxTax()">${opts([['exclusive','ก่อน VAT'],['inclusive','รวม VAT แล้ว']],r.taxMode||'exclusive')}</select></div>
  <div class="fg"><label>${type==='income'?'ภาษีขาย':'ภาษีซื้อ'}</label><select id="tx-vat" onchange="updateTxTax()">${opts([[0,'ไม่ระบุ VAT / ไม่มี VAT'],[7,'VAT 7%']],r.vatRate||0)}</select></div>
  <div class="fg"><label>${type==='income'?'ลูกค้าหัก ณ ที่จ่ายเรา':'เราหัก ณ ที่จ่ายผู้รับ/ผู้ขาย'}</label><select id="tx-wht" onchange="updateTxTax()">${opts([[0,'ไม่หัก'],[1,'1%'],[3,'3%'],[5,'5%']],r.whtRate||0)}</select></div>
  <div class="fg"><label>เลขที่ใบกำกับภาษี / เอกสาร</label><input id="tx-tax-doc" value="${esc(r.taxDoc||'')}"></div>
  <div class="fg"><label>วันที่ใบกำกับภาษี (ใช้ในรายงาน VAT)</label><input type="date" id="tx-tax-date" value="${esc(r.taxDate||r.date||_today())}"></div>
  <div class="fg"><label><input type="checkbox" id="tx-vat-eligible" ${type==='income'?'checked disabled':(r.vatEligible===true?'checked':'')}> ${type==='expense'?'ภาษีซื้อมีสิทธิใช้เครดิต (ตรวจใบกำกับภาษีแล้ว)':'รวมภาษีขายในรายงาน'}</label></div>
  <div id="tx-tax-summary" class="card" style="padding:10px"></div>`;
}
function readTxTax(){return calcFinanceTax(document.getElementById('tx-amt').value,document.getElementById('tx-tax-mode').value,document.getElementById('tx-vat').value,document.getElementById('tx-wht').value);}
function updateTxTax(){try{const t=readTxTax();document.getElementById('tx-tax-summary').textContent=`ฐาน ${fmt(t.base)} + VAT ${fmt(t.vat)} − หัก ณ ที่จ่าย ${fmt(t.wht)} = รับ/จ่ายสุทธิ ${fmt(t.net)}`;}catch(e){document.getElementById('tx-tax-summary').textContent='กรอกจำนวนเงินเพื่อคำนวณ';}}
function partyOptions(){return finParties.map((p,i)=>`<option value="${i}">${esc(p.Name)}${p.TaxID?' · '+esc(p.TaxID):''}</option>`).join('');}
function pickTxParty(index){const p=finParties[Number(index)];if(index===''||!p)return;document.getElementById('tx-party').value=p.Name||'';document.getElementById('tx-party-tax').value=p.TaxID||'';document.getElementById('tx-party-branch').value=p.Branch||'';document.getElementById('tx-party-id').value=String(p.id||p._id);const bank=BankDetails.read(p);document.getElementById('tx-bank-name').value=bank.bankName;document.getElementById('tx-bank-account-name').value=bank.bankAccountName;document.getElementById('tx-bank-account-number').value=bank.bankAccountNumber;}
function renderParties(){return `<div class="page-head"><h2>ผู้รับ / ผู้ขาย / ลูกค้า</h2><button class="btn btn-primary" onclick="openFinanceParty()">+ เพิ่มคู่ค้า</button></div><div class="card"><table class="tbl"><thead><tr><th>ชื่อ</th><th>เลขประจำตัวผู้เสียภาษี</th><th>สาขา</th><th>ติดต่อ</th><th></th></tr></thead><tbody>${finParties.map((p,i)=>`<tr><td>${esc(p.Name)}</td><td>${esc(p.TaxID)}</td><td>${esc(p.Branch)}</td><td>${esc(p.Phone)} ${esc(p.Email)}${BankDetails.html(p,esc)}</td><td><button class="btn btn-sm" onclick="openFinanceParty(${i})">แก้ไข</button></td></tr>`).join('')||'<tr><td colspan="5">ยังไม่มีคู่ค้า</td></tr>'}</tbody></table></div>`;}
let _financePartyEdit=null;
function openFinanceParty(index){_financePartyEdit=index===undefined?null:index;const p=finParties[index]||{};modal('ทะเบียนคู่ค้า',['Name','TaxID','Branch','Address','Phone','Email','BankName','BankAccountName','BankAccountNumber'].map((k,i)=>`<div class="fg"><label for="party-${k}">${['ชื่อคู่ค้า *','เลขประจำตัวผู้เสียภาษี','สาขา (เช่น 00000)','ที่อยู่','โทรศัพท์','อีเมล','ธนาคาร','ชื่อบัญชี','เลขบัญชีธนาคาร'][i]}</label><input type="text" ${k==='BankAccountNumber'?'inputmode="numeric" autocomplete="off"':''} id="party-${k}" value="${esc(p[k]||'')}"></div>`).join(''),'<button class="btn btn-primary" onclick="saveFinanceParty()">บันทึก</button>');}
async function saveFinanceParty(){const fields={};for(const k of ['Name','TaxID','Branch','Address','Phone','Email','BankName','BankAccountName','BankAccountNumber'])fields[k]=document.getElementById('party-'+k).value.trim();if(!fields.Name)return toast('กรอกชื่อคู่ค้า','error');if(fields.TaxID&&!/^\d{13}$/.test(fields.TaxID))return toast('เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก','error');try{BankDetails.validate(fields);if(_financePartyEdit===null){const p=await createListItem('FinanceParty',fields);finParties.push(Object.assign({},p,fields));}else{const p=finParties[_financePartyEdit];await updateListItem('FinanceParty',p.id||p._id,fields);Object.assign(p,fields);}closeModal();go('parties');toast('บันทึกคู่ค้าแล้ว','success');}catch(e){toast('บันทึกไม่สำเร็จ: '+e.message,'error');}}
function financeTaxTotals(rows){const t={purchase:0,sales:0,excluded:0,withheld:0,credit:0};for(const r of rows){if(r.TaxVersion!=='1')continue;const expense=r.TxType==='expense';const vat=Number(r.VatAmount)||0,wht=Number(r.WhtAmount)||0;if(r._vatInPeriod!==false){if(expense){if(r.VatEligible==='false')t.excluded+=vat;else t.purchase+=vat;}else t.sales+=vat;}if(r._whtInPeriod!==false){if(expense)t.withheld+=wht;else t.credit+=wht;}}return t;}
function financeTaxInPeriod(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const now=new Date(),year=String(now.getFullYear()),month=year+'-'+String(now.getMonth()+1).padStart(2,'0');
  return _period==='all'||(_period==='year'?date.slice(0,4)===year:date.slice(0,7)===month);
}
function renderFinanceTaxReport(){
  const inRange=financeTaxInPeriod;
  const rows=finTx.filter(t=>t.TaxVersion==='1').map(t=>Object.assign({},t,{_vatInPeriod:inRange(t.TaxDate||t.Date),_whtInPeriod:inRange(t.Date)}));
  const t=financeTaxTotals(rows),unknown=allEntries().filter(inPeriod).filter(e=>!e.taxKnown).length;
  const cell=(label,value)=>`<tr><td>${label}</td><td style="text-align:right">${fmt(value)}</td></tr>`;
  const byRate=[1,3,5].map(rate=>{const list=rows.filter(r=>r._whtInPeriod&&Number(r.WhtRate)===rate);return cell('เราหักผู้ขาย '+rate+'%',list.filter(r=>r.TxType==='expense').reduce((s,r)=>s+Number(r.WhtAmount||0),0))+cell('ลูกค้าหักเรา '+rate+'%',list.filter(r=>r.TxType==='income').reduce((s,r)=>s+Number(r.WhtAmount||0),0));}).join('');
  return `<div class="grid2" style="margin-top:14px"><div class="card"><div class="card-h">สรุป VAT · ตามวันที่ใบกำกับภาษี</div><table class="tbl"><tbody>${cell('ภาษีขาย',t.sales)}${cell('ภาษีซื้อที่ใช้เครดิต',t.purchase)}${cell('ภาษีซื้อไม่ใช้เครดิต',t.excluded)}${cell('ภาษีขาย − ภาษีซื้อที่ใช้เครดิต',t.sales-t.purchase)}</tbody></table><small>ผลต่างก่อนเครดิตยกมาและรายการปรับปรุง</small></div><div class="card"><div class="card-h">สรุปหัก ณ ที่จ่าย · ตามวันที่รับ/จ่าย</div><table class="tbl"><tbody>${cell('เราหักผู้ขาย (เตรียมนำส่ง)',t.withheld)}${cell('ลูกค้าหักเรา (เครดิตภาษี)',t.credit)}${byRate}</tbody></table></div></div><div class="card" style="margin-top:12px;padding:12px">${unknown} รายการในช่วงนี้ยังไม่มีรายละเอียดภาษี (รวมข้อมูลจากระบบอื่น) จึงไม่รวมยอดภาษีอัตโนมัติ <button class="btn btn-sm" onclick="exportFinanceTaxCSV()">ส่งออก CSV ภาษี</button></div>`;
}
function exportFinanceTaxCSV(){
  const header=['วันที่รับจ่าย','วันที่ใบกำกับภาษี','เลขที่เอกสาร','ประเภท','คู่ค้า','เลขผู้เสียภาษี','สาขา','ฐานก่อน VAT','VAT','สิทธิภาษีซื้อ','อัตราหัก ณ ที่จ่าย','ยอดหัก ณ ที่จ่าย','รับจ่ายสุทธิ','VAT อยู่ในช่วง','หัก ณ ที่จ่ายอยู่ในช่วง'];
  const rows=finTx.filter(r=>r.TaxVersion==='1'&&(financeTaxInPeriod(r.TaxDate||r.Date)||financeTaxInPeriod(r.Date))).map(r=>[r.Date,r.TaxDate,r.TaxDoc,r.TxType==='income'?'รายรับ':'รายจ่าย',r.Party,r.PartyTaxID,r.PartyBranch,r.BaseAmount,r.VatAmount,r.VatEligible,r.WhtRate,r.WhtAmount,r.Amount,financeTaxInPeriod(r.TaxDate||r.Date),financeTaxInPeriod(r.Date)]);
  const csv='\ufeff'+[header,...rows].map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='finance-tax-'+_period+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
