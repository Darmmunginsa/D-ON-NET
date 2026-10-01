// ============================================================
// PROCUREMENT — แจ้งจัดซื้อ (เฟส 4)
// - เลือกรายการอิสระจากใบเสนอราคา + เพิ่มรายการเองได้
// - ผูกกับ Vendor (จากหน้า Vendor) + แนบเอกสารจัดซื้อ
// - บันทึกใบสั่งซื้อ (PO) เก็บเป็น JSON ใน Settings: key 'Procurements' (ทั้งบริษัท)
// - ไฟล์อัปขึ้น drive โฟลเดอร์ 'ProcurementDocs' — ไม่สร้าง List/คอลัมน์ใหม่
// Override ของ saletracker.js: initProcurementTab / previewPOEmail / sendPORequest
// ============================================================

let procLineItems = [];   // {id, name, unit, qty, cost, sel, src:'quote'|'custom'}
let procDocs = [];        // {id, name, url, ts}
let procVendorId = '';
let procEditingPOId = null;
let procStore = null;     // cache ของ Procurements ทั้งหมด

// ---- store helpers (Settings list) ----
async function loadProcurements() {
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const it = items.find(i => i.Title === 'Procurements');
    procStore = (it && it.Value) ? (JSON.parse(it.Value) || []) : [];
  } catch(e) { procStore = []; }
  return procStore;
}
async function saveProcurementsStore() {
  await saveSettingItem('Procurements', JSON.stringify(procStore || []));   // → ProcurementData list
}

// ---- init (override saletracker) ----
async function initProcurementTab() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const _v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const req = new Date(); req.setDate(req.getDate() + 7);
  _v('po-required-date', req.toISOString().split('T')[0]);
  _v('po-budget', q.TotalAmount || '');
  _v('po-costcenter', '');
  _v('po-note', '');
  procVendorId = '';
  procDocs = [];
  procEditingPOId = null;

  // Vendor dropdown
  if (typeof loadVendors === 'function' && !vendorsLoaded) { try { await loadVendors(); } catch(e) {} }
  const sel = document.getElementById('po-vendor-sel');
  if (sel && typeof vendorOptionsHTML === 'function') sel.innerHTML = vendorOptionsHTML('');

  // ผู้รับ email (เดิม)
  try { const s = localStorage.getItem('po_recipients_' + (currentUser?.email || '')); poRecipients = s ? JSON.parse(s) : []; } catch(e) { poRecipients = []; }
  if (!poRecipients.length) poRecipients = [{ id: Date.now(), email: '' }];
  renderPORecipients();

  await loadProcurements();   // โหลดใบสั่งซื้อที่บันทึกไว้ก่อน — เพื่อให้ล็อกรายการที่ส่งแล้วถูกต้อง
  await procLoadItems();
  // เดา Vendor จากรายการที่เลือก (ถ้าทุกชิ้นเป็น Vendor เดียวกัน)
  const vids = procLineItems.filter(i => i.sel && i.vendorId).map(i => String(i.vendorId));
  if (vids.length && vids.every(v => v === vids[0])) { procVendorId = vids[0]; if (sel) sel.value = vids[0]; }

  renderProcItems();
  renderProcDocs();
  renderSavedPOs();
  renderPPProgress();
}

