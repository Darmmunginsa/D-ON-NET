// ============================================================
// HELPERS
// ============================================================
const fmt = n => '฿' + Number(n||0).toLocaleString('th-TH', {minimumFractionDigits:2,maximumFractionDigits:2});
// PDF: ตัวเลขล้วน ไม่มีสัญลักษณ์ ฿ (ตาม requirement ใบเสนอราคา)
const fmtP = n => Number(n||0).toLocaleString('th-TH', {minimumFractionDigits:2,maximumFractionDigits:2});

// แปลงจำนวนเงินเป็นข้อความภาษาไทย เช่น 358985 → "สามแสนห้าหมื่นแปดพันเก้าร้อยแปดสิบห้าบาทถ้วน"
function bahtText(amount) {
  const num = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  const unit = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
  function readInt(s) {
    s = String(s).replace(/^0+/, '');
    if (s === '') return '';
    const len = s.length;
    if (len > 6) { return readInt(s.slice(0, len - 6)) + 'ล้าน' + readInt(s.slice(len - 6)); }
    let res = '';
    for (let i = 0; i < len; i++) {
      const d = +s[i], pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && len > 1) res += 'เอ็ด';
      else if (pos === 1 && d === 2) res += 'ยี่';
      else if (pos === 1 && d === 1) res += '';
      else res += num[d];
      res += unit[pos];
    }
    return res;
  }
  let n = Math.abs(Number(amount) || 0);
  const baht = Math.floor(n);
  const satang = Math.round((n - baht) * 100);
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน';
  let t = '';
  if (baht > 0) t += readInt(String(baht)) + 'บาท';
  t += satang > 0 ? readInt(String(satang)) + 'สตางค์' : (baht > 0 ? 'ถ้วน' : '');
  return (Number(amount) < 0 ? 'ลบ' : '') + t;
}
const escHtml = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function buildCurrentQuoteData() {
  const t = calcTotals();
  const fakeQ = {
    Title: document.getElementById('q-no').value,
    ClientName: document.getElementById('q-client').value,
    Tag: document.getElementById('q-tag')?.value||'',
    ContactPerson: document.getElementById('q-contact').value,
    Phone: document.getElementById('q-phone').value,
    Email: document.getElementById('q-email').value,
    QuoteDate: document.getElementById('q-date').value,
    PaymentMethod: document.getElementById('q-payment').value,
    DiscountPct: t.sub > 0 ? (t.discAmt / t.sub * 100) : 0,   // %-เทียบเท่า (รองรับโหมดส่วนลดแบบบาท)
    TotalAmount: t.grand,
    Note: document.getElementById('q-note').value,
    Terms: document.getElementById('q-terms').value,
    SaleName: document.getElementById('q-sale-name').value||'',
    SaleTel: document.getElementById('q-sale-tel').value||'',
    SaleEmail: document.getElementById('q-sale-email').value||'',
    CustomerAddress: document.getElementById('q-cust-address').value||'',
    ClientNameEN: document.getElementById('q-client-en')?.value||'',
    CustomerAddressEN: document.getElementById('q-cust-address-en')?.value||'',
    CustomerTaxID: document.getElementById('q-cust-taxid').value||'',
    CustomerTel: document.getElementById('q-cust-tel').value||'',
    ContractStartDate: document.getElementById('q-start').value||'',
    ContractEndDate: document.getElementById('q-end').value||''
  };
  const d = buildPDFData(fakeQ, quoteItems.map(i=> i.type==='group' ? {__group:true, groupTitle:i.title, rowH:i.rowH} : i.type==='blank' ? {__blank:true, rowH:i.rowH} : i.type==='pagebreak' ? {__pagebreak:true} : i.type==='note' ? {__note:true, noteText:i.text} : i.asHeader ? {__group:true, groupTitle:i.name, rowH:i.rowH} : {No:i.no||'', PartNumber:i.pn||'', Title:i.name, Quantity:i.qty, Unit:i.unit, PriceRaw:i.price, UnitPrice:priceNum(i), DiscountPct:i.disc, Description:i.desc||'', rowH:i.rowH}));
  d.zoneFonts = { ...zoneFont };   // ใช้ค่าฟอนต์ที่กำลังตั้งอยู่ในฟอร์ม
  d.cols = { pn:true, ...colVisible };       // คอลัมน์ที่กำลังแสดงอยู่ในฟอร์ม
  d.colLines = (typeof colLines !== 'undefined') ? !!colLines : false;
  d.pricePeriod = (typeof pricePeriod !== 'undefined') ? pricePeriod : '';   // งวดราคาต่อหน่วย (/เดือน, /ปี)
  d.customerFax = document.getElementById('q-cust-fax')?.value || '';   // Fax จากฟอร์ม (ให้ตรงกับ preview จาก list)
  d.rowSpacing = { ...rowSpacing };  // ระยะห่างแถวที่กำลังตั้งอยู่
  d.validity = document.getElementById('q-validity').value || '';
  d.signatureBase64 = currentQuoteSignature || '';
  d.approverSignatureBase64 = '';
  d.approverName = '';
  return d;
}

