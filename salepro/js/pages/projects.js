// ============================================================
// PROJECTS — โครงการ (งานที่ต้องใช้ Sub-Vendor หลายเจ้า / 1 โครงการ)
// เฟส 1: Sale สร้างโครงการ (brief + สายงาน + ไฟล์แนบ) → ส่งให้จัดซื้อ
// เก็บเป็น record ใน store 'Procurements' เดิม (type:'project') — PurchasePro เห็นเป็นงานได้ทันที
// Join key = project.id (เป็น id งานจัดซื้อ); ผูก quoteId ภายหลังเมื่อ Sale สร้างใบเสนอราคา
// ไม่เพิ่มคอลัมน์ SharePoint — ไฟล์ขึ้น drive โฟลเดอร์ 'ProjectDocs'
// ============================================================

// state ระหว่างแก้ไขในกล่อง
let _projEditingId = null;
let _projScopes = [];   // {id,name,note}
let _projDocs = [];     // {id,name,url,ts}

function _projectsAll() { return (procStore || []).filter(p => p && p.type === 'project'); }
function _projStatusLabel(p) {
  if (p.quoteId) return ['เปิดใบเสนอราคาแล้ว', 'var(--green)'];
  if (Array.isArray(p.items) && p.items.length) return ['รายการพร้อม — รอเปิดใบเสนอราคา', 'var(--accent2)'];
  return ['ส่งจัดซื้อแล้ว — รอหา Vendor/ราคา', 'var(--amber)'];
}

// ดึง Procurements "สด" จากลิสต์ procurement (ไม่พึ่ง _settingsCache ที่ค้างตั้งแต่เปิดโปรแกรม)
// — จำเป็น เพราะ PurchasePro เขียนรายการ/ราคาเข้าลิสต์นี้หลังจาก SalePro โหลดแล้ว
async function _refreshProcStore() {
  try {
    const listId = (CONFIG.lists && CONFIG.lists.procurement) ? CONFIG.lists.procurement : CONFIG.lists.settings;
    const items = await getListItems(listId);
    const it = (items || []).find(i => i.Title === 'Procurements');
    procStore = (it && it.Value) ? (JSON.parse(it.Value) || []) : [];
    if (Array.isArray(_settingsCache)) {
      const idx = _settingsCache.findIndex(x => x.Title === 'Procurements');
      const rec = Object.assign({ Title: 'Procurements' }, it || {}, { _srcList: listId });
      if (idx >= 0) _settingsCache[idx] = rec; else if (it) _settingsCache.push(rec);
    }
  } catch(e) {
    try { if (!procStore && typeof loadProcurements === 'function') await loadProcurements(); } catch(e2) {}
  }
  return procStore || [];
}

async function loadProjectsPage() {
  await _refreshProcStore();
  renderProjects();
}

function renderProjects() {
  const host = document.getElementById('projects-list'); if (!host) return;
  const list = _projectsAll().sort((a,b) => String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if (!list.length) {
    host.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted);font-size:13px">ยังไม่มีโครงการ — กด “➕ สร้างโครงการ” เพื่อเริ่ม</div>';
    return;
  }
  host.innerHTML = list.map(function(p) {
    const [stTxt, stCol] = _projStatusLabel(p);
    const nScope = (p.scopes || []).length, nDoc = (p.docs || []).length, nItem = (p.items || []).length;
    return '<div style="border:1px solid var(--border);border-radius:10px;background:var(--surface2);padding:12px 14px;margin-bottom:10px">'
      + '<div style="display:flex;align-items:flex-start;gap:10px">'
      + '<div style="font-size:20px;line-height:1">🏗</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="font-size:14px;font-weight:600;color:var(--text)">' + escHtml(p.projectName || '(ไม่มีชื่อ)') + '</span>'
      + '<span class="badge" style="font-size:10px;background:rgba(79,142,247,0.14);color:var(--accent2)">🏗 โครงการ</span>'
      + '<span style="font-size:11px;color:' + stCol + '">● ' + stTxt + '</span>'
      + '</div>'
      + (p.client ? '<div style="font-size:12px;color:var(--muted);margin-top:2px">ลูกค้า: ' + escHtml(p.client) + '</div>' : '')
      + (p.note ? '<div style="font-size:12px;color:var(--text);margin-top:4px;white-space:pre-line;line-height:1.5">' + escHtml(String(p.note).slice(0,180)) + (String(p.note).length>180?'…':'') + '</div>' : '')
      + '<div style="font-size:11px;color:var(--muted);margin-top:6px;display:flex;gap:14px;flex-wrap:wrap">'
      + '<span>🧩 สายงาน ' + nScope + '</span><span>📎 ไฟล์ ' + nDoc + '</span>' + (nItem ? '<span>📋 รายการ ' + nItem + '</span>' : '')
      + (p.createdAt ? '<span>สร้าง ' + fmtDate((p.createdAt+'').split('T')[0]) + (p.createdBy?(' · '+escHtml(p.createdBy)):'') + '</span>' : '')
      + '</div>'
      + _projWaiverRow(p)
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:4px">'
      + '<button class="btn btn-sm" onclick="openProjectModal(\'' + p.id + '\')" style="font-size:11px">✎ แก้ไข</button>'
      + (p.quoteId ? '' : '<button class="btn btn-sm" onclick="deleteProject(\'' + p.id + '\')" style="font-size:11px;border:1px solid var(--red);color:var(--red)">ลบ</button>')
      + '</div>'
      + '</div></div>';
  }).join('');
}

