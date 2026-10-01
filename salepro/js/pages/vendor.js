// ============================================================
// VENDOR — ผู้ขาย/คู่ค้า + เอกสารสัญญา (เก็บ JSON ใน Settings, ไฟล์ขึ้น drive)
// vendorsData = [{id, name, contact, phone, email, note, contracts:[{id,name,url,ts}]}]
// ============================================================
let vendorsData = [];
let vendorsLoaded = false;
let editingVendorId = null;
let _vdEditContracts = [];   // contracts ของ vendor ที่กำลังแก้ใน modal

async function loadVendors() {
  if (!vendorsLoaded) {
    try {
      const items = _settingsCache || await getListItems(CONFIG.lists.settings);
      const it = items.find(i => i.Title === 'Vendors');
      vendorsData = (it && it.Value) ? (JSON.parse(it.Value) || []) : [];
    } catch(e) { vendorsData = []; }
    vendorsLoaded = true;
  }
  renderVendors();
}

async function saveVendorsStore() {
  try { await saveSettingItem('Vendors', JSON.stringify(vendorsData)); }   // → ProcurementData list
  catch(e) { toast('บันทึก Vendor ไม่สำเร็จ: ' + e.message, 'error'); throw e; }
}

function renderVendors() {
  const body = document.getElementById('vendor-body');
  if (!body) return;
  const q = (document.getElementById('vd-search')?.value || '').toLowerCase();
  const list = vendorsData.filter(v => !q || (v.name||'').toLowerCase().includes(q) || (v.contact||'').toLowerCase().includes(q) || (v.email||'').toLowerCase().includes(q));
  body.innerHTML = list.length ? list.map(v => `
    <tr>
      <td style="font-weight:500">${escHtml(v.name||'')}</td>
      <td>${escHtml(v.contact||'')}</td>
      <td>${escHtml(v.phone||'')}</td>
      <td>${escHtml(v.email||'')}</td>
      <td>${(v.contracts||[]).length
        ? (v.contracts||[]).map(d=>`<a href="${d.url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--accent2);text-decoration:none;background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.2);border-radius:5px;padding:2px 7px;margin:1px 2px 1px 0"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${escHtml(d.name)}</a>`).join('')
        : '<span style="font-size:11px;color:var(--muted)">—</span>'}</td>
      <td style="font-size:12px;color:var(--muted);max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(v.note||'')}</td>
      <td style="display:flex;gap:4px">
        <button class="action-btn" onclick="editVendor('${v.id}')" title="แก้ไข"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn" onclick="deleteVendor('${v.id}')" style="color:var(--red)" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </td>
    </tr>`).join('') : '<tr><td colspan=7 style="text-align:center;padding:32px;color:var(--muted)">ยังไม่มี Vendor — กด "เพิ่ม Vendor"</td></tr>';
}

function openAddVendor() {
  editingVendorId = null;
  _vdEditContracts = [];
  document.getElementById('vm-title').textContent = 'เพิ่ม Vendor';
  ['vd-name','vd-contact','vd-phone','vd-email','vd-note'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('vd-file').value = '';
  document.getElementById('vd-file-status').textContent = '';
  renderVendorContracts();
  openModal('vendor-modal');
}

function editVendor(id) {
  const v = vendorsData.find(x => String(x.id) === String(id));
  if (!v) return;
  editingVendorId = v.id;
  _vdEditContracts = [...(v.contracts || [])];
  document.getElementById('vm-title').textContent = 'แก้ไข Vendor';
  document.getElementById('vd-name').value = v.name || '';
  document.getElementById('vd-contact').value = v.contact || '';
  document.getElementById('vd-phone').value = v.phone || '';
  document.getElementById('vd-email').value = v.email || '';
  document.getElementById('vd-note').value = v.note || '';
  document.getElementById('vd-file').value = '';
  document.getElementById('vd-file-status').textContent = '';
  renderVendorContracts();
  openModal('vendor-modal');
}

function renderVendorContracts() {
  const wrap = document.getElementById('vd-contracts');
  if (!wrap) return;
  wrap.innerHTML = _vdEditContracts.length ? _vdEditContracts.map(d => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px">
      <a href="${d.url}" target="_blank" rel="noopener" style="color:var(--accent2);text-decoration:none;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📄 ${escHtml(d.name)}</a>
      <button class="action-btn" onclick="removeVendorContract(${d.id})" style="color:var(--red)" title="ลบเอกสาร"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join('') : '<div style="font-size:11px;color:var(--muted)">ยังไม่มีเอกสารแนบ</div>';
}

async function uploadVendorContract(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const st = document.getElementById('vd-file-status');
  try {
    if (st) st.textContent = 'กำลังอัปโหลด...';
    const b64 = await fileToBase64(f);
    const base64Data = String(b64).split(',')[1] || '';
    const res = await _uploadFileGraph('VendorContracts', 'VENDOR_' + Date.now() + '_' + f.name, f.type || 'application/octet-stream', base64Data);
    if (!res.fileUrl) throw new Error('เซิร์ฟเวอร์ไม่ส่ง URL กลับมา');
    _vdEditContracts.push({ id: Date.now(), name: f.name, url: res.fileUrl, ts: new Date().toISOString() });
    if (st) st.textContent = '✓ แนบแล้ว';
    input.value = '';
    renderVendorContracts();
  } catch(e) {
    if (st) st.textContent = '';
    alert('⚠ แนบเอกสารไม่สำเร็จ\n\nเหตุผล: ' + (e.message || 'ไม่ทราบสาเหตุ'));
  }
}
function removeVendorContract(cid) {
  _vdEditContracts = _vdEditContracts.filter(d => d.id !== cid);
  renderVendorContracts();
}

async function saveVendor() {
  const name = document.getElementById('vd-name').value.trim();
  if (!name) { toast('กรุณาระบุชื่อ Vendor', 'error'); return; }
  const obj = {
    name,
    contact: document.getElementById('vd-contact').value.trim(),
    phone: document.getElementById('vd-phone').value.trim(),
    email: document.getElementById('vd-email').value.trim(),
    note: document.getElementById('vd-note').value.trim(),
    contracts: [..._vdEditContracts]
  };
  if (editingVendorId) {
    const v = vendorsData.find(x => String(x.id) === String(editingVendorId));
    if (v) Object.assign(v, obj);
  } else {
    vendorsData.push({ id: Date.now(), ...obj });
  }
  try {
    await saveVendorsStore();
    renderVendors();
    closeModal('vendor-modal');
    toast('บันทึก Vendor สำเร็จ', 'success');
  } catch(e) { /* toast shown in store */ }
}

async function deleteVendor(id) {
  const v = vendorsData.find(x => String(x.id) === String(id));
  if (!v) return;
  if (!confirm('ลบ Vendor "' + (v.name||'') + '" ?\n(เอกสารที่อัปโหลดไว้จะยังอยู่บน SharePoint)')) return;
  vendorsData = vendorsData.filter(x => String(x.id) !== String(id));
  try { await saveVendorsStore(); renderVendors(); toast('ลบ Vendor แล้ว', 'success'); } catch(e) {}
}

// helper สำหรับเฟสถัดไป (Catalog/จัดซื้อ ผูก Vendor)
function getVendorById(id) { return vendorsData.find(v => String(v.id) === String(id)) || null; }
function vendorOptionsHTML(selectedId) {
  return '<option value="">– เลือก Vendor –</option>' +
    vendorsData.map(v => `<option value="${v.id}"${String(v.id)===String(selectedId)?' selected':''}>${escHtml(v.name)}</option>`).join('');
}