function previewPDF() {
  const d = buildCurrentQuoteData();
  document.getElementById('pdf-content').innerHTML = renderPDFHTML(d);
  openModal('pdf-modal');
}

async function showPDFForQuote(id) {
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  let items = [];
  try {
    const all = await getListItems(CONFIG.lists.quoteItems);
    const _rowHs = getQuoteRowH(id) || [];
    const _extra = getQuoteItemExtra(id) || [];
    items = all.filter(i => String(i.QuoteID) === String(id)).map((i, idx) => {
      const rh = +_rowHs[idx] || 0;
      const ex = _extra[idx] || {};
      if ((i.Title||'').startsWith('__GROUP__:')) return { __group:true, groupTitle: i.Title.slice(10), rowH: rh };
      if (i.Title === '__BLANK__') return { __blank:true, rowH: rh };
      if (i.Title === '__PAGEBREAK__') return { __pagebreak:true };
      if (i.Title === '__NOTE__') return { __note:true, noteText: i.Description || '' };
      if (ex.asHeader) return { __group:true, groupTitle: i.Title || '', rowH: rh };   // รายการที่ตั้งเป็นหัวข้อกลุ่ม
      return { ...i, rowH: rh, No: ex.no || '', PartNumber: ex.pn || '', PriceRaw: (ex.price !== undefined && ex.price !== '') ? ex.price : i.UnitPrice };
    });
  } catch(e) {}
  const _qdEN = (typeof getQuoteDocEN === 'function') ? getQuoteDocEN(id) : {};
  q.ClientNameEN = _qdEN.nameEN || '';
  q.CustomerAddressEN = _qdEN.addrEN || '';
  const d = buildPDFData(q, items);
  d.zoneFonts = getQuoteZoneFonts(id) || { ...ZONE_FONT_DEFAULT };   // ฟอนต์รายใบ
  d.cols = { pn:true, qty:true, unit:true, price:true, disc:true, total:true, ...(getQuoteCols(id) || {}) };   // คอลัมน์รายใบ (pn default = แสดง)
  d.colLines = !!d.cols.__lines;
  d.pricePeriod = (getQuoteCols(id) || {}).__pricePeriod || '';   // งวดราคาต่อหน่วย
  d.rowSpacing = getQuoteSpacing(id) || { pad:4, lineH:1.35 };   // ระยะห่างแถวรายใบ
  d.validity = getQuoteValidity(id);   // อายุใบเสนอราคารายใบ
  d.customerFax = (typeof getQuoteFax === 'function') ? getQuoteFax(id) : '';
  // Load sale signature
  try {
    const saleEmail = q.SaleEmail || currentUser?.email || '';
    d.signatureBase64 = await loadSigFromSharePoint(saleEmail) || currentQuoteSignature || '';
  } catch(e2) { d.signatureBase64 = currentQuoteSignature || ''; }
  // Load approver signature — เมื่อใบผ่านอนุมัติแล้ว (รวมสถานะหลังอนุมัติ: PO Received / Closed / ปิดการขาย)
  try {
    const _approvedOrLater = ['Approved','PO Received','Closed'].includes(q.Status)
      || (typeof parseDealStatus === 'function' && parseDealStatus(q.DealStatus).closed);
    if (_approvedOrLater) {
      const approverEmail = q.ApproverEmail || '';
      d.approverSignatureBase64 = approverEmail ? (await loadSigFromSharePoint(approverEmail) || '') : '';
      d.approverName = q.ApproverName || q.ApproverEmail || '';
    } else {
      d.approverSignatureBase64 = '';
      d.approverName = '';
    }
  } catch(e2) { d.approverSignatureBase64 = ''; d.approverName = ''; }
  document.getElementById('pdf-content').innerHTML = renderPDFHTML(d);
  openModal('pdf-modal');
}


function buildPDFData(q, items) {
  const sub = (items||[]).reduce((a,i)=>(i.__group||i.__blank||i.__pagebreak||i.__note)?a:a+((i.Quantity||1)*(i.UnitPrice||0)*(1-(i.DiscountPct||0)/100)),0);
  const disc = (q.DiscountPct||0)/100;
  const after = sub*(1-disc);
  const vat = after*0.07;
  const grand = q.TotalAmount || (after+vat);
  return {q,items:items||[],sub,discAmt:sub*disc,after,vat,grand};
}

