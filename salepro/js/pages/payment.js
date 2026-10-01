// ============================================================
// PAYMENT
// ============================================================
function renderPayment() {
  const payable = quotesData.filter(q => q.Status === 'PO Received');
  document.getElementById('payment-list').innerHTML = payable.map(q => {
    const pct = Math.min(100, Math.round(((q.PaidAmount||0)/(q.TotalAmount||1))*100));
    const rem = (q.TotalAmount||0) - (q.PaidAmount||0);
    return `<div class="card" style="margin-bottom:10px">
      <div style="padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-family:var(--mono);font-size:13px;font-weight:500">${q.Title||''}</span>
          <span style="color:var(--muted);font-size:13px;flex:1">${q.ClientName||''} · ${q.PaymentMethod||''}</span>
          ${payBadge(q)}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${pct===100?'var(--green)':pct>0?'var(--amber)':'var(--red)'}"></div></div>
        <div style="display:flex;gap:20px;font-size:12px;color:var(--muted);margin-top:6px;align-items:center">
          <span>รวม: <span style="color:var(--text);font-family:var(--mono)">${fmt(q.TotalAmount||0)}</span></span>
          <span>ชำระแล้ว: <span style="color:var(--green);font-family:var(--mono)">${fmt(q.PaidAmount||0)}</span></span>
          <span>คงเหลือ: <span style="color:${rem>0?'var(--red)':'var(--green)'};font-family:var(--mono)">${fmt(rem)}</span></span>
          <div style="margin-left:auto">
            ${rem > 0 ? `<button class="btn btn-sm btn-success" onclick="openPaymentModal('${q.id}')">+ บันทึกชำระ</button>` : '<span style="color:var(--green);font-size:12px">✓ ชำระครบแล้ว</span>'}
          </div>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty">ไม่มีข้อมูล</div>';
}

function openPaymentModal(id) {
  currentPaymentQuoteId = id;
  const q = quotesData.find(x => x.id === id);
  document.getElementById('pay-title').textContent = `ชำระเงิน — ${q?.Title||''}`;
  document.getElementById('pay-amount').value = '';
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('pay-ref').value = '';
  document.getElementById('pay-note').value = '';
  clearSlip();
  openModal('payment-modal');
}

// ============================================================
// SLIP UPLOAD
// ============================================================
let slipFile = null;

function handleSlipSelect(input) {
  if (input.files && input.files[0]) {
    setSlipFile(input.files[0]);
  }
}

function handleSlipDrop(event) {
  event.preventDefault();
  document.getElementById('slip-drop-zone').style.borderColor = 'var(--border2)';
  const file = event.dataTransfer.files[0];
  if (file) setSlipFile(file);
}

function setSlipFile(file) {
  if (file.size > 5 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 5MB', 'error'); return; }
  slipFile = file;
  const label = document.getElementById('slip-label');
  const preview = document.getElementById('slip-preview');
  const dropZone = document.getElementById('slip-drop-zone');
  if (label) label.textContent = '✓ ' + file.name;
  if (dropZone) dropZone.style.borderColor = 'var(--green)';
  // Show preview for images
  if (file.type.startsWith('image/') && preview) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.style.display = 'block';
      preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:180px;border-radius:8px;border:1px solid var(--border)">
        <button class="btn btn-sm btn-danger" style="margin-top:6px" onclick="clearSlip()">ลบสลิป</button>`;
    };
    reader.readAsDataURL(file);
  } else if (preview) {
    preview.style.display = 'block';
    preview.innerHTML = `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:8px;font-size:13px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      ${file.name}
      <button class="btn btn-sm btn-danger" style="margin-left:auto" onclick="clearSlip()">ลบ</button>
    </div>`;
  }
}

function clearSlip() {
  slipFile = null;
  document.getElementById('slip-file').value = '';
  const label = document.getElementById('slip-label');
  const preview = document.getElementById('slip-preview');
  const dropZone = document.getElementById('slip-drop-zone');
  if (label) label.textContent = 'คลิกหรือลากไฟล์มาวางที่นี่';
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  if (dropZone) dropZone.style.borderColor = 'var(--border2)';
}

