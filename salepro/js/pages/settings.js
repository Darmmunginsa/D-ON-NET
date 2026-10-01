// ============================================================
// PDF
// ============================================================
// ============================================================
// APPROVAL TIERS
// ============================================================
const DEFAULT_TIERS = [
  {id:1, name:'Manager', minAmt:0, maxAmt:99999, approverName:'Manager', approverEmail:'manager@itservices.co.th'},
  {id:2, name:'Director', minAmt:100000, maxAmt:499999, approverName:'Director', approverEmail:'director@itservices.co.th'},
  {id:3, name:'MD', minAmt:500000, maxAmt:999999999, approverName:'Managing Director', approverEmail:'md@itservices.co.th'}
];
let approvalTiers = [...DEFAULT_TIERS];
let settingsItemId = null;

async function loadApprovalTiers() {
  try {
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    const item = items.find(i => i.Title === 'ApprovalTiers');
    if (item && item.Value) { approvalTiers = JSON.parse(item.Value); settingsItemId = item.id; }
  } catch(e) { approvalTiers = [...DEFAULT_TIERS]; }
}

async function saveApprovalTiersToSharePoint() {
  try {
    const value = JSON.stringify(approvalTiers);
    if (settingsItemId) { await updateListItem(CONFIG.lists.settings, settingsItemId, { Value: value }); }
    else { const c = await createListItem(CONFIG.lists.settings, { Title: 'ApprovalTiers', Value: value }); settingsItemId = c.id; }
    toast('บันทึก Settings สำเร็จ', 'success');
  } catch(e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

async function saveApprovalTiers() { await saveApprovalTiersToSharePoint(); updateApproverBox(); }

function getApproverForAmount(amount) {
  const tier = approvalTiers.filter(t => amount >= t.minAmt && amount <= t.maxAmt).sort((a,b) => b.minAmt - a.minAmt)[0];
  return tier || approvalTiers[0];
}

function renderTiers() {
  const tbody = document.getElementById('tiers-body');
  if (!tbody) return;
  tbody.innerHTML = approvalTiers.map((t,i) => `
    <tr>
      <td style="color:var(--muted);font-size:12px;text-align:center">${i+1}</td>
      <td><input value="${t.name}" oninput="updateTier(${t.id},'name',this.value)" style="background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);width:100%;font-family:var(--font)"></td>
      <td><input type="number" value="${t.minAmt}" oninput="updateTier(${t.id},'minAmt',+this.value)" style="background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);width:100%;font-family:var(--font);text-align:right"></td>
      <td><input type="number" value="${t.maxAmt===999999999?'':t.maxAmt}" placeholder="ไม่จำกัด" oninput="updateTier(${t.id},'maxAmt',this.value?+this.value:999999999)" style="background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);width:100%;font-family:var(--font);text-align:right"></td>
      <td><input value="${t.approverName}" oninput="updateTier(${t.id},'approverName',this.value)" style="background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);width:100%;font-family:var(--font)"></td>
      <td><input value="${t.approverEmail}" oninput="updateTier(${t.id},'approverEmail',this.value)" style="background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);width:100%;font-family:var(--font)"></td>
      <td><button class="action-btn" onclick="removeTier(${t.id})" style="color:var(--red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></td>
    </tr>`).join('');
}

function updateTier(id, field, val) { const t = approvalTiers.find(x => x.id === id); if (t) t[field] = val; }
function addApprovalTier() { const maxId = Math.max(...approvalTiers.map(t => t.id), 0); approvalTiers.push({id:maxId+1,name:'ระดับใหม่',minAmt:0,maxAmt:999999999,approverName:'',approverEmail:''}); renderTiers(); }
function removeTier(id) { if (approvalTiers.length<=1){toast('ต้องมีอย่างน้อย 1 ระดับ','error');return;} approvalTiers=approvalTiers.filter(t=>t.id!==id); renderTiers(); }

function updateApproverBox() {
  const box = document.getElementById('approver-box');
  if (!box) return;
  const t = calcTotals();
  const approver = getApproverForAmount(t.grand);
  box.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;flex-shrink:0">${(approver.approverName||'?')[0]}</div>
    <div><div style="font-size:12px;font-weight:500;color:var(--text)">${approver.approverName||'(ยังไม่ได้ตั้งค่า)'}</div>
    <div style="font-size:11px;color:var(--muted)">${approver.approverEmail||''} · ${approver.name}</div></div>
    <div style="margin-left:auto;font-size:11px;color:var(--muted)">วงเงิน ${fmt(approver.minAmt)}${approver.maxAmt===999999999?'+':' – '+fmt(approver.maxAmt)}</div>
  </div>`;
}