// #5 แปลง Terms เป็นตาราง 3 คอลัมน์: บรรทัดที่เป็น "หัวข้อ : รายละเอียด" จัดชิดคอลัมน์ให้สวย
// บรรทัดว่าง = เว้นบรรทัด, บรรทัดอื่น = ข้อความเต็มความกว้าง
function _renderTermsHtml(text, lh) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = lines.map(ln => {
    const m = ln.match(/^\s*([^:]{1,40}?)\s*:\s*(.*)$/);
    if (m) return `<tr><td style="padding:1px 14px 1px 0;font-weight:600;color:#333;white-space:nowrap;vertical-align:top;line-height:${lh}">${escHtml(m[1])}</td><td style="padding:1px 10px 1px 0;color:#333;vertical-align:top;line-height:${lh}">:</td><td style="padding:1px 0;color:#444;vertical-align:top;line-height:${lh};width:100%">${escHtml(m[2])}</td></tr>`;
    if (!ln.trim()) return `<tr><td colspan="3" style="height:5px;line-height:5px">&nbsp;</td></tr>`;
    return `<tr><td colspan="3" style="padding:1px 0;color:#444;line-height:${lh}">${escHtml(ln)}</td></tr>`;
  }).join('');
  return `<table style="border-collapse:collapse;width:auto">${rows}</table>`;
}

