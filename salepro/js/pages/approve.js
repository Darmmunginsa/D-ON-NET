// ============================================================
// APPROVE
// ============================================================
function renderApprove() {
  const pending = quotesData.filter(q => q.Status === 'Pending');
  document.getElementById('approve-list').innerHTML = pending.length ? pending.map(q => `
    <div class="card" style="margin-bottom:10px">
      <div style="padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-family:var(--mono);font-size:13px;font-weight:500">${q.Title||''}</span>
          <span style="color:var(--muted);font-size:13px;flex:1">${q.ClientName||''}</span>
          <span style="font-family:var(--mono);font-size:14px;font-weight:600;color:var(--accent2)">${fmt(q.TotalAmount||0)}</span>
          ${statusBadge(q.Status)}
        </div>
        <div class="timeline">
          <div class="tl-step"><div class="tl-dot done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><div class="tl-label">สร้าง</div></div>
          <div class="tl-step"><div class="tl-dot done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><div class="tl-label">ส่งรีวิว</div></div>
          <div class="tl-step"><div class="tl-dot active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="tl-label">รออนุมัติ</div></div>
          <div class="tl-step"><div class="tl-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div><div class="tl-label">อนุมัติ</div></div>
          <div class="tl-step"><div class="tl-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div><div class="tl-label">ส่งลูกค้า</div></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-sm" onclick="openApproveModal('${q.id}')">ดูรายละเอียด</button>
          <button class="btn btn-sm btn-danger" onclick="quickApprove('${q.id}','Rejected')">✕ ปฏิเสธ</button>
          <button class="btn btn-sm btn-success" onclick="quickApprove('${q.id}','Approved')">✓ อนุมัติ</button>
        </div>
      </div>
    </div>`).join('') : '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>ไม่มีรายการรออนุมัติ</div>';
}

