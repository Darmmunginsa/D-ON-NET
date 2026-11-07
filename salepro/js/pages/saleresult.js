// ============================================================
// SALE RESULT — ผลการขาย Win / Lose (สำหรับนำเสนอผู้บริหาร)
// Win  = ปิดการขายจริงเท่านั้น (DealStatus.closed) หรือ Status Closed
// Lose = Status Cancelled หรืออยู่ตะกร้า "ยกเลิก" (ยกเว้นสายที่ Revise แล้วชนะ)
// else = กำลังดำเนินการ (รวม "PO Received" ที่ยังไม่ปิดการขาย)
// ============================================================

function _srClassify(q) {
  if(typeof mergeSourceExcluded==='function'&&mergeSourceExcluded(q.id))return 'skip';
  try {
    const ds = (typeof parseDealStatus === 'function') ? parseDealStatus(q.DealStatus) : {};
    // ชนะ = ปิดการขายจริงเท่านั้น (ปุ่มปิดการขาย → DealStatus.closed) หรือ Status Closed
    // หมายเหตุ: "PO Received" = ได้รับ PO แต่ยังไม่ปิดการขาย → นับเป็น "กำลังดำเนินการ"
    if (q.Status === 'Closed' || ds.closed === true) return 'win';
    const cancelled = q.Status === 'Cancelled' || (typeof isQuoteInCancelBasket === 'function' && isQuoteInCancelBasket(q.id));
    if (cancelled) {
      if (typeof familyHasClosed === 'function' && familyHasClosed(q)) return 'skip'; // revise แล้วชนะ → ไม่นับแพ้
      return 'lose';
    }
  } catch(e) {}
  return 'progress';
}
function _srDate(q) {
  try { const ds = parseDealStatus(q.DealStatus); if (ds.closedAt) return ds.closedAt.slice(0,10); } catch(e) {}
  return (q.QuoteDate || '').slice(0,10);
}
function _srNum(n) { return (Number(n)||0).toLocaleString('th-TH'); }
function _srMoney(n) { const v = Number(n)||0; if (v>=1e6) return (v/1e6).toFixed(2)+' ล้าน'; return v.toLocaleString('th-TH'); }

// หมวดเหตุผลที่แพ้ (ตรงกับ dropdown ในหน้ายกเลิกใบเสนอราคา)
const SR_LOSE_REASONS = ['ราคาสูงกว่าคู่แข่ง','งบไม่พอ / ไม่อนุมัติงบ','ลูกค้าเลื่อน/ยกเลิกโครงการ','เลือกผู้ขายรายอื่น','สเปก/สินค้าไม่ตรงความต้องการ','ส่งมอบ/ระยะเวลาไม่ทัน','เงื่อนไขการชำระเงิน','ติดต่อลูกค้าไม่ได้/ไม่ตอบกลับ','ออกใบผิด/ทำซ้ำ (ไม่ใช่การแพ้)','อื่นๆ'];
const SR_REASON_ICON = {'ราคาสูงกว่าคู่แข่ง':'💸','งบไม่พอ / ไม่อนุมัติงบ':'📉','ลูกค้าเลื่อน/ยกเลิกโครงการ':'⏸','เลือกผู้ขายรายอื่น':'🤝','สเปก/สินค้าไม่ตรงความต้องการ':'🧩','ส่งมอบ/ระยะเวลาไม่ทัน':'⏱','เงื่อนไขการชำระเงิน':'💳','ติดต่อลูกค้าไม่ได้/ไม่ตอบกลับ':'📵','ออกใบผิด/ทำซ้ำ (ไม่ใช่การแพ้)':'♻️','อื่นๆ':'…','ไม่ระบุ':'❔'};