// ---- waiver (ขอข้ามการรับ PO ลูกค้า) — จัดซื้อขอใน PurchasePro, ผู้อนุมัติอนุมัติที่นี่ ----
function _projWaiverRow(p) {
  const w = p.poWaiver; if (!w || !w.status) return '';
  const canApprove = !!(userRoles && (userRoles.isApprover || userRoles.isAdmin));
  if (w.status === 'approved') return '<div style="margin-top:8px;padding:8px 10px;border:1px solid var(--green);background:rgba(34,197,94,.08);border-radius:8px;font-size:12px;color:var(--green)">✅ อนุมัติให้ข้ามการรับ PO แล้ว (จัดซื้อออก PO ได้)' + (w.approvedBy ? (' · โดย ' + escHtml(w.approvedBy)) : '') + '</div>';
  if (w.status === 'rejected') return '<div style="margin-top:8px;padding:8px 10px;border:1px solid var(--red);background:rgba(239,68,68,.08);border-radius:8px;font-size:12px;color:var(--red)">✕ ปฏิเสธคำขอข้ามการรับ PO' + (w.rejectReason ? (' · ' + escHtml(w.rejectReason)) : '') + '</div>';
  return '<div style="margin-top:8px;padding:9px 11px;border:1px solid var(--amber);background:rgba(245,158,11,.08);border-radius:8px">'
    + '<div style="font-size:12px;font-weight:600;color:var(--amber)">⏳ จัดซื้อขอข้ามการรับ PO ลูกค้า — รออนุมัติ</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:2px">ผู้ขอ: ' + escHtml(w.by || '') + (w.at ? (' · ' + fmtDate((w.at+'').split('T')[0])) : '') + '</div>'
    + (w.reason ? '<div style="font-size:12px;color:var(--text);margin-top:3px">เหตุผล: ' + escHtml(w.reason) + '</div>' : '')
    + (canApprove
        ? '<div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-sm btn-primary" onclick="projApproveWaiver(\'' + p.id + '\')" style="font-size:11px">✓ อนุมัติให้ข้าม PO</button><button class="btn btn-sm" onclick="projRejectWaiver(\'' + p.id + '\')" style="font-size:11px;border:1px solid var(--red);color:var(--red)">✕ ปฏิเสธ</button></div>'
        : '<div style="font-size:11px;color:var(--muted);margin-top:4px">เฉพาะผู้อนุมัติเท่านั้นที่อนุมัติได้</div>')
    + '</div>';
}
async function projApproveWaiver(id) {
  if (!(userRoles && (userRoles.isApprover || userRoles.isAdmin))) { toast('เฉพาะผู้อนุมัติเท่านั้น', 'error'); return; }
  if (!confirm('อนุมัติให้ "ข้ามการรับ PO ลูกค้า" สำหรับโครงการนี้? จัดซื้อจะออก PO ให้ Vendor ได้ทันที')) return;
  await _refreshProcStore();
  const rec = (procStore || []).find(p => String(p.id) === String(id));
  if (!rec || !rec.poWaiver) { toast('ไม่พบคำขอ (อาจถูกยกเลิก)', 'error'); renderProjects(); return; }
  rec.poWaiver.status = 'approved';
  rec.poWaiver.approvedBy = (currentUser && (currentUser.displayName || currentUser.email)) || 'Approver';
  rec.poWaiver.approvedAt = new Date().toISOString();
  try { await saveProcurementsStore(); renderProjects(); toast('อนุมัติให้ข้ามการรับ PO แล้ว', 'success'); }
  catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}