function renderPDFHTML(d) {
  const s = companySettings || {};
  const primaryColor = s.PrimaryColor || '#1a3a5c';
  const q = d.q;
  // font scale — 4 zones (per-quote; falls back to current editor state)
  const zf = d.zoneFonts || zoneFont;
  const mkScale = (b) => ({ s:Math.max(7,b-2)+'px', m:b+'px', l:(b+2)+'px', xl:(b+4)+'px' });
  const Zi = mkScale(zf.info);    // header (right side) + customer info
  const Zt = mkScale(zf.items);   // items table
  const Zo = mkScale(zf.totals);  // totals
  const Zn = mkScale(zf.notes);   // notes/terms + signatures
  // company identity block — controlled from Company Settings (ไม่ผูกกับ Zone)
  const hb = +s.HeaderFontSize || 10;
  const hbName = (hb + 6) + 'px';        // ชื่อบริษัท
  const hbLine = hb + 'px';              // ที่อยู่ / เลขภาษีเรา
  // ── HEADER (ซ้ำทุกหน้า) ──
  const headBlock = `
    <div style="display:flex;align-items:stretch;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid ${primaryColor}">
      <div style="flex:1;max-width:50%;word-break:break-word">
        ${(s.LogoBase64||s.LogoURL) ? `<img src="${s.LogoBase64||s.LogoURL}" style="max-height:81px;max-width:225px;object-fit:contain;margin-bottom:5px;display:block">` : ''}
        <div style="font-size:${hbName};font-weight:700;color:${primaryColor}">${s.CompanyName||'บริษัท ไอที เซอร์วิสเซส จำกัด'}</div>
        <div style="font-size:${hbLine};color:#666;line-height:1.5;margin-top:3px">
          ${s.Address ? s.Address+'<br>' : ''}
          ${s.Phone ? 'Tel: '+s.Phone : ''}${s.Phone&&s.Email?' &nbsp;|&nbsp; ':''}${s.Email ? 'Email: '+s.Email : ''}<br>
          ${s.TaxID ? 'Tax ID: '+s.TaxID : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;text-align:right;width:282px;flex-shrink:0;overflow:hidden">
        <div style="background:${primaryColor};color:#fff;padding:5px 12px;border-radius:5px;margin-bottom:8px;display:inline-block">
          <div style="font-size:${Zi.s};opacity:0.8">Quotation No.</div>
          <div style="font-size:${Zi.l};font-weight:700;letter-spacing:0.5px">${q.Title||''}</div>
        </div>
        <table style="font-size:${Zi.m};width:100%;border-collapse:collapse;text-align:left;color:#1a1a2e">
          <tr><td style="color:#666;padding:1.5px 8px 1.5px 0;white-space:nowrap;width:84px;vertical-align:top">Quotation Date:</td><td style="font-weight:600;color:#1a1a2e">${fmtDate(q.QuoteDate)}</td></tr>
          ${q.ContractEndDate ? `<tr><td style="color:#666;padding:1.5px 8px 1.5px 0;white-space:nowrap;vertical-align:top">Expire:</td><td style="font-weight:600;color:#1a1a2e">${fmtDate(q.ContractEndDate)}</td></tr>` : ''}
          <tr><td style="color:#666;padding:1.5px 8px 1.5px 0;white-space:nowrap;vertical-align:top">Sale Name:</td><td style="font-weight:600;color:#1a1a2e">${q.SaleName||''}</td></tr>
          <tr><td style="color:#666;padding:1.5px 8px 1.5px 0;white-space:nowrap;vertical-align:top">Tel No.:</td><td style="font-weight:600;color:#1a1a2e">${q.SaleTel||''}</td></tr>
          <tr><td style="color:#666;padding:1.5px 8px 1.5px 0;white-space:nowrap;vertical-align:top">Email:</td><td style="font-weight:600;color:#1a1a2e;word-break:break-all;overflow-wrap:anywhere">${q.SaleEmail||''}</td></tr>
        </table>
      </div>
    </div>`;

  // ── CUSTOMER INFO (หน้าแรกเท่านั้น) ──
  const _qEN = (typeof customerDocENByName === 'function') ? customerDocENByName(q.ClientName, q.CustomerTaxID) : null;
  // ใบเสนอราคา: ลำดับความสำคัญ EN — กรอกในใบ → ทะเบียนลูกค้า → ค่าไทย
  const _clientName = (q.ClientNameEN||'').trim() || (_qEN && _qEN.nameEN) || (q.ClientName || '');
  const _clientAddr = (q.CustomerAddressEN||'').trim() || (_qEN && _qEN.addrEN) || (q.CustomerAddress || '');
  const custBlock = `
    <div style="background:#f8fafc;border-radius:8px;padding:7px 14px;margin-bottom:6px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:${Zi.m}">
      <div>
        <div style="font-size:${Zi.s};color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Attention</div>
        <div style="font-size:${Zi.l};font-weight:700;color:${primaryColor};margin-bottom:3px">${_clientName}</div>
        ${(q.ContactPerson||q.Email) ? `<div style="color:#555;word-break:break-all;overflow-wrap:anywhere">${q.ContactPerson?'Contact: '+q.ContactPerson:''}${q.ContactPerson&&q.Email?' &nbsp;·&nbsp; ':''}${q.Email?'Email: '+q.Email:''}</div>` : ''}
        ${(q.CustomerTel||q.Phone||d.customerFax) ? `<div style="color:#555">${(q.CustomerTel||q.Phone)?'Tel: '+(q.CustomerTel||q.Phone||''):''}${(q.CustomerTel||q.Phone)&&d.customerFax?' &nbsp;&nbsp; ':''}${d.customerFax?'Fax: '+escHtml(d.customerFax):''}</div>` : ''}
      </div>
      <div>
        <div style="font-size:${Zi.s};color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Address</div>
        <div style="color:#555;line-height:1.5;white-space:pre-line">${_clientAddr}</div>
      </div>
    </div>`;

  // ── ITEMS TABLE helpers ──
  const c = d.cols || { pn:true, qty:true, unit:true, price:true, disc:true, total:true };
  const colspan = 2 + ['pn','qty','unit','price','disc','total'].filter(k => c[k]).length;
  // ราคา/ยอด รองรับข้อความ (Included): ใช้ PriceRaw ถ้าเป็นข้อความ
  const _isNum = v => v !== '' && v !== null && v !== undefined && !isNaN(parseFloat(v)) && isFinite(v);
  const cellPrice = it => { const r = (it.PriceRaw !== undefined ? it.PriceRaw : (it.UnitPrice!==undefined?it.UnitPrice:it.price)); return _isNum(r) ? fmtP(parseFloat(r)) : escHtml(String(r||'')); };
  const cellTotal = it => { const r = (it.PriceRaw !== undefined ? it.PriceRaw : (it.UnitPrice!==undefined?it.UnitPrice:it.price)); if (!_isNum(r)) return escHtml(String(r||'')); return fmtP((it.Quantity||it.qty||1)*parseFloat(r)*(1-(it.DiscountPct||it.disc||0)/100)); };
  const sp = d.rowSpacing || { pad:4, lineH:1.35 };
  const rpT = (+sp.pad || 0);
  const rpB = rpT;
  const lh = (+sp.lineH || 1.35);
  const vline = d.colLines ? 'border-right:0.5px solid #e5e7eb;' : '';   // #7 เส้นแบ่งคอลัมน์แนวตั้ง
  const cellPad = `padding:${rpT}px 10px ${rpB}px;`;
  const cellBase = `padding:${rpT}px 7px ${rpB}px;border-bottom:0.5px solid #e5e7eb;${vline}vertical-align:top;line-height:${lh};word-wrap:break-word;`;
  const thPad = `padding:8px 7px;${vline}`;
  const th2 = (th,en) => en+'<br><span style="font-weight:400;font-size:0.82em;opacity:0.9">'+th+'</span>';
  const tableHead = `<thead><tr style="background:${primaryColor};color:#fff">
        <th style="${thPad}text-align:center;width:52px">${th2('ลำดับ','Item')}</th>
        ${c.pn ? '<th style="'+thPad+'text-align:center;width:112px">'+th2('รหัสสินค้า','Part No.')+'</th>' : ''}
        <th style="${thPad}text-align:center">${th2('รายการ','Description')}</th>
        ${c.qty   ? '<th style="'+thPad+'text-align:center;width:60px;white-space:nowrap">'+th2('จำนวน','Qty')+'</th>' : ''}
        ${c.unit  ? '<th style="'+thPad+'text-align:center;width:54px">'+th2('หน่วย','Unit')+'</th>' : ''}
        ${c.price ? '<th style="'+thPad+'text-align:center;width:112px;white-space:nowrap">'+th2(d.pricePeriod==='month'?'ราคา/เดือน':(d.pricePeriod==='year'?'ราคา/ปี':'ราคาต่อหน่วย'), d.pricePeriod==='month'?'Price/Month':(d.pricePeriod==='year'?'Price/Year':'Unit Price'))+'</th>' : ''}
        ${c.disc  ? '<th style="'+thPad+'text-align:center;width:56px">'+th2('ส่วนลด','Discount')+'</th>' : ''}
        ${c.total ? '<th style="'+thPad+'text-align:center;width:100px">'+th2('จำนวนเงิน','Amount')+'</th>' : ''}
      </tr></thead>`;
  // render rows for one page; numbering continues via counter object
  const renderRows = (arr, ctr) => arr.map(it => {
    const rh = it.rowH ? `height:${it.rowH}px;` : '';
    if (it.__group) {
      // หัวข้อกลุ่ม: ชื่ออยู่กึ่งกลางในคอลัมน์ Description เท่านั้น เซลล์คอลัมน์อื่นยังอยู่ครบ (เส้นตารางต่อเนื่อง)
      const gBg = `background:${primaryColor}0d;`;
      const gEmpty = `<td style="${cellBase}${gBg}">&nbsp;</td>`;
      const cells = [];
      cells.push(gEmpty);                                         // Item
      if (c.pn) cells.push(gEmpty);                               // Part No.
      cells.push(`<td style="${cellBase}${gBg}text-align:left;font-weight:700;color:${primaryColor};font-size:${Zt.l};letter-spacing:0.04em">${escHtml(it.groupTitle||'')}</td>`);  // Description
      if (c.qty) cells.push(gEmpty);
      if (c.unit) cells.push(gEmpty);
      if (c.price) cells.push(gEmpty);
      if (c.disc) cells.push(gEmpty);
      if (c.total) cells.push(gEmpty);
      return `<tr style="${rh}">${cells.join('')}</tr>`;
    }
    if (it.__blank) return `<tr style="${rh}"><td colspan="${colspan}" style="${cellPad}border-bottom:0.5px solid #e5e7eb">&nbsp;</td></tr>`;
    if (it.__note) return `<tr><td colspan="${colspan}" style="padding:${rpT}px 10px ${rpB}px;border-bottom:0.5px solid #e5e7eb;color:#555;font-style:italic;white-space:pre-line;line-height:${lh}">${escHtml(it.noteText||'')}</td></tr>`;
    ctr.n++;
    return `<tr style="${rh}background:${ctr.n%2===0?'#fff':'#f8fafc'};color:#1a1a2e">
      <td style="${cellBase}text-align:center;color:#666;background:inherit;white-space:nowrap;word-wrap:normal">${escHtml(String(it.No||it.no||ctr.n))}</td>
      ${c.pn ? `<td style="${cellBase}color:#444;font-family:'Tahoma','Segoe UI',sans-serif;font-size:${Zt.m}">${escHtml(it.PartNumber||'')}</td>` : ''}
      <td style="${cellBase}color:#1a1a2e">
        <div style="font-weight:600;color:#1a1a2e;line-height:${lh}">${escHtml(it.Title||it.name||'-')}</div>
        ${(it.Description||it.desc) ? `<div style="font-size:${Zt.s};color:#666;margin-top:0.2em;white-space:pre-line;line-height:${lh}">${escHtml(it.Description||it.desc||'')}</div>` : ''}
      </td>
      ${c.qty   ? `<td style="${cellBase}text-align:center;color:#1a1a2e">${it.Quantity||it.qty||1}</td>` : ''}
      ${c.unit  ? `<td style="${cellBase}text-align:center;color:#1a1a2e">${it.Unit||it.unit||''}</td>` : ''}
      ${c.price ? `<td style="${cellBase}text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;color:#1a1a2e">${cellPrice(it)}</td>` : ''}
      ${c.disc  ? `<td style="${cellBase}text-align:center;color:#1a1a2e">${(it.DiscountPct||it.disc||0) ? (it.DiscountPct||it.disc)+'%' : '–'}</td>` : ''}
      ${c.total ? `<td style="${cellBase}text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;font-weight:500;color:#1a1a2e">${cellTotal(it)}</td>` : ''}
    </tr>`;
  }).join('');

  // ── SUMMARY (หน้าสุดท้าย) ──
  const termsText = [q.Terms, q.Note, (s.FooterText && s.FooterText !== q.Terms ? s.FooterText : '')]
    .map(x => (x || '').trim()).filter(Boolean).join('\n');
  const summaryBlock = `
    <div class="pdf-summary-row" style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:0;margin-top:14px">
      <div style="flex:1;text-align:center;font-weight:600;color:${primaryColor};font-size:${Zo.m}">
        <div style="border-top:1.5px solid ${primaryColor};border-bottom:1.5px solid ${primaryColor};background:${primaryColor}0d;padding:8px 14px;border-radius:4px">${bahtText(d.grand)}</div>
      </div>
      <table style="width:240px;flex-shrink:0;border-collapse:collapse;color:#1a1a2e;font-size:${Zo.m};table-layout:fixed">
        <tr><td style="padding:4px 16px 4px 0;color:#444">SUB TOTAL</td><td style="text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;padding:4px 0;color:#1a1a2e;white-space:nowrap">${fmtP(d.sub)}</td></tr>
        ${d.discAmt>0 ? `<tr><td style="padding:4px 16px 4px 0;color:#444">DISCOUNT</td><td style="text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;padding:4px 0;color:#e74c3c;white-space:nowrap">(${fmtP(d.discAmt)})</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#444">TOTAL</td><td style="text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;padding:4px 0;color:#1a1a2e;white-space:nowrap">${fmtP(d.after)}</td></tr>` : ''}
        <tr><td style="padding:4px 16px 4px 0;color:#444">VAT 7%</td><td style="text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;padding:4px 0;color:#1a1a2e;white-space:nowrap">${fmtP(d.vat)}</td></tr>
        <tr style="border-top:2px solid ${primaryColor}">
          <td style="padding:8px 16px 4px 0;font-size:${Zo.l};font-weight:700;color:${primaryColor}">GRAND TOTAL</td>
          <td style="text-align:right;font-family:'Tahoma','Segoe UI',sans-serif;font-size:${Zo.xl};font-weight:700;color:${primaryColor};padding:8px 0 4px;white-space:nowrap">${fmtP(d.grand)}</td>
        </tr>
      </table>
    </div>
    ${termsText ? `<div class="pdf-summary-row" style="margin-top:14px">
      <div style="background:${primaryColor};color:#fff;padding:5px 12px;font-weight:600;font-size:${Zn.m}">Term & Conditions</div>
      <div style="padding:8px 12px;font-size:${Zn.s};color:#444;line-height:1.7;border:0.5px solid #e5e7eb;border-top:none">${_renderTermsHtml(termsText, lh)}</div>
    </div>` : ''}
    <div class="pdf-footer-block" style="margin-top:20px;font-size:${Zn.m}">
    <div style="font-weight:600;color:#1a1a2e;padding-bottom:8px">Confirm to purchase all quoted items.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;text-align:center;font-size:${Zn.m}">
      <div>
        <div style="font-size:${Zn.s};color:#888;margin-bottom:4px">Acceptance By Customer</div>
        <div style="height:48px"></div>
        <div style="border-top:0.5px solid #ccc;padding-top:8px">
          <div style="font-size:${Zn.s};color:#888;margin-top:6px;line-height:1.5">Signature and seal of the company's behalf.</div>
        </div>
      </div>
      <div>
        <div style="font-size:${Zn.s};color:#888;margin-bottom:4px">Quoted By</div>
        ${(d.signatureBase64||s.SignatureBase64||s.SignatureURL) ? `<img src="${d.signatureBase64||s.SignatureBase64||s.SignatureURL}" style="max-height:44px;object-fit:contain;display:block;margin:0 auto 4px">` : '<div style="height:44px"></div>'}
        <div style="border-top:0.5px solid #ccc;padding-top:8px">
          <div style="color:#333;font-weight:500">${q.SaleName||'................................................'}</div>
          <div style="font-size:${Zn.s};color:#888;margin-top:4px">Strategic Partnership</div>
          <div style="font-size:${Zn.s};color:#888">${fmtDate(q.QuoteDate)}</div>
        </div>
      </div>
      <div>
        <div style="font-size:${Zn.s};color:#888;margin-bottom:4px">Approved By</div>
        ${d.approverSignatureBase64
          ? `<img src="${d.approverSignatureBase64}" style="max-height:44px;object-fit:contain;display:block;margin:0 auto 4px">`
          : '<div style="height:44px"></div>'
        }
        <div style="border-top:0.5px solid #ccc;padding-top:8px">
          <div style="color:#333;font-weight:500">${d.approverName || '(Apichart Silarat)'}</div>
          <div style="font-size:${Zn.s};color:#888;margin-top:4px">Sale Director</div>
          <div style="font-size:${Zn.s};color:#888">apichart.s@itservices.co.th</div>
          <div style="font-size:${Zn.s};color:#888">(Mobile : 098-7959693)</div>
        </div>
      </div>
    </div></div>`;

  // ── แบ่งรายการเป็นหน้าตาม __pagebreak ──
  const pageGroups = [[]];
  (d.items || []).forEach(it => {
    if (it.__pagebreak) pageGroups.push([]);
    else pageGroups[pageGroups.length - 1].push(it);
  });
  const lastIdx = pageGroups.length - 1;
  const ctr = { n: 0 };
  const pagesHTML = pageGroups.map((arr, pi) => {
    const isLast = pi === lastIdx;
    const rows = renderRows(arr, ctr);
    // หน้าสุดท้าย: เติมแถว filler ที่ยืดเต็มพื้นที่ (height:100%) เพื่อดันยอดรวมไปชิดล่างแบบ Invoice
    // ยืดเต็มพื้นที่ "เฉพาะหน้าสุดท้าย" เท่านั้น — หน้าอื่น (ก่อนตัวแบ่งหน้า) คงขนาดบรรทัดเดิม
    const fillerRow = isLast ? `<tr class="pdf-filler" style="height:100%"><td colspan="${colspan}" style="border-bottom:0.5px solid #e5e7eb"></td></tr>` : '';
    const tableFlex = isLast ? 'flex:1;' : '';
    const tbl = rowsInner => `<table style="width:100%;border-collapse:collapse;border:0.5px solid #e5e7eb;${tableFlex}font-size:${Zt.m};table-layout:fixed">${tableHead}<tbody>${rowsInner}</tbody></table>`;
    const itemsTable = arr.length
      ? tbl(rows + fillerRow)
      : (isLast ? '<div style="flex:1"></div>' : tbl(`<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:#aaa">ไม่มีรายการ</td></tr>`));
    // เลขหน้า — รูปแบบ page 1/2 (ซ่อนถ้ามีหน้าเดียว)
    const pageLabel = (lastIdx === 0) ? '' : `<div class="pdf-continued" style="text-align:right;color:#888;font-size:${Zn.s};font-weight:500;border-top:0.5px solid #e5e7eb;margin-top:10px;padding-top:6px">page ${pi+1}/${lastIdx+1}</div>`;
    const tail = (isLast ? summaryBlock : '') + pageLabel;
    // wrap ยืด (flex:1) เฉพาะหน้าสุดท้าย; หน้าอื่นเป็น block ปกติ (ไม่ยืด)
    const wrapStyle = isLast ? 'flex:1;display:flex;flex-direction:column;margin-bottom:12px' : 'flex:0 0 auto;margin-bottom:12px';
    return `<div class="pdf-page">${headBlock}${pi===0 ? custBlock : ''}<div class="pdf-items-wrap" style="${wrapStyle}">${itemsTable}</div>${tail}</div>`;
  }).join('');

  const _cleanFn = s => String(s||'').replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim();
  const _fileName = [q.Title, q.ClientName, (q.Tag||q.Project||'')].map(_cleanFn).filter(Boolean).join('_') || 'Quotation';
  return `<div class="pdf-preview" id="pdf-printable" data-filename="${escHtml(_fileName)}" style="font-family:'Sarabun','IBM Plex Sans Thai',sans-serif;font-size:${Zi.m};color:#1a1a2e;background:transparent;padding:0">${pagesHTML}</div>`;
}

