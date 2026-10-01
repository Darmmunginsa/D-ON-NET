// ============================================================
// SALE FORECAST — ตารางคาดการณ์ยอดขาย (รวมทั้งทีม เก็บ JSON ใน Settings)
// ============================================================
let forecastData = [];          // [{id, customer, timeframe, project, oneTime, yearly, monthly, selling, partner, vendor, status, opp, competitor, howwin, remark}]
let forecastLoaded = false;

const FC_OPTS = {
  selling:    ['ITS','NTT','Fujistu','KDDI','MAT','DCS','MSC','SCSI'],
  partner:    ['NTT','Fujistu','KDDI','MAT','DCS','MSC','SCSI'],
  vendor:     ['ITS','HPE','DELL','IBM','Other Vendor'],
  status:     ['Create Project','Get requirement','Submit Quotation','Wait PO','Close Deal'],
  opp:        ['10%','30%','50%','80%','90%'],
  competitor: ['HPE','DELL','IBM','Other Vendor'],
  howwin:     ['Price','Service','Connection','Solution'],
  remark:     ['New','Lead','Existing']
};

function fcNum(v) { const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n) ? 0 : n; }
function fcMoney(n) { return Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

async function loadForecast() {
  if (!forecastLoaded) {
    try {
      const items = _settingsCache || await getListItems(CONFIG.lists.settings);
      const it = items.find(i => i.Title === 'SaleForecast');
      forecastData = (it && it.Value) ? (JSON.parse(it.Value) || []) : [];
    } catch(e) { forecastData = []; }
    forecastLoaded = true;
  }
  // เติม dropdown filter status
  const fst = document.getElementById('fc-filter-status');
  if (fst && fst.options.length <= 1) {
    FC_OPTS.status.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; fst.appendChild(o); });
  }
  renderForecast();
}

function addForecastRow() {
  forecastData.push({ id: Date.now(), customer:'', timeframe:'', project:'', oneTime:'', yearly:'', monthly:'',
    selling:'', partner:'', vendor:'', status:'', opp:'', competitor:'', howwin:'', remark:'' });
  renderForecast();
  saveForecast();
}

function removeForecastRow(id) {
  forecastData = forecastData.filter(r => r.id != id);
  renderForecast();
  saveForecast();
}

function updateForecast(id, field, val) {
  const r = forecastData.find(x => x.id == id);
  if (!r) return;
  r[field] = val;
  // อัปเดตเฉพาะ footer total เมื่อแก้ตัวเลข (ไม่ re-render ทั้งตารางกัน focus หลุด)
  if (field === 'oneTime' || field === 'yearly' || field === 'monthly') renderForecastFoot();
  saveForecast();
}

function fcSelect(r, field) {
  const opts = FC_OPTS[field] || [];
  const cur = r[field] || '';
  const extra = (cur && !opts.includes(cur)) ? `<option value="${escHtml(cur)}" selected>${escHtml(cur)}</option>` : '';
  return `<select onchange="updateForecast(${r.id},'${field}',this.value)">
    <option value=""${cur===''?' selected':''}>–</option>
    ${extra}
    ${opts.map(o => `<option value="${escHtml(o)}"${o===cur?' selected':''}>${escHtml(o)}</option>`).join('')}
  </select>`;
}