async function uploadSlipToSharePoint(file, paymentRef) {
  const b64 = await fileToBase64(file);
  const res = await apiPost('uploadFile', 'Payments', null, {
    fileName: 'SLIP_' + paymentRef + '_' + file.name,
    mimeType: file.type || 'image/jpeg',
    base64Data: b64,
  });
  return res.fileUrl || '';
}

async function savePayment() {
  const amt = +document.getElementById('pay-amount').value;
  if (!amt || amt <= 0) { toast('กรุณาระบุจำนวนเงิน', 'error'); return; }
  const q = quotesData.find(x => x.id === currentPaymentQuoteId);
  if (!q) return;
  try {
    toast('กำลังบันทึก...', 'info');
    const payRef = 'PAY-' + Date.now();
    const newPaid = Math.min((q.PaidAmount||0) + amt, q.TotalAmount||0);

    // Upload slip if attached
    let slipUrl = '';
    if (slipFile) {
      try {
        toast('กำลังอัปโหลดสลิป...', 'info');
        const slipReader2 = new FileReader();
        const slipB64_2 = await new Promise((res,rej)=>{slipReader2.onload=e=>res(e.target.result.split(',')[1]);slipReader2.onerror=rej;slipReader2.readAsDataURL(slipFile);});
        const slipRes2 = await apiPost('uploadFile','Payments',null,{fileName:'SLIP_'+payRef+'_'+slipFile.name,mimeType:slipFile.type||'image/jpeg',base64Data:slipB64_2});
        slipUrl = slipRes2.fileUrl || '';
      } catch(e2) {
        toast('อัปโหลดสลิปไม่สำเร็จ: ' + e2.message, 'error');
      }
    }

    await createListItem(CONFIG.lists.payments, {
      Title: payRef,
      QuoteID: currentPaymentQuoteId,
      AmountPaid: amt,
      PaymentDate: document.getElementById('pay-date').value,
      PaymentMethod: document.getElementById('pay-method').value,
      Reference: document.getElementById('pay-ref').value,
      Note: document.getElementById('pay-note').value,
      SlipURL: slipUrl
    });
    // RecordedBy is Person column - skip to avoid errors
    const isFullyPaid = newPaid >= (q.TotalAmount||0) && (q.TotalAmount||0) > 0;
    const updateFields = isFullyPaid ? { PaidAmount: newPaid, Status: 'Closed' } : { PaidAmount: newPaid };
    await updateListItem(CONFIG.lists.quotations, currentPaymentQuoteId, updateFields);
    // อัปเดต local cache แทน syncAll
    const qPay = quotesData.find(x => x.id === currentPaymentQuoteId);
    if (qPay) { qPay.PaidAmount = newPaid; if (isFullyPaid) qPay.Status = 'Closed'; }
    if (paymentsCache) paymentsCache.push({QuoteID:currentPaymentQuoteId,AmountPaid:amt,PaymentDate:document.getElementById('pay-date').value,PaymentMethod:document.getElementById('pay-method').value,Reference:document.getElementById('pay-ref').value,Note:document.getElementById('pay-note').value,SlipURL:slipUrl,Title:payRef});
    if (isFullyPaid && qPay) sendPaymentCompleteEmail(qPay, newPaid).catch(function(e) { console.warn('Payment email failed:', e.message); });
    renderDash(); renderQuotes(); renderPayment(); updateBadge();
    clearSlip();
    closeModal('payment-modal');
    toast(`บันทึกการชำระสำเร็จ${isFullyPaid?' — ชำระครบแล้ว ✓ Closed':''}${slipUrl?' (พร้อมสลิป)':''}`, 'success');
  } catch(e) { toast('ไม่สำเร็จ: ' + e.message, 'error'); }
}