function statusBadge(s) {
  const m = {Draft:'badge-draft',Pending:'badge-pending',Approved:'badge-approved',Rejected:'badge-rejected',Sent:'badge-sent',Cancelled:'badge-cancelled','PO Received':'badge-poreceived',Closed:'badge-closed'};
  const l = {Draft:'Draft',Pending:'รออนุมัติ',Approved:'อนุมัติแล้ว',Rejected:'ปฏิเสธ',Sent:'ส่งแล้ว',Cancelled:'ยกเลิก','PO Received':'📋 PO Received',Closed:'✓ Closed'};
  return `<span class="badge ${m[s]||'badge-draft'}">${l[s]||s}</span>`;
}

function payBadge(q) {
  const paid = q.PaidAmount||0, total = q.TotalAmount||0;
  if (paid >= total && total > 0) return '<span class="badge badge-paid">ชำระแล้ว</span>';
  if (paid > 0) return `<span class="badge badge-partial">บางส่วน ${Math.round(paid/total*100)}%</span>`;
  return '<span class="badge badge-unpaid">ยังไม่ชำระ</span>';
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function toast(msg, type='info') {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function exportPDF() {
  const el = document.getElementById('pdf-printable');
  if (!el) { toast('ไม่พบข้อมูล PDF', 'error'); return; }
  const fname = (el.dataset.filename || 'Quotation').replace(/[<>&]/g,'');
  const html = '<!DOCTYPE html><html>'
    + '<head><meta charset="UTF-8"><title>' + fname + '<\/title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + "body{font-family:'Sarabun','IBM Plex Sans Thai',sans-serif;color:#1a1a2e;background:#fff;font-size:12px}"
    + 'table{width:100%;border-collapse:collapse}'
    + '.pdf-preview{padding:0!important;background:transparent!important}'
    // ── multi-page A4: แต่ละ .pdf-page = 1 แผ่น ขึ้นหน้าใหม่ ──
    + '.pdf-page{padding:5mm;min-height:287mm;page-break-after:always;break-after:page;display:flex;flex-direction:column}'
    + '.pdf-page:last-child{page-break-after:auto;break-after:auto}'
    + '.pdf-page + .pdf-page{margin-top:0!important;border-top:0!important}'
    + 'thead{display:table-header-group}'           /* ซ้ำหัวตารางเมื่อตารางยาวเกินหน้า */
    + 'tr{page-break-inside:avoid}'                 /* แถวไม่ขาดกลางหน้า */
    + '.pdf-summary-row{page-break-inside:avoid}'   /* ยอดรวม+หมายเหตุไม่ขาดกลางหน้า */
    + '.pdf-footer-block{page-break-inside:avoid}'  /* บล็อกลายเซ็นไม่ขาด */
    + '@page{size:A4;margin:0}'
    + '@media print{body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '<\/style><\/head>'
    + '<body>' + el.outerHTML
    + '<scr' + 'ipt>setTimeout(function(){window.print();},600);<\/scr' + 'ipt>'
    + '<\/body><\/html>';
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);
}



// ── สร้าง PDF ใบเสนอราคาเป็น base64 (ใช้แนบอีเมลอนุมัติ) ──
function _loadScriptOnce(src){
  return new Promise(function(res,rej){
    if (document.querySelector('script[data-lib="'+src+'"]')) return res();
    var s=document.createElement('script'); s.src=src; s.setAttribute('data-lib',src);
    s.onload=function(){res();}; s.onerror=function(){rej(new Error('โหลดไลบรารีไม่สำเร็จ: '+src));};
    document.head.appendChild(s);
  });
}
async function ensurePdfLibs(){
  if (!window.html2canvas) await _loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  if (!(window.jspdf && window.jspdf.jsPDF)) await _loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
}
async function renderQuotePDFBase64(d){
  await ensurePdfLibs();
  var wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1';
  wrap.innerHTML='<style>'
    +'#_pdfgen .pdf-page{width:794px;min-height:1123px;padding:19px;display:flex;flex-direction:column;background:#fff;box-sizing:border-box}'
    +'#_pdfgen table{border-collapse:collapse;width:100%}'
    +'</style><div id="_pdfgen">'+renderPDFHTML(d)+'</div>';
  document.body.appendChild(wrap);
  try{
    try{ if(document.fonts&&document.fonts.ready) await document.fonts.ready; }catch(e){}
    await new Promise(function(r){setTimeout(r,350);});
    var pages=wrap.querySelectorAll('.pdf-page');
    var jsPDF=window.jspdf.jsPDF, doc=new jsPDF('p','mm','a4'), first=true;
    for (var i=0;i<pages.length;i++){
      var canvas=await window.html2canvas(pages[i],{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:794});
      var img=canvas.toDataURL('image/jpeg',0.92);
      if(!first) doc.addPage(); first=false;
      doc.addImage(img,'JPEG',0,0,210,297);
    }
    return doc.output('datauristring').split(',')[1];
  } finally { wrap.remove(); }
}
async function currentQuotePDFAttachment(){
  var d=buildCurrentQuoteData(); var q=d.q||{};
  var clean=function(s){return String(s||'').replace(/[\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim();};
  var name=[q.Title,q.ClientName,(q.Tag||q.Project||'')].map(clean).filter(Boolean).join('_')||'Quotation';
  var base64=await renderQuotePDFBase64(d);
  return { name: name+'.pdf', contentType:'application/pdf', base64: base64 };
}