function renderForecast() {
  const body = document.getElementById('forecast-body');
  if (!body) return;
  const sq = (document.getElementById('fc-search')?.value || '').toLowerCase();
  const sf = document.getElementById('fc-filter-status')?.value || '';
  let num = 0;
  body.innerHTML = forecastData.map(r => {
    const match = (!sq || (r.customer||'').toLowerCase().includes(sq) || (r.project||'').toLowerCase().includes(sq))
               && (!sf || r.status === sf);
    if (!match) return '';
    num++;
    return `<tr data-id="${r.id}">
      <td style="text-align:center;color:var(--muted)">${num}</td>
      <td><input value="${escHtml(r.customer||'')}" onchange="updateForecast(${r.id},'customer',this.value)" placeholder="ลูกค้า"></td>
      <td><input value="${escHtml(r.timeframe||'')}" onchange="updateForecast(${r.id},'timeframe',this.value)" placeholder="เช่น July"></td>
      <td><input value="${escHtml(r.project||'')}" onchange="updateForecast(${r.id},'project',this.value)" placeholder="โปรเจกต์"></td>
      <td><input class="num" value="${escHtml(r.oneTime||'')}" onchange="updateForecast(${r.id},'oneTime',this.value)" placeholder="0.00"></td>
      <td><input class="num" value="${escHtml(r.yearly||'')}" onchange="updateForecast(${r.id},'yearly',this.value)" placeholder="0.00"></td>
      <td><input class="num" value="${escHtml(r.monthly||'')}" onchange="updateForecast(${r.id},'monthly',this.value)" placeholder="0.00"></td>
      <td>${fcSelect(r,'selling')}</td>
      <td>${fcSelect(r,'partner')}</td>
      <td>${fcSelect(r,'vendor')}</td>
      <td>${fcSelect(r,'status')}</td>
      <td>${fcSelect(r,'opp')}</td>
      <td>${fcSelect(r,'competitor')}</td>
      <td>${fcSelect(r,'howwin')}</td>
      <td>${fcSelect(r,'remark')}</td>
      <td style="text-align:center"><button class="action-btn" onclick="removeForecastRow(${r.id})" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="16" style="text-align:center;padding:24px;color:var(--muted)">ยังไม่มีรายการ — กด "เพิ่มรายการ"</td></tr>';
  renderForecastFoot();
}

function renderForecastFoot() {
  const foot = document.getElementById('forecast-foot');
  if (!foot) return;
  const sumOne = forecastData.reduce((a,r)=>a+fcNum(r.oneTime),0);
  const sumYear = forecastData.reduce((a,r)=>a+fcNum(r.yearly),0);
  const sumMon = forecastData.reduce((a,r)=>a+fcNum(r.monthly),0);
  foot.innerHTML = `<tr>
    <td colspan="4" style="text-align:right">Total Value</td>
    <td class="num">${fcMoney(sumOne)}</td>
    <td class="num">${fcMoney(sumYear)}</td>
    <td class="num">${fcMoney(sumMon)}</td>
    <td colspan="9"></td>
  </tr>`;
}

let _fcSaveTimer = null;
function saveForecast() {
  // debounce กันเขียน Settings ถี่
  const st = document.getElementById('fc-save-status');
  if (st) st.textContent = 'กำลังบันทึก...';
  clearTimeout(_fcSaveTimer);
  _fcSaveTimer = setTimeout(async () => {
    const value = JSON.stringify(forecastData);
    try {
      const items = _settingsCache || await getListItems(CONFIG.lists.settings);
      const ex = items.find(i => i.Title === 'SaleForecast');
      if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
      else {
        const c = await createListItem(CONFIG.lists.settings, { Title: 'SaleForecast', Value: value });
        if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'SaleForecast', Value: value });
      }
      if (st) st.textContent = '✓ บันทึกแล้ว';
    } catch(e) { if (st) st.textContent = '⚠ บันทึกไม่สำเร็จ: ' + e.message; }
  }, 700);
}

function exportForecastCSV() {
  const head = ['No','Customer','Time Frame','Project','One Time','Yearly','Monthly','Selling','Partner','Vendor','Status','Opportunity','Competitor','HOW WIN','Remark'];
  const esc = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const rows = forecastData.map((r,i) => [i+1, r.customer, r.timeframe, r.project, fcNum(r.oneTime), fcNum(r.yearly), fcNum(r.monthly),
    r.selling, r.partner, r.vendor, r.status, r.opp, r.competitor, r.howwin, r.remark].map(esc).join(','));
  const sumOne = forecastData.reduce((a,r)=>a+fcNum(r.oneTime),0);
  const sumYear = forecastData.reduce((a,r)=>a+fcNum(r.yearly),0);
  const sumMon = forecastData.reduce((a,r)=>a+fcNum(r.monthly),0);
  const total = ['','','','Total Value',sumOne,sumYear,sumMon,'','','','','','','',''].map(esc).join(',');
  const csv = '﻿' + [head.map(esc).join(','), ...rows, total].join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sale-forecast-' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