// แสดง progress จาก PurchasePro — แยกตามใบสั่งซื้อแต่ละใบ (อ่าน Settings: Purchase_<id>)
const PP_TXT = {1:'ส่งจัดซื้อแล้ว',2:'กำลังขอราคา',3:'กำลังขอราคา',4:'กำลังเทียบราคา',5:'สั่งซื้อแล้ว',6:'สั่งซื้อแล้ว',7:'รอของ',8:'ของถึงแล้ว'};
function _ppStageFor(poId) {
  try { const it = (_settingsCache || []).find(i => i.Title === 'Purchase_' + poId); if (it && it.Value) { const o = JSON.parse(it.Value); return { stage:+o.stage||1, closed:!!o.closed, updatedAt:o.updatedAt }; } } catch(e) {}
  return null;
}
function _ppDots(cur) {
  const labels = ['ส่งจัดซื้อ','ขอราคา','เทียบราคา','สั่งซื้อ','จ่ายเงิน','รอของ','ของถึง','รับครบ'];
  const stageToDot = [0,0,1,2,3,4,5,6,7];
  const curDot = stageToDot[cur] || 0;
  return labels.map((l, i) => {
    const done = i < curDot, now = i === curDot;
    const col = done ? 'var(--green)' : (now ? 'var(--accent2)' : 'var(--border2)');
    const txt = done ? 'var(--green)' : (now ? 'var(--accent2)' : 'var(--muted)');
    return '<div style="flex:1;text-align:center"><div style="width:12px;height:12px;border-radius:50%;background:' + col + ';margin:0 auto 3px;border:2px solid ' + col + '"></div><div style="font-size:9px;color:' + txt + '">' + l + '</div></div>';
  }).join('<div style="flex:0 0 auto;align-self:flex-start;margin-top:5px;color:var(--border2)">—</div>');
}
function renderPPProgress() {
  const wrap = document.getElementById('pp-progress');
  if (!wrap) return;
  const list = (typeof getProcurementsForQuote === 'function') ? getProcurementsForQuote(stQuoteId) : [];
  if (!list.length) { wrap.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px 0">ยังไม่ได้ส่งงานให้จัดซื้อ — กรอกรายการแล้วกด "ส่งให้ทีมจัดซื้อ"</div>'; return; }
  wrap.innerHTML = '<div style="font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">สถานะจัดซื้อ (PurchasePro) — ' + list.length + ' ใบ</div>' +
    list.map((p, n) => {
      const st = _ppStageFor(p.id);
      const stage = st ? st.stage : 1;
      const statusTxt = st && st.closed ? '✓ เสร็จสมบูรณ์' : (PP_TXT[stage] || '');
      const col = st && st.closed ? 'var(--green)' : 'var(--accent2)';
      return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        + '<span style="font-size:12px;font-weight:600">📦 ใบที่ ' + (n+1) + (p.vendorName ? ' · ' + escHtml(p.vendorName) : '') + ' <span style="color:var(--muted);font-weight:400">(' + (p.items||[]).length + ' รายการ)</span></span>'
        + '<span style="font-size:11px;color:' + col + ';font-weight:600">' + statusTxt + '</span></div>'
        + '<div style="display:flex;align-items:flex-start">' + _ppDots(stage) + '</div></div>';
    }).join('');
}

async function procLoadItems() {
  procLineItems = [];
  try {
    const all = await getListItems(CONFIG.lists.quoteItems);
    const items = all.filter(i => String(i.QuoteID) === String(stQuoteId) && !isMarkerItem(i));
    const extra = (typeof getQuoteItemExtra === 'function' ? getQuoteItemExtra(stQuoteId) : null) || [];
    const exNon = extra.filter(e => e && Object.keys(e).length > 0);  // ตัด marker {} ออก
    procLineItems = items.map((it, idx) => {
      const ex = exNon[idx] || {};
      return {
        id: 'q' + (it.id || idx),
        name: it.Title || '',
        unit: it.Unit || '',
        qty: +it.Quantity || 1,
        cost: +ex.cost || 0,
        vendorId: ex.vendorId || '',
        sel: true,
        src: 'quote'
      };
    });
  } catch(e) { procLineItems = []; }
}

function procTotal() {
  return procLineItems.filter(i => i.sel).reduce((a, i) => a + (+i.qty || 0) * (+i.cost || 0), 0);
}

function renderProcItems() {
  const el = document.getElementById('po-items-preview');
  if (!el) return;
  if (!procLineItems.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px">ยังไม่มีรายการ — กด "เพิ่มรายการเอง"</div>';
  } else {
    const ip = 'background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:4px 6px;font-size:11px;color:var(--text);font-family:var(--font);outline:none;width:100%';
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:rgba(255,255,255,0.03)">'
      + '<th style="padding:5px 6px;width:24px"></th>'
      + '<th style="padding:5px 6px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500">รายการ</th>'
      + '<th style="padding:5px 6px;text-align:center;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500;width:54px">จำนวน</th>'
      + '<th style="padding:5px 6px;text-align:center;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500;width:56px">หน่วย</th>'
      + '<th style="padding:5px 6px;text-align:right;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500;width:90px">ต้นทุน/หน่วย</th>'
      + '<th style="padding:5px 6px;text-align:right;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500;width:90px">รวม</th>'
      + '<th style="padding:5px 6px;width:24px"></th></tr></thead><tbody>'
      + (function(){ const sent = _sentItemNames(); procLineItems.forEach(it => { if (it.src !== 'custom' && sent.has((it.name||'').trim())) it.sel = false; }); return procLineItems; })().map(it => {
        const locked = it.src !== 'custom' && _sentItemNames().has((it.name||'').trim());
        const pc = (typeof procurementCostFor === 'function' && typeof stQuoteId !== 'undefined') ? procurementCostFor(it, stQuoteId) : 0;
        if (pc > 0) it.cost = pc;   // ราคาจริงที่จัดซื้อได้มา → อัปเดตต้นทุนอัตโนมัติ
        const lt = (+it.qty || 0) * (+it.cost || 0);
        const dim = (it.sel && !locked) ? '' : 'opacity:0.4';
        return '<tr style="' + dim + '">'
          + '<td style="padding:4px 6px;text-align:center;border-bottom:1px solid var(--border)"><input type="checkbox" ' + (it.sel ? 'checked' : '') + (locked ? ' disabled' : '') + ' onchange="procToggle(\'' + it.id + '\')"></td>'
          + '<td style="padding:4px 6px;border-bottom:1px solid var(--border)">' + (it.src === 'custom'
              ? '<input value="' + escHtml(it.name) + '" placeholder="ชื่อรายการ" oninput="procUpdate(\'' + it.id + '\',\'name\',this.value)" style="' + ip + '">'
              : '<span style="color:var(--text);font-weight:500">' + escHtml(it.name || '-') + '</span>' + (locked ? ' <span style="font-size:9px;color:var(--green);border:1px solid var(--green);border-radius:8px;padding:1px 5px">ส่งจัดซื้อแล้ว</span>' : '')) + '</td>'
          + '<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input type="number" min="0" value="' + (it.qty) + '" oninput="procUpdate(\'' + it.id + '\',\'qty\',+this.value)" style="' + ip + ';text-align:center"></td>'
          + '<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="' + escHtml(it.unit || '') + '" oninput="procUpdate(\'' + it.id + '\',\'unit\',this.value)" style="' + ip + ';text-align:center"></td>'
          + '<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input type="number" min="0" value="' + (it.cost) + '" oninput="procUpdate(\'' + it.id + '\',\'cost\',+this.value)" style="' + ip + ';text-align:right;font-family:var(--mono)">' + (pc > 0 ? '<div style="font-size:8px;color:var(--green);text-align:right;margin-top:1px">✓ จากจัดซื้อ</div>' : '') + '</td>'
          + '<td style="padding:4px 6px;text-align:right;border-bottom:1px solid var(--border);font-family:var(--mono);color:var(--accent2);font-weight:500">' + fmt(lt) + '</td>'
          + '<td style="padding:4px 6px;text-align:center;border-bottom:1px solid var(--border)">' + (it.src === 'custom'
              ? '<button class="action-btn" onclick="removeProcItem(\'' + it.id + '\')" style="color:var(--red)" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
              : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  const tot = document.getElementById('po-total');
  if (tot) tot.textContent = fmt(procTotal());
}

function procToggle(id) { const it = procLineItems.find(x => x.id === id); if (it) { it.sel = !it.sel; renderProcItems(); } }
function procUpdate(id, field, val) {
  const it = procLineItems.find(x => x.id === id);
  if (!it) return;
  it[field] = val;
  if (field === 'qty' || field === 'cost') {
    const tot = document.getElementById('po-total'); if (tot) tot.textContent = fmt(procTotal());
  }
}
function addProcCustomItem() {
  procLineItems.push({ id: 'c' + Date.now(), name: '', unit: '', qty: 1, cost: 0, sel: true, src: 'custom' });
  renderProcItems();
}
function removeProcItem(id) { procLineItems = procLineItems.filter(x => x.id !== id); renderProcItems(); }

function procVendorChanged() { procVendorId = document.getElementById('po-vendor-sel')?.value || ''; }

// ---- documents ----
async function uploadProcDoc(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const st = document.getElementById('po-doc-status');
  try {
    if (st) st.textContent = 'กำลังอัปโหลด...';
    const b64 = await fileToBase64(f);
    const base64Data = String(b64).split(',')[1] || '';
    const res = await _uploadFileGraph('ProcurementDocs', 'PROC_' + Date.now() + '_' + f.name, f.type || 'application/octet-stream', base64Data);
    if (!res.fileUrl) throw new Error('เซิร์ฟเวอร์ไม่ส่ง URL กลับมา');
    procDocs.push({ id: Date.now(), name: f.name, url: res.fileUrl, ts: new Date().toISOString() });
    if (st) st.textContent = '';
    input.value = '';
    renderProcDocs();
  } catch(e) {
    if (st) st.textContent = '';
    alert('⚠ แนบเอกสารไม่สำเร็จ\n\nเหตุผล: ' + (e.message || 'ไม่ทราบสาเหตุ'));
  }
}
function removeProcDoc(id) { procDocs = procDocs.filter(d => d.id !== id); renderProcDocs(); }
function renderProcDocs() {
  const wrap = document.getElementById('po-docs-list');
  if (!wrap) return;
  wrap.innerHTML = procDocs.length ? procDocs.map(d => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;margin-bottom:4px">
      <a href="${d.url}" target="_blank" rel="noopener" style="color:var(--accent2);text-decoration:none;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📄 ${escHtml(d.name)}</a>
      <button class="action-btn" onclick="removeProcDoc(${d.id})" style="color:var(--red)" title="ลบเอกสาร"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join('') : '<div style="font-size:11px;color:var(--muted)">ยังไม่มีเอกสารแนบ</div>';
}

// ---- save PO ----
async function saveProcurement() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const selected = procLineItems.filter(i => i.sel && (i.name || '').trim());
  if (!selected.length) { toast('กรุณาเลือกอย่างน้อย 1 รายการ', 'error'); return; }
  // Vendor ไม่บังคับ — ทีมจัดซื้อจะเป็นคนเลือก/เทียบราคาเองใน PurchasePro
  const vendor = (procVendorId && typeof getVendorById === 'function') ? getVendorById(procVendorId) : null;
  const items = selected.map(i => ({ name: i.name, unit: i.unit || '', qty: +i.qty || 0, cost: +i.cost || 0, total: (+i.qty || 0) * (+i.cost || 0) }));
  const total = items.reduce((a, i) => a + i.total, 0);
  const rec = {
    id: procEditingPOId || Date.now(),
    quoteId: stQuoteId,
    quoteTitle: q.Title || '',
    client: q.ClientName || '',
    vendorId: procVendorId,
    vendorName: vendor ? vendor.name : '',
    poRef: document.getElementById('po-costcenter')?.value || '',
    requiredDate: document.getElementById('po-required-date')?.value || '',
    note: document.getElementById('po-note')?.value || '',
    items, total,
    docs: procDocs.map(d => ({ id: d.id, name: d.name, url: d.url, ts: d.ts })),
    createdBy: currentUser?.displayName || currentUser?.email || '',
    createdAt: new Date().toISOString()
  };
  try {
    if (!procStore) await loadProcurements();
    const idx = procStore.findIndex(p => String(p.id) === String(rec.id));
    if (idx >= 0) procStore[idx] = rec; else procStore.push(rec);
    await saveProcurementsStore();
    // timeline note
    stDealData.notes = stDealData.notes || [];
    stDealData.notes.push({ id: Date.now(), user: currentUser?.displayName || 'User', text: '📨 ส่งงานให้ทีมจัดซื้อ' + (rec.vendorName ? ' (Vendor: ' + rec.vendorName + ')' : '') + ' — ' + items.length + ' รายการ, ' + fmt(total), ts: new Date().toISOString(), type: 'procurement' });
    await saveSTDealData();
    procEditingPOId = null;
    renderSavedPOs();
    toast('ส่งให้ทีมจัดซื้อแล้ว — ติดตามสถานะได้ใน PurchasePro', 'success');
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

function getProcurementsForQuote(qid) { return (procStore || []).filter(p => String(p.quoteId) === String(qid)); }
// ชื่อรายการที่ถูกส่งจัดซื้อไปแล้ว (ในใบสั่งซื้ออื่นของใบเสนอราคานี้) — กันเลือกซ้ำ
function _sentItemNames() {
  const set = new Set();
  (procStore || []).forEach(p => {
    if (String(p.quoteId) !== String(stQuoteId)) return;
    if (procEditingPOId && String(p.id) === String(procEditingPOId)) return;
    (p.items || []).forEach(it => set.add((it.name || '').trim()));
  });
  return set;
}

function renderSavedPOs() {
  const wrap = document.getElementById('po-saved-list');
  if (!wrap) return;
  const list = getProcurementsForQuote(stQuoteId);
  if (!list.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div style="font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">ใบสั่งซื้อที่บันทึกไว้ (' + list.length + ')</div>'
    + list.map(p => `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">🏢 ${escHtml(p.vendorName || '-')}${p.poRef ? ' · <span style="color:var(--muted);font-weight:400">' + escHtml(p.poRef) + '</span>' : ''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${p.items.length} รายการ · รวม <span style="color:var(--accent2);font-weight:600">${fmt(p.total)}</span>${p.requiredDate ? ' · ต้องการ ' + escHtml(p.requiredDate) : ''}</div>
        </div>
        <button class="action-btn" onclick="editProcurementPO(${p.id})" title="แก้ไข"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn" onclick="deleteProcurementPO(${p.id})" style="color:var(--red)" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div>
      ${(p.docs && p.docs.length) ? '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">' + p.docs.map(d => `<a href="${d.url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent2);text-decoration:none;background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.2);border-radius:5px;padding:2px 7px">📄 ${escHtml(d.name)}</a>`).join('') + '</div>' : ''}
    </div>`).join('');
}

function editProcurementPO(id) {
  const p = (procStore || []).find(x => String(x.id) === String(id));
  if (!p) return;
  procEditingPOId = p.id;
  procVendorId = p.vendorId || '';
  const sel = document.getElementById('po-vendor-sel'); if (sel) sel.value = procVendorId;
  const _v = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val; };
  _v('po-costcenter', p.poRef || '');
  _v('po-required-date', p.requiredDate || '');
  _v('po-note', p.note || '');
  procLineItems = (p.items || []).map((i, idx) => ({ id: 'c' + (Date.now() + idx), name: i.name, unit: i.unit || '', qty: +i.qty || 0, cost: +i.cost || 0, sel: true, src: 'custom' }));
  procDocs = (p.docs || []).map(d => ({ ...d }));
  renderProcItems();
  renderProcDocs();
  toast('โหลดใบสั่งซื้อมาแก้ไข — กด "บันทึกใบสั่งซื้อ" เพื่ออัปเดต', 'info');
}

async function deleteProcurementPO(id) {
  const p = (procStore || []).find(x => String(x.id) === String(id));
  if (!p) return;
  if (!confirm('ลบใบสั่งซื้อของ "' + (p.vendorName || '') + '" ?\n(เอกสารที่อัปโหลดไว้จะยังอยู่บน SharePoint)')) return;
  procStore = procStore.filter(x => String(x.id) !== String(id));
  try { await saveProcurementsStore(); renderSavedPOs(); toast('ลบใบสั่งซื้อแล้ว', 'success'); } catch(e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error'); }
}

// ---- email overrides (ใช้รายการที่เลือก + Vendor dropdown) ----
function _procVendorName() {
  const v = (typeof getVendorById === 'function') ? getVendorById(procVendorId) : null;
  return v ? v.name : '';
}
function _procSelectedItems() { return procLineItems.filter(i => i.sel && (i.name || '').trim()); }

function previewPOEmail() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const recipients = poRecipients.map(r => r.email).filter(Boolean).join(', ');
  const sel = _procSelectedItems();
  const itemsText = sel.map((it, i) => (i + 1) + '. ' + (it.name || '-') + ' | ' + (it.qty || 1) + ' ' + (it.unit || '') + ' | ต้นทุน ' + fmt(it.cost || 0) + '/หน่วย | รวม ' + fmt((it.qty || 1) * (it.cost || 0))).join('\n');
  const note = document.getElementById('po-note')?.value || '';
  const reqDate = document.getElementById('po-required-date')?.value || '';
  const vendor = _procVendorName();
  const lines = [
    'ถึง: ' + (recipients || '(ยังไม่ได้ระบุ)'),
    'หัวข้อ: [จัดซื้อ] ' + (q.Title || '') + ' — ' + (q.ClientName || ''),
    '─────────────────────────────────',
    vendor ? 'Vendor: ' + vendor : '',
    'อ้างอิงใบเสนอราคา: ' + (q.Title || ''),
    'ลูกค้า: ' + (q.ClientName || ''),
    'ต้องการของภายใน: ' + reqDate,
    'มูลค่าจัดซื้อรวม: ' + fmt(procTotal()),
    '',
    'รายการจัดซื้อ:',
    itemsText || '(ยังไม่ได้เลือกรายการ)',
    note ? '\nหมายเหตุ: ' + note : ''
  ];
  alert(lines.filter(Boolean).join('\n'));
}

async function sendPORequest() {
  const q = quotesData.find(x => x.id === stQuoteId);
  if (!q) return;
  const valid = poRecipients.map(r => r.email.trim()).filter(e => e && e.includes('@'));
  if (!valid.length) { toast('กรุณาระบุ Email ฝ่ายจัดซื้ออย่างน้อย 1 คน', 'error'); return; }
  const reqDate = document.getElementById('po-required-date')?.value;
  if (!reqDate) { toast('กรุณาระบุวันที่ต้องการของ', 'error'); return; }
  const sel = _procSelectedItems();
  if (!sel.length) { toast('กรุณาเลือกอย่างน้อย 1 รายการ', 'error'); return; }
  try { localStorage.setItem('po_recipients_' + (currentUser?.email || ''), JSON.stringify(poRecipients)); } catch(e) {}
  try {
    toast('กำลังเปิด Email...', 'info');
    const vendor = _procVendorName();
    const ref = document.getElementById('po-costcenter')?.value || '';
    const notes = document.getElementById('po-note')?.value || '';
    const itemsText = sel.map((it, i) => (i + 1) + '. ' + (it.name || '-') + ' | ' + (it.qty || 1) + ' ' + (it.unit || '') + ' | ต้นทุน ' + fmt(it.cost || 0) + '/หน่วย | รวม ' + fmt((it.qty || 1) * (it.cost || 0))).join('\n');
    const subject = encodeURIComponent('[จัดซื้อ] ' + (q.Title || '') + ' — ' + (q.ClientName || ''));
    const body = encodeURIComponent(
      'คำขอจัดซื้อ\n─────────────────────────────────\n' +
      (vendor ? 'Vendor: ' + vendor + '\n' : '') +
      'อ้างอิงใบเสนอราคา: ' + (q.Title || '') + '\n' +
      'ลูกค้า: ' + (q.ClientName || '') + '\n' +
      'ต้องการของภายใน: ' + reqDate + '\n' +
      (ref ? 'เลขที่ PO/อ้างอิง: ' + ref + '\n' : '') +
      'มูลค่าจัดซื้อรวม: ' + fmt(procTotal()) + '\n' +
      '\nรายการสินค้า:\n' + itemsText +
      (notes ? '\n\nหมายเหตุ: ' + notes : '') +
      '\n\n─────────────────────────────────\nส่งโดย: ' + (currentUser?.displayName || '') + ' | SalePro System'
    );
    window.open('mailto:' + valid.join(',') + '?subject=' + subject + '&body=' + body, '_blank');
    stDealData.notes = stDealData.notes || [];
    stDealData.notes.push({ id: Date.now(), user: currentUser?.displayName || 'User', text: '📦 ส่งคำขอจัดซื้อแล้ว → ' + valid.join(', ') + '\nต้องการของภายใน: ' + reqDate, ts: new Date().toISOString(), type: 'procurement' });
    await saveSTDealData();
    switchSTTab('timeline', document.querySelector('.st-tab[data-tab="timeline"]'));
    renderSTTimeline();
    toast('✅ เปิด Email client สำเร็จ — กรุณาส่ง Email จาก client', 'success');
  } catch(e) { toast('เปิด Email ไม่สำเร็จ: ' + e.message, 'error'); }
}