function openApproveModal(id) {
  currentApproveId = id;
  const q = quotesData.find(x => x.id === id);
  if (!q) return;

  // Check if current user is the designated approver
  const myEmail = (currentUser?.email || '').toLowerCase();
  const approverEmail = (q.ApproverEmail || '').toLowerCase();
  const isApprover = approverEmail && myEmail && approverEmail === myEmail;
  const isPending = q.Status === 'Pending';

  document.getElementById('am-title').textContent = q.Title || '';
  document.getElementById('am-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label>ลูกค้า</label><input value="${escHtml(q.ClientName||'')}" readonly></div>
      <div class="form-group"><label>มูลค่า</label><input value="${fmt(q.TotalAmount||0)}" readonly></div>
      <div class="form-group"><label>วิธีชำระ</label><input value="${escHtml(q.PaymentMethod||'')}" readonly></div>
      <div class="form-group"><label>สถานะปัจจุบัน</label><div style="padding:7px 0">${statusBadge(q.Status)}</div></div>
      <div class="form-group"><label>ผู้อนุมัติที่กำหนด</label><input value="${escHtml(q.ApproverName||q.ApproverEmail||'(ไม่ได้ระบุ)')}" readonly></div>
      <div class="form-group"><label>ผู้ใช้ปัจจุบัน</label><input value="${escHtml(currentUser?.displayName||'')} (${escHtml(currentUser?.email||'')})" readonly></div>
    </div>
    ${isPending && !isApprover ? `
    <div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:var(--red);display:flex;align-items:center;gap:8px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      คุณไม่ใช่ผู้อนุมัติที่กำหนดไว้สำหรับใบนี้ — ต้องให้ <strong style="margin:0 4px">${escHtml(q.ApproverName||q.ApproverEmail||'')}</strong> เป็นผู้อนุมัติ
    </div>` : ''}
    ${isPending && isApprover ? `
    <div style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:var(--green);display:flex;align-items:center;gap:8px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      คุณเป็นผู้อนุมัติที่กำหนดไว้ — สามารถอนุมัติหรือปฏิเสธได้
    </div>` : ''}
    <div class="form-group"><label>หมายเหตุผู้อนุมัติ <span style="color:var(--red);font-weight:400">(กรณีปฏิเสธ ต้องระบุเหตุผล)</span></label><textarea id="approve-comment" placeholder="ระบุเหตุผล... (จำเป็นเมื่อปฏิเสธ)" style="min-height:80px"></textarea></div>`;

  // Store isApprover flag for doApprove to check
  document.getElementById('approve-modal').dataset.canApprove = (isApprover && isPending) ? '1' : '0';

  // Hide/show approve buttons based on permission
  const footer = document.querySelector('#approve-modal .modal-footer');
  if (footer) {
    const rejectBtn = footer.querySelector('.btn-danger');
    const approveBtn = footer.querySelector('.btn-success');
    if (rejectBtn) rejectBtn.style.display = (isApprover && isPending) ? '' : 'none';
    if (approveBtn) approveBtn.style.display = (isApprover && isPending) ? '' : 'none';
  }

  openModal('approve-modal');
}

async function doApprove(status) {
  if (!currentApproveId) return;
  // Double-check permission
  const canApprove = document.getElementById('approve-modal')?.dataset.canApprove === '1';
  if (!canApprove) { toast('คุณไม่มีสิทธิ์อนุมัติใบนี้', 'error'); return; }
  const comment = document.getElementById('approve-comment')?.value || '';
  if (status === 'Rejected' && !comment.trim()) {
    toast('กรุณาระบุเหตุผลการปฏิเสธก่อน', 'error');
    const el = document.getElementById('approve-comment');
    if (el) { el.style.borderColor = 'var(--red)'; el.focus(); }
    return;
  }
  try {
    toast('กำลังอัปเดต...', 'info');
    // Save approver email + name to quotation
    await updateListItem(CONFIG.lists.quotations, currentApproveId, {
      Status: status,
      ApproverEmail: currentUser?.email||'',
      ApproverName: currentUser?.displayName||''
    });
    try {
      await createListItem(CONFIG.lists.approvals, {
        Title: quotesData.find(q=>q.id===currentApproveId)?.Title||'',
        QuoteID: currentApproveId, ApproveStatus: status,
        Comment: comment, ApprovedDate: new Date().toISOString(),
        ApproverEmail: currentUser?.email||''
      });
    } catch(e2) { console.warn('Approvals log skipped:', e2.message); }
    // อัปเดต local cache แทน syncAll
    const qApp = quotesData.find(x => x.id === currentApproveId);
    if (qApp) qApp.Status = status;
    renderDash(); renderQuotes(); renderApprove(); renderPayment(); updateBadge();
    closeModal('approve-modal');
    toast(`${status==='Approved'?'✓ อนุมัติ':'✗ ปฏิเสธ'}เรียบร้อย`, 'success');
    // ส่ง Email แจ้ง Sale เมื่ออนุมัติ / แจ้ง Sale+Approver เมื่อปฏิเสธ
    const qNotif = quotesData.find(x => x.id === currentApproveId);
    if (qNotif) sendApprovalResultEmail(qNotif, status, comment).catch(e => console.warn('Result email failed:', e.message));
  } catch(e) { toast('ไม่สำเร็จ: ' + e.message, 'error'); }
}

async function quickApprove(id, status) {
  const q = quotesData.find(x => x.id === id);
  if (!q) return;
  const myEmail = (currentUser?.email || '').toLowerCase();
  const approverEmail = (q.ApproverEmail || '').toLowerCase();
  if (approverEmail && myEmail !== approverEmail) {
    toast(`เฉพาะ ${q.ApproverName||q.ApproverEmail} เท่านั้นที่อนุมัติได้`, 'error');
    return;
  }
  // ปฏิเสธต้องระบุเหตุผล — เปิด modal ให้กรอกก่อน (กดปฏิเสธในนั้นอีกครั้ง)
  if (status === 'Rejected') {
    openApproveModal(id);
    toast('กรุณาระบุเหตุผลการปฏิเสธ แล้วกด “ปฏิเสธ” อีกครั้ง', 'info');
    const el = document.getElementById('approve-comment');
    if (el) el.focus();
    return;
  }
  currentApproveId = id;
  // Set canApprove flag
  const modal = document.getElementById('approve-modal');
  if (modal) modal.dataset.canApprove = '1';
  await doApprove(status);
}