async function projRejectWaiver(id) {
  if (!(userRoles && (userRoles.isApprover || userRoles.isAdmin))) { toast('เฉพาะผู้อนุมัติเท่านั้น', 'error'); return; }
  const reason = (prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ):', '') || '').trim();
  await _refreshProcStore();
  const rec = (procStore || []).find(p => String(p.id) === String(id));
  if (!rec || !rec.poWaiver) { toast('ไม่พบคำขอ', 'error'); renderProjects(); return; }
  rec.poWaiver.status = 'rejected'; rec.poWaiver.rejectReason = reason;
  rec.poWaiver.rejectedBy = (currentUser && (currentUser.displayName || currentUser.email)) || 'Approver';
  try { await saveProcurementsStore(); renderProjects(); toast('ปฏิเสธคำขอแล้ว', 'success'); }
  catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

// ---- modal (สร้าง/แก้ไขโครงการ) ----
function openProjectModal(id) {
  const rec = id ? _projectsAll().find(p => String(p.id) === String(id)) : null;
  _projEditingId = rec ? rec.id : null;
  _projScopes = rec && Array.isArray(rec.scopes) ? JSON.parse(JSON.stringify(rec.scopes)) : [];
  _projDocs = rec && Array.isArray(rec.docs) ? JSON.parse(JSON.stringify(rec.docs)) : [];
  if (!_projScopes.length) _projScopes.push({ id: Date.now(), name: '', note: '' });

  const old = document.getElementById('_projModal'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = '_projModal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,16,28,.55);display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto';
  const inp = 'width:100%;font-size:13px;padding:7px 9px;background:var(--surface,#181c27);color:var(--text,#e8eaf0);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:7px;font-family:var(--font,inherit)';
  ov.innerHTML = '<div style="background:var(--surface2,#1e2333);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:12px;width:640px;max-width:100%;box-shadow:0 18px 50px rgba(0,0,0,.55)">'
    + '<div style="padding:13px 18px;border-bottom:1px solid var(--border,rgba(255,255,255,.07));font-weight:600;color:var(--text);font-size:15px">🏗 ' + (rec ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่') + '</div>'
    + '<div style="padding:16px 18px">'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
    + '<div style="flex:2;min-width:220px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px">ชื่อโครงการ *</div><input id="_pjName" value="' + escHtml(rec?rec.projectName||'':'') + '" placeholder="เช่น สร้างบ้าน 2 ชั้น คุณสมชาย" style="' + inp + '"></div>'
    + '<div style="flex:1;min-width:150px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px">ลูกค้า</div><input id="_pjClient" value="' + escHtml(rec?rec.client||'':'') + '" placeholder="ชื่อลูกค้า" style="' + inp + '"></div>'
    + '</div>'
    + '<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px">วันที่ต้องการ</div><input id="_pjDate" type="date" value="' + (rec?rec.requiredDate||'':'') + '" style="' + inp + ';max-width:200px"></div>'
    + '<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px">รายละเอียดงาน (brief)</div><textarea id="_pjNote" rows="4" placeholder="อธิบายขอบเขตงาน ความต้องการ เงื่อนไข ฯลฯ" style="' + inp + ';resize:vertical;line-height:1.5">' + escHtml(rec?rec.note||'':'') + '</textarea></div>'
    + '<div style="margin-top:12px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">🧩 สายงาน (Scope) — คร่าวๆ ให้จัดซื้อหา Vendor แต่ละสายงาน</div><div id="_pjScopes"></div>'
    + '<button class="btn btn-sm" onclick="addProjectScopeRow()" style="font-size:11px;margin-top:4px;border:1px dashed var(--border2);background:none;color:var(--muted)">+ เพิ่มสายงาน</button></div>'
    + '<div style="margin-top:14px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">📎 ไฟล์แนบ (แบบแปลน/BOQ/รูป ฯลฯ)</div>'
    + '<div id="_pjDocs" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px"></div>'
    + '<button class="btn btn-sm" onclick="document.getElementById(\'_pjFile\').click()" style="font-size:11px">+ แนบไฟล์</button> <span id="_pjDocStatus" style="font-size:11px;color:var(--muted)"></span>'
    + '<input type="file" id="_pjFile" multiple style="display:none" onchange="uploadProjectDoc(this)"></div>'
    + '</div>'
    + '<div style="padding:13px 18px;border-top:1px solid var(--border,rgba(255,255,255,.07));display:flex;justify-content:flex-end;gap:8px">'
    + '<button class="btn btn-sm" onclick="(function(){var o=document.getElementById(\'_projModal\');if(o)o.remove();})()">ยกเลิก</button>'
    + '<button class="btn btn-sm btn-primary" onclick="saveProject()">💾 บันทึก & ส่งจัดซื้อ</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', function(e){ if (e.target === ov) ov.remove(); });
  renderProjScopes();
  renderProjDocs();
}

function renderProjScopes() {
  const box = document.getElementById('_pjScopes'); if (!box) return;
  const inp = 'font-size:12px;padding:5px 8px;background:var(--surface,#181c27);color:var(--text,#e8eaf0);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:6px;font-family:var(--font,inherit)';
  box.innerHTML = _projScopes.map(function(s, i) {
    return '<div style="display:flex;gap:6px;margin-bottom:5px;align-items:center">'
      + '<input value="' + escHtml(s.name||'') + '" oninput="updateProjScope(' + i + ',\'name\',this.value)" placeholder="สายงาน เช่น โครงสร้าง, ไฟฟ้า, ประปา" style="' + inp + ';flex:1;min-width:0">'
      + '<input value="' + escHtml(s.note||'') + '" oninput="updateProjScope(' + i + ',\'note\',this.value)" placeholder="หมายเหตุ (ไม่บังคับ)" style="' + inp + ';flex:1;min-width:0">'
      + '<button onclick="removeProjectScopeRow(' + i + ')" title="ลบ" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px">✕</button>'
      + '</div>';
  }).join('') || '<div style="font-size:11px;color:var(--muted)">— ยังไม่มีสายงาน —</div>';
}
function addProjectScopeRow() { _projScopes.push({ id: Date.now() + Math.floor(Math.random()*1000), name: '', note: '' }); renderProjScopes(); }
function removeProjectScopeRow(i) { _projScopes.splice(i, 1); renderProjScopes(); }
function updateProjScope(i, f, v) { if (_projScopes[i]) _projScopes[i][f] = v; }

function renderProjDocs() {
  const box = document.getElementById('_pjDocs'); if (!box) return;
  box.innerHTML = _projDocs.map(function(d, i) {
    const thumb = (typeof docThumb === 'function') ? docThumb(d.url, d.name, {small:true}) : ('<span style="font-size:11px;color:var(--muted)">📎 ' + escHtml(d.name) + '</span>');
    return '<span style="display:inline-flex;align-items:center;gap:4px">' + thumb + '<button onclick="removeProjectDoc(' + i + ')" title="ลบไฟล์" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px">✕</button></span>';
  }).join('');
}
function removeProjectDoc(i) { _projDocs.splice(i, 1); renderProjDocs(); }
async function uploadProjectDoc(input) {
  const files = Array.from(input.files || []); if (!files.length) return;
  const st = document.getElementById('_pjDocStatus');
  for (const f of files) {
    try {
      if (st) st.textContent = 'กำลังอัปโหลด ' + f.name + '…';
      const b64 = await fileToBase64(f);
      const base64Data = String(b64).split(',')[1] || '';
      const res = await _uploadFileGraph('ProjectDocs', 'PJ_' + Date.now() + '_' + f.name, f.type || 'application/octet-stream', base64Data);
      if (!res.fileUrl) throw new Error('เซิร์ฟเวอร์ไม่ส่ง URL');
      _projDocs.push({ id: Date.now(), name: f.name, url: res.fileUrl, ts: new Date().toISOString() });
      renderProjDocs();
    } catch(e) { toast('อัปโหลดไม่สำเร็จ: ' + e.message, 'error'); }
  }
  if (st) st.textContent = '';
  input.value = '';
}

async function saveProject() {
  const name = (document.getElementById('_pjName')?.value || '').trim();
  if (!name) { toast('กรุณาตั้งชื่อโครงการ', 'error'); return; }
  const scopes = _projScopes.filter(s => (s.name || '').trim());
  if (!procStore) await loadProcurements();
  const existing = _projEditingId ? (procStore || []).find(p => String(p.id) === String(_projEditingId)) : null;
  const rec = Object.assign({}, existing || {}, {
    id: _projEditingId || Date.now(),
    type: 'project',
    projectName: name,
    quoteTitle: name,                 // PurchasePro ใช้แสดงชื่องาน
    client: (document.getElementById('_pjClient')?.value || '').trim(),
    requiredDate: document.getElementById('_pjDate')?.value || '',
    note: document.getElementById('_pjNote')?.value || '',
    scopes: scopes,
    docs: _projDocs.map(d => ({ id: d.id, name: d.name, url: d.url, ts: d.ts })),
    items: (existing && Array.isArray(existing.items)) ? existing.items : [],
    quoteId: (existing && existing.quoteId) || null,
    vendorId: '', vendorName: '', total: (existing && existing.total) || 0,
    createdBy: (existing && existing.createdBy) || (currentUser?.displayName || currentUser?.email || ''),
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  try {
    const idx = (procStore || []).findIndex(p => String(p.id) === String(rec.id));
    if (idx >= 0) procStore[idx] = rec; else procStore.push(rec);
    await saveProcurementsStore();
    const o = document.getElementById('_projModal'); if (o) o.remove();
    _projEditingId = null;
    renderProjects();
    toast(existing ? 'บันทึกโครงการแล้ว' : 'สร้างโครงการแล้ว — ส่งให้ทีมจัดซื้อใน PurchasePro', 'success');
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

// ── เฟส 3: เพิ่มรายการจากโครงการเข้าใบเสนอราคา + ผูก quoteId ──
let _nqProjectId = null;   // โครงการที่ใบเสนอราคาปัจจุบันดึงรายการมา (ผูกตอน save)

async function openProjectItemPicker() {
  await _refreshProcStore();   // ดึงรายการล่าสุดจาก PurchasePro ก่อนเสมอ
  const ready = _projectsAll().filter(p => Array.isArray(p.items) && p.items.length && !p.quoteId);
  const old = document.getElementById('_projPick'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = '_projPick';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(10,16,28,.55);display:flex;align-items:flex-start;justify-content:center;padding:30px 16px;overflow:auto';
  let rowsHtml;
  if (!ready.length) {
    rowsHtml = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">ยังไม่มีโครงการที่จัดซื้อบันทึกรายการไว้<br><span style="font-size:11px">(จัดซื้อต้องกด “บันทึกเป็นรายการโครงการ” ใน PurchasePro ก่อน)</span></div>';
  } else {
    rowsHtml = ready.map(function(p) {
      const its = (p.items || []).filter(x => (x.name||'').trim());
      const preview = its.slice(0,4).map(x => escHtml(x.name)).join(', ') + (its.length>4 ? ' …' : '');
      const sum = its.reduce((s,x) => s + (+x.cost||0)*(+x.qty||0), 0);
      return '<div style="border:1px solid var(--border);border-radius:9px;background:var(--surface2);padding:11px 13px;margin-bottom:9px">'
        + '<div style="display:flex;align-items:flex-start;gap:10px">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:13px;font-weight:600;color:var(--text)">🏗 ' + escHtml(p.projectName||'(ไม่มีชื่อ)') + (p.client?(' <span style="font-size:11px;color:var(--muted)">· '+escHtml(p.client)+'</span>'):'') + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + its.length + ' รายการ · ทุนรวม ' + (typeof fmt==='function'?fmt(sum):sum) + '</div>'
        + '<div style="font-size:11px;color:var(--text);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + preview + '</div>'
        + '</div>'
        + '<button class="btn btn-sm btn-primary" onclick="addItemsFromProject(\'' + p.id + '\')" style="font-size:12px;white-space:nowrap">+ เพิ่มรายการ</button>'
        + '</div></div>';
    }).join('');
  }
  ov.innerHTML = '<div style="background:var(--surface2,#1e2333);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:12px;width:560px;max-width:100%;box-shadow:0 18px 50px rgba(0,0,0,.55)">'
    + '<div style="padding:13px 18px;border-bottom:1px solid var(--border,rgba(255,255,255,.07));font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px">🏗 เพิ่มรายการจากโครงการ<button style="margin-left:auto;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer" onclick="(function(){var o=document.getElementById(\'_projPick\');if(o)o.remove();})()">✕</button></div>'
    + '<div style="padding:16px 18px">' + rowsHtml + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', function(e){ if (e.target === ov) ov.remove(); });
}

function addItemsFromProject(pid) {
  const rec = _projectsAll().find(p => String(p.id) === String(pid));
  if (!rec) { toast('ไม่พบโครงการ', 'error'); return; }
  const its = (rec.items || []).filter(x => (x.name||'').trim());
  if (!its.length) { toast('โครงการนี้ยังไม่มีรายการ', 'error'); return; }
  if (typeof quoteItems === 'undefined') { toast('เปิดหน้าสร้างใบเสนอราคาก่อน', 'error'); return; }
  its.forEach(function(it) {
    const _d = (it.desc||'').trim();   // รายละเอียด (Serial/Warranty) จากช่อง Detail ของจัดซื้อเท่านั้น (ไม่เอา scope มาปน)
    quoteItems.push({ id: _nextItemId(), type:'item', no:'', pn: it.pn||'', name: it.name, desc: _d, qty: (+it.qty||1), unit: it.unit||'ชิ้น', price: '', disc: 0, cost: +it.cost||0, vendorId: it.vendorId||'' });
  });
  _nqProjectId = rec.id;   // ผูกตอน save ใบเสนอราคา
  if (typeof renderItems === 'function') renderItems();
  const o = document.getElementById('_projPick'); if (o) o.remove();
  toast('เพิ่ม ' + its.length + ' รายการจากโครงการ “' + (rec.projectName||'') + '” แล้ว', 'success');
}

// ผูกใบเสนอราคาเข้ากับโครงการ (เรียกจาก saveQuote หลังได้ quoteId)
async function linkQuoteToProject(projectId, quoteId) {
  try {
    if (typeof loadProcurements === 'function' && !procStore) await loadProcurements();
    const rec = (procStore || []).find(p => String(p.id) === String(projectId) && p.type === 'project');
    if (!rec) return;
    rec.quoteId = quoteId;
    rec.quoteSyncedVersion = rec.itemsVersion || 0;   // จำเวอร์ชันรายการที่ Sale ดึงไปแล้ว (ใช้ตรวจอัปเดต)
    rec.updatedAt = new Date().toISOString();
    await saveProcurementsStore();
  } catch(e) { console.warn('linkQuoteToProject', e.message); }
}

// ── เฟส C: แจ้งเตือน "โครงการมีอัปเดต" บนใบเสนอราคาที่ผูกไว้ + ปุ่มดึงล่าสุด ──
function _linkedProjectForQuote(qid) {
  return (procStore || []).find(p => p && p.type === 'project' && String(p.quoteId) === String(qid));
}
async function renderProjectUpdateBanner() {
  const box = document.getElementById('nq-project-update'); if (!box) return;
  box.style.display = 'none'; box.innerHTML = '';
  if (typeof editingQuoteId === 'undefined' || !editingQuoteId) return;
  try { await _refreshProcStore(); } catch(e) {}
  const rec = _linkedProjectForQuote(editingQuoteId);
  if (!rec) return;
  const hasUpdate = (rec.itemsVersion || 0) > (rec.quoteSyncedVersion || 0);
  if (!hasUpdate) return;
  box.style.display = '';
  box.innerHTML = '<div style="margin:8px 0;padding:10px 14px;border:1px solid var(--amber);background:rgba(245,158,11,0.1);border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    + '<span style="font-size:16px">🔔</span>'
    + '<div style="flex:1;min-width:180px;font-size:12px;color:var(--text)"><b>โครงการ “' + escHtml(rec.projectName||'') + '” มีการอัปเดต</b> — จัดซื้อแก้ไขรายละเอียด/ราคาทุน/รายการ หลังจากที่ใบนี้ดึงไปแล้ว</div>'
    + '<button class="btn btn-sm btn-primary" onclick="syncProjectUpdates(\'' + rec.id + '\')" style="font-size:12px;white-space:nowrap">🔄 ดึงรายการล่าสุดจากโครงการ</button>'
    + '<button class="btn btn-sm" onclick="dismissProjectUpdate(\'' + rec.id + '\')" style="font-size:12px;border:1px solid var(--border2);color:var(--muted)">ไม่ต้องตอนนี้</button>'
    + '</div>';
}
function dismissProjectUpdate() { const box = document.getElementById('nq-project-update'); if (box) { box.style.display='none'; box.innerHTML=''; } }

async function syncProjectUpdates(projectId) {
  await _refreshProcStore();
  const rec = (procStore || []).find(p => String(p.id) === String(projectId) && p.type === 'project');
  if (!rec) { toast('ไม่พบโครงการ', 'error'); return; }
  if (typeof quoteItems === 'undefined') { toast('เปิดใบเสนอราคาก่อน', 'error'); return; }
  const pItems = (rec.items || []).filter(x => (x.name||'').trim());
  let updated = 0, added = 0;
  pItems.forEach(function(it) {
    const key = (it.name||'').trim().toLowerCase();
    const _d = (it.desc||'').trim();   // รายละเอียดจริงจากจัดซื้อเท่านั้น
    const ex = quoteItems.find(q => q.type === 'item' && (q.name||'').trim().toLowerCase() === key);
    if (ex) {
      // อัปเดตเฉพาะรายละเอียด + ทุน (ไม่แตะ ราคาขาย/จำนวน ที่ Sale ปรับเอง)
      let ch = false;
      if (ex.desc !== _d) { ex.desc = _d; ch = true; }   // ยึดรายละเอียดจากโครงการเป็นหลัก (ล้างค่าเก่า เช่น [Hardware])
      if ((+it.cost||0) !== (+ex.cost||0)) { ex.cost = +it.cost||0; ch = true; }
      if (it.pn && ex.pn !== it.pn) { ex.pn = it.pn; ch = true; }
      if (ch) updated++;
    } else {
      quoteItems.push({ id: _nextItemId(), type:'item', no:'', pn: it.pn||'', name: it.name, desc: _d, qty: (+it.qty||1), unit: it.unit||'ชิ้น', price: '', disc: 0, cost: +it.cost||0, vendorId: it.vendorId||'' });
      added++;
    }
  });
  // บังคับวาดตารางรายการใหม่ทั้งหมด (รายการเดิมที่แก้ desc จะได้อัปเดตด้วย — renderItems จะ skip ถ้าชุด id ไม่เปลี่ยน)
  const _ib = document.getElementById('items-body'); if (_ib) _ib.innerHTML = '';
  if (typeof renderItems === 'function') renderItems();
  dismissProjectUpdate();
  // บันทึกใบเสนอราคาอัตโนมัติ (คงสถานะเดิม) — กันกรณีไม่ได้กดบันทึกเองแล้วข้อมูล/ป้ายหาย
  const _qid = editingQuoteId;
  if (_qid && typeof saveQuote === 'function') {
    const _q = (typeof quotesData !== 'undefined') ? quotesData.find(x => String(x.id) === String(_qid)) : null;
    const _st = (_q && _q.Status) || 'Draft';
    toast('ดึงล่าสุด — อัปเดต ' + updated + ' / เพิ่ม ' + added + ' รายการ · กำลังบันทึก...', 'info');
    try { await saveQuote(_st); } catch(e) { toast('บันทึกใบไม่สำเร็จ: ' + e.message, 'error'); }
  } else {
    toast('ดึงล่าสุดแล้ว — อัปเดต ' + updated + ' / เพิ่ม ' + added + ' รายการ (อย่าลืมกดบันทึก)', 'success');
  }
  // บันทึกเวอร์ชันที่ sync แล้ว หลังเซฟใบสำเร็จ (ถ้าเซฟล้มเหลวจะยังเห็นป้ายให้ลองใหม่)
  rec.quoteSyncedVersion = rec.itemsVersion || 0;
  try { await saveProcurementsStore(); } catch(e) {}
}

async function deleteProject(id) {
  const rec = _projectsAll().find(p => String(p.id) === String(id));
  if (rec && rec.quoteId) { toast('โครงการนี้เปิดใบเสนอราคาแล้ว — ลบไม่ได้', 'error'); return; }
  if (!confirm('ลบโครงการนี้? (ทีมจัดซื้อจะไม่เห็นงานนี้อีก)')) return;
  try {
    if (!procStore) await loadProcurements();
    const i = procStore.findIndex(p => String(p.id) === String(id));
    if (i >= 0) procStore.splice(i, 1);
    await saveProcurementsStore();
    renderProjects();
    toast('ลบโครงการแล้ว', 'success');
  } catch(e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error'); }
}