// หาเหตุผลที่แพ้ของใบนี้ → คืนชื่อหมวด (จาก LoseReason_<id> ก่อน ไม่งั้น parse จาก CancelReason_<id>)
function _srLoseReason(q) {
  try {
    const cache = (typeof _settingsCache !== 'undefined' && _settingsCache) ? _settingsCache : [];
    const lr = cache.find(i => i.Title === 'LoseReason_' + q.id);
    if (lr && lr.Value) { const v = String(lr.Value).trim(); if (SR_LOSE_REASONS.includes(v)) return v; if (v) return v; }
    const cr = cache.find(i => i.Title === 'CancelReason_' + q.id);
    if (cr && cr.Value) {
      const m = String(cr.Value).match(/^\[([^\]]+)\]/);
      if (m && m[1]) return m[1].trim();
      const txt = String(cr.Value);
      const hit = SR_LOSE_REASONS.find(r => txt.indexOf(r) >= 0);
      if (hit) return hit;
    }
  } catch(e) {}
  return 'ไม่ระบุ';
}

// margin ของใบ (ใช้กับใบที่ชนะ) → {cost, sell, margin, pct, est}
// ใช้ snapshot QuoteMargin_<id> ก่อน ไม่งั้นประมาณจาก QuoteItemExtra (cost×qty) + ยอดก่อน VAT
function _srMargin(q) {
  try {
    const cache = (typeof _settingsCache !== 'undefined' && _settingsCache) ? _settingsCache : [];
    const snap = cache.find(i => i.Title === 'QuoteMargin_' + q.id);
    if (snap && snap.Value) {
      const o = JSON.parse(snap.Value);
      const cost = +o.cost || 0, sell = +o.sell || 0;
      if (sell > 0) return { cost, sell, margin: sell - cost, pct: Math.round((sell-cost)/sell*100), est: false };
    }
    // fallback: ประมาณจาก extra
    const ex = (typeof getQuoteItemExtra === 'function') ? (getQuoteItemExtra(q.id) || []) : [];
    let cost = 0, hasCost = false;
    ex.forEach(r => { const c = +((r&&r.cost)||0); const qn = parseFloat(r&&r.qtyRaw); if (c>0) { hasCost = true; cost += c * (isFinite(qn)?qn:0); } });
    if (!hasCost) return null;
    const sell = (Number(q.TotalAmount)||0) / 1.07; // ถอด VAT 7%
    if (sell <= 0) return null;
    return { cost, sell, margin: sell - cost, pct: Math.round((sell-cost)/sell*100), est: true };
  } catch(e) { return null; }
}

function loadSaleResultPage() {
  // เติมตัวเลือกปี
  const sel = document.getElementById('sr-year');
  if (sel) {
    const years = new Set();
    (quotesData||[]).forEach(q => { const y=(_srDate(q)||'').slice(0,4); if (y) years.add(y); });
    const arr = [...years].sort((a,b)=>b-a);
    const cur = String(new Date().getFullYear());
    if (!arr.includes(cur)) arr.unshift(cur);
    sel.innerHTML = '<option value="">ทุกปี</option>' + arr.map(y=>`<option value="${y}">ปี ${(+y)+543}</option>`).join('');
    sel.value = arr.includes(cur) ? cur : '';
  }
  renderSaleResult();
}

function renderSaleResult() {
  const host = document.getElementById('saleresult-body');
  if (!host) return;
  const year = document.getElementById('sr-year')?.value || '';
  const rows = (quotesData||[]).filter(q => {
    if (!year) return true;
    return (_srDate(q)||'').slice(0,4) === year;
  });

  // จัดกลุ่ม
  const wins=[], loses=[], prog=[];
  rows.forEach(q => { const c=_srClassify(q); if(c==='win')wins.push(q); else if(c==='lose')loses.push(q); else if(c==='progress')prog.push(q); });
  const winN=wins.length, loseN=loses.length, progN=prog.length;
  const decided = winN+loseN;
  const winRate = decided? Math.round(winN/decided*100) : 0;
  const winVal = wins.reduce((s,q)=>s+(Number(q.TotalAmount)||0),0);
  const loseVal = loses.reduce((s,q)=>s+(Number(q.TotalAmount)||0),0);
  const progVal = prog.reduce((s,q)=>s+(Number(q.TotalAmount)||0),0);

  // ── Margin ของดีลที่ชนะ ──
  let mgSell=0, mgCost=0, mgCount=0;
  const marginByQ = {};
  wins.forEach(q => { const m = _srMargin(q); if (m) { marginByQ[q.id]=m; mgSell+=m.sell; mgCost+=m.cost; mgCount++; } });
  const mgProfit = mgSell - mgCost;
  const mgPct = mgSell>0 ? Math.round(mgProfit/mgSell*100) : 0;

  // ── สถิติเหตุผลที่แพ้ ──
  const reasonCnt = {}; let reasonTotal = 0;
  loses.forEach(q => { const r = _srLoseReason(q); reasonCnt[r]=(reasonCnt[r]||0)+1; reasonTotal++; });
  const reasonRows = Object.keys(reasonCnt).map(r=>({name:r,n:reasonCnt[r]})).sort((a,b)=>b.n-a.n);
  const topReason = reasonRows[0];

  // โดนัท (สัดส่วนตามจำนวน)
  const total = winN+loseN+progN || 1;
  const wp=winN/total*100, lp=loseN/total*100;
  const donut = `conic-gradient(#34d399 0 ${wp}%, #f87171 ${wp}% ${wp+lp}%, #3a4150 ${wp+lp}% 100%)`;

  // กราฟรายเดือน (12 เดือน) win vs lose
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const mWin=Array(12).fill(0), mLose=Array(12).fill(0);
  wins.forEach(q=>{ const m=+((_srDate(q)||'').slice(5,7))-1; if(m>=0&&m<12)mWin[m]++; });
  loses.forEach(q=>{ const m=+((_srDate(q)||'').slice(5,7))-1; if(m>=0&&m<12)mLose[m]++; });
  const maxM = Math.max(1, ...mWin, ...mLose);

  // จัดอันดับเซล
  const bySale = {};
  rows.forEach(q => {
    const c=_srClassify(q); if(c==='skip')return;
    const name=(q.SaleName||q.SaleEmail||'ไม่ระบุ').trim()||'ไม่ระบุ';
    const s=bySale[name]||(bySale[name]={name,win:0,lose:0,prog:0,wonVal:0,marginVal:0});
    if(c==='win'){s.win++;s.wonVal+=Number(q.TotalAmount)||0; const mm=marginByQ[q.id]; if(mm)s.marginVal+=mm.margin;} else if(c==='lose')s.lose++; else s.prog++;
  });
  const board = Object.values(bySale).map(s=>{const d=s.win+s.lose; s.rate=d?Math.round(s.win/d*100):0; return s;})
    .sort((a,b)=>b.wonVal-a.wonVal || b.win-a.win);

  // แถวดีลที่ตัดสินแล้ว (Win/Lose) ล่าสุด
  const decidedRows = rows.filter(q=>{const c=_srClassify(q);return c==='win'||c==='lose';})
    .sort((a,b)=>(_srDate(b)||'').localeCompare(_srDate(a)||'')).slice(0,100);

  const medal = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="color:var(--muted)">${i+1}</span>`;

  host.innerHTML = `
  <div class="sr-hero">
    <div class="sr-hero-txt">
      <div class="sr-hero-sub">อัตราการปิดการขาย${year?` · ปี ${(+year)+543}`:' · ทุกปี'}</div>
      <div class="sr-hero-rate">${winRate}<span>%</span></div>
      <div class="sr-hero-sub">ชนะ ${_srNum(winN)} · แพ้ ${_srNum(loseN)} จากที่ตัดสินแล้ว ${_srNum(decided)} ดีล</div>
    </div>
    <div class="sr-donut-wrap">
      <div class="sr-donut" style="background:${donut}"><div class="sr-donut-hole"><div class="sr-donut-rate">${winRate}%</div><div class="sr-donut-lbl">Win Rate</div></div></div>
      <div class="sr-legend">
        <span><i style="background:#34d399"></i> ชนะ ${_srNum(winN)}</span>
        <span><i style="background:#f87171"></i> แพ้ ${_srNum(loseN)}</span>
        <span><i style="background:#3a4150"></i> กำลังดำเนินการ ${_srNum(progN)}</span>
      </div>
    </div>
  </div>

  <div class="sr-kpis">
    ${_srKpi('🏆','ชนะ (Win)', _srNum(winN)+' ดีล', _srMoney(winVal)+' บาท', '#34d399')}
    ${_srKpi('❌','แพ้ (Lose)', _srNum(loseN)+' ดีล', _srMoney(loseVal)+' บาท', '#f87171')}
    ${_srKpi('⏳','กำลังดำเนินการ', _srNum(progN)+' ดีล', _srMoney(progVal)+' บาท', '#6ea8fe')}
    ${_srKpi('💰','มูลค่าที่ปิดได้', _srMoney(winVal)+' บาท', 'เฉลี่ย '+_srMoney(winN?winVal/winN:0)+'/ดีล', '#fbbf24')}
    ${_srKpi('📈','กำไรรวม (Margin)', _srMoney(mgProfit)+' บาท', mgCount? ('เฉลี่ย '+mgPct+'% · จาก '+_srNum(mgCount)+' ดีล') : 'ยังไม่มีข้อมูลต้นทุน', '#22d3ee')}
    ${topReason? _srKpi(SR_REASON_ICON[topReason.name]||'❔','แพ้มากสุดเพราะ', topReason.name, _srNum(topReason.n)+' ดีล ('+Math.round(topReason.n/(reasonTotal||1)*100)+'% ของที่แพ้)', '#fb7185') : ''}
  </div>

  <div class="sr-grid">
    <div class="sr-card">
      <div class="sr-card-h">📊 ผลรายเดือน (ชนะ / แพ้)</div>
      <div class="sr-bars">
        ${months.map((mo,i)=>`
          <div class="sr-bcol" title="${mo}: ชนะ ${mWin[i]} / แพ้ ${mLose[i]}">
            <div class="sr-bstack">
              <div class="sr-bar win" style="height:${mWin[i]/maxM*100}%">${mWin[i]?`<span>${mWin[i]}</span>`:''}</div>
              <div class="sr-bar lose" style="height:${mLose[i]/maxM*100}%">${mLose[i]?`<span>${mLose[i]}</span>`:''}</div>
            </div>
            <div class="sr-bx">${mo}</div>
          </div>`).join('')}
      </div>
      <div class="sr-legend" style="justify-content:center;margin-top:6px"><span><i style="background:#34d399"></i> ชนะ</span><span><i style="background:#f87171"></i> แพ้</span></div>
    </div>

    <div class="sr-card">
      <div class="sr-card-h">🏅 จัดอันดับพนักงานขาย</div>
      ${board.length? `<table class="sr-tbl"><thead><tr><th>#</th><th>พนักงานขาย</th><th style="text-align:center">ชนะ</th><th style="text-align:center">แพ้</th><th style="width:22%">Win Rate</th><th style="text-align:right">มูลค่าที่ปิด</th><th style="text-align:right">กำไร</th></tr></thead><tbody>
        ${board.map((s,i)=>`<tr>
          <td style="text-align:center;font-size:15px">${medal(i)}</td>
          <td><b>${_srEsc(s.name)}</b></td>
          <td style="text-align:center;color:#34d399;font-weight:600">${s.win}</td>
          <td style="text-align:center;color:#f87171">${s.lose}</td>
          <td><div class="sr-rate"><div class="sr-rate-fill" style="width:${s.rate}%"></div></div><span class="sr-rate-n">${s.rate}%</span></td>
          <td style="text-align:right;font-family:var(--mono)">${_srMoney(s.wonVal)}</td>
          <td style="text-align:right;font-family:var(--mono);color:${s.marginVal?'#22d3ee':'var(--muted)'}">${s.marginVal?_srMoney(s.marginVal):'—'}</td>
        </tr>`).join('')}
      </tbody></table>` : '<div class="sr-empty">ยังไม่มีข้อมูล</div>'}
    </div>
  </div>

  <div class="sr-card">
    <div class="sr-card-h">🔍 เหตุผลที่แพ้ (สถิติเพื่อการตัดสินใจ)</div>
    ${reasonTotal? `<div class="sr-reasons">
      ${reasonRows.map(r=>{const pct=Math.round(r.n/reasonTotal*100);return `
        <div class="sr-reason">
          <div class="sr-reason-top"><span>${SR_REASON_ICON[r.name]||'❔'} ${_srEsc(r.name)}</span><b>${r.n} <small style="color:var(--muted);font-weight:400">(${pct}%)</small></b></div>
          <div class="sr-reason-bar"><div style="width:${pct}%"></div></div>
        </div>`;}).join('')}
    </div>
    <div class="sr-hint">💡 หมวดที่แพ้บ่อย คือสัญญาณให้ทบทวนราคา/เงื่อนไข หรือ <b>ปฏิเสธงานที่ไม่คุ้ม</b> ตั้งแต่ต้น</div>` : '<div class="sr-empty">ยังไม่มีข้อมูลเหตุผลที่แพ้ (ระบุหมวดตอนกดยกเลิกใบเสนอราคา)</div>'}
  </div>

  <div class="sr-card">
    <div class="sr-card-h">📋 รายการที่ตัดสินแล้ว (ล่าสุด ${decidedRows.length})</div>
    ${decidedRows.length? `<table class="sr-tbl"><thead><tr><th>วันที่</th><th>เลขที่</th><th>ลูกค้า</th><th>พนักงานขาย</th><th style="text-align:right">มูลค่า</th><th style="text-align:center">ผล</th><th>กำไร / เหตุผล</th></tr></thead><tbody>
      ${decidedRows.map(q=>{const w=_srClassify(q)==='win';const mm=w?marginByQ[q.id]:null;const reason=w?'':_srLoseReason(q);
        let last;
        if(w){ last = mm? `<span style="color:${mm.margin>=0?'#22d3ee':'#f87171'};font-family:var(--mono)">${_srMoney(mm.margin)} <small style="color:var(--muted)">(${mm.pct}%${mm.est?'~':''})</small></span>` : '<span style="color:var(--muted)">—</span>'; }
        else { last = `<span class="sr-rtag">${SR_REASON_ICON[reason]||'❔'} ${_srEsc(reason)}</span>`; }
        return `<tr>
        <td style="font-family:var(--mono);font-size:12px">${_srDate(q)||'-'}</td>
        <td style="font-family:var(--mono);font-size:12px">${_srEsc(q.Title||'')}</td>
        <td>${_srEsc(q.ClientName||'-')}</td>
        <td>${_srEsc(q.SaleName||q.SaleEmail||'-')}</td>
        <td style="text-align:right;font-family:var(--mono)">${_srNum(q.TotalAmount)}</td>
        <td style="text-align:center">${w?'<span class="sr-chip win">✔ ชนะ</span>':'<span class="sr-chip lose">✘ แพ้</span>'}</td>
        <td style="font-size:12px">${last}</td>
      </tr>`;}).join('')}
    </tbody></table>
    <div class="sr-hint">กำไรที่มี <b>~</b> = ประมาณจากต้นทุนในใบ (ถอด VAT) · ตัวเลขแม่นยำจะมาจากใบที่บันทึกหลังอัปเดตนี้</div>` : '<div class="sr-empty">ยังไม่มีดีลที่ตัดสินแล้วในช่วงนี้</div>'}
  </div>`;
}

function _srKpi(icon,label,big,sub,color){
  return `<div class="sr-kpi" style="--c:${color}">
    <div class="sr-kpi-ic">${icon}</div>
    <div class="sr-kpi-txt"><div class="sr-kpi-l">${label}</div><div class="sr-kpi-b">${big}</div><div class="sr-kpi-s">${sub}</div></div>
  </div>`;
}
function _srEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
