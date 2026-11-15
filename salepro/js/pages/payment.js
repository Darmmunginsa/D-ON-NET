// ============================================================
// PAYMENT
// ============================================================
function renderPayment() {
  const payable = quotesData.filter(q => q.Status === 'PO Received');
  if(currentPaymentQuoteId&&quotesData.some(q=>q.id===currentPaymentQuoteId&&q.Status==='Cancelled')){
    closeModal('payment-modal');currentPaymentQuoteId=null;clearSlip(true);
  }
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
            ${typeof Billing!=='undefined' ? Billing.buttonHtml(q) : ''}
            ${rem > 0 ? `<button class="btn btn-sm btn-success" onclick="openPaymentModal('${q.id}')">+ บันทึกชำระ</button>` : '<span style="color:var(--green);font-size:12px">✓ ชำระครบแล้ว</span>'}
          </div>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty">ไม่มีข้อมูล</div>';
}

function openPaymentModal(id) {
  const q = quotesData.find(x => x.id === id);
  if(!q||q.Status==='Cancelled'){toast('ใบเสนอราคานี้ถูกยกเลิกแล้ว ไม่สามารถบันทึกชำระเงินได้','error');return;}
  currentPaymentQuoteId = id;
  document.getElementById('pay-title').textContent = `ชำระเงิน — ${q?.Title||''}`;
  document.getElementById('pay-amount').value = '';
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('pay-ref').value = '';
  document.getElementById('pay-note').value = '';
  clearSlip(true);
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

function clearSlip(resetCertificate = false) {
  slipFile = null;
  document.getElementById('slip-file').value = '';
  const certificateInput = document.getElementById('pay-wht-file');
  if (resetCertificate && certificateInput) certificateInput.value = '';
  const label = document.getElementById('slip-label');
  const preview = document.getElementById('slip-preview');
  const dropZone = document.getElementById('slip-drop-zone');
  if (label) label.textContent = 'คลิกหรือลากไฟล์มาวางที่นี่';
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  if (dropZone) dropZone.style.borderColor = 'var(--border2)';
}

async function uploadPaymentAttachments(paymentRef, slip, certificate) {
  const attachments = [
    { file: slip, field: 'SlipURL', prefix: 'SLIP', label: 'หลักฐานการชำระ' },
    { file: certificate, field: 'WHTCertificateURL', prefix: 'WHT', label: 'หนังสือรับรองหัก ณ ที่จ่าย' },
  ];
  const fields = { SlipURL: '', WHTCertificateURL: '' };
  for (const attachment of attachments) {
    const { file, label } = attachment;
    if (!file) continue;
    if (file.size > 5 * 1024 * 1024) throw new Error(label + 'ต้องมีขนาดไม่เกิน 5 MB');
    if (!file.type?.startsWith('image/') && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      throw new Error(label + 'ต้องเป็นรูปภาพหรือ PDF');
    }
  }
  for (const { file, field, prefix, label } of attachments) {
    if (!file) continue;
    toast('กำลังอัปโหลด ' + label + '...', 'info');
    try {
      const fileName = prefix + '_' + paymentRef + '_' + file.name;
      const mimeType = /\.pdf$/i.test(file.name) ? 'application/pdf' : file.type;
      const base64Data = (await fileToBase64(file)).split(',')[1];
      const res = field === 'WHTCertificateURL'
        ? await _call({ action: 'uploadFile', folder: 'PaymentCertificates', fileName, mimeType, base64: base64Data, privateFile: true })
        : await apiPost('uploadFile', 'Payments', null, { fileName, mimeType, base64Data });
      if (!res?.fileUrl) throw new Error(res?.error || 'ระบบไม่ได้ส่งลิงก์ไฟล์กลับมา');
      fields[field] = res.fileUrl;
    } catch (error) {
      throw new Error('อัปโหลด ' + label + ' ไม่สำเร็จ: ' + error.message);
    }
  }
  return fields;
}

async function savePayment() {
  const amt = +document.getElementById('pay-amount').value;
  if (!amt || amt <= 0) { toast('กรุณาระบุจำนวนเงิน', 'error'); return; }
  const q = quotesData.find(x => x.id === currentPaymentQuoteId);
  if (!q) return;
  if(q.Status==='Cancelled'){toast('ใบเสนอราคานี้ถูกยกเลิกแล้ว ไม่สามารถบันทึกชำระเงินได้','error');return;}
  const submit = document.getElementById('pay-submit-btn');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  try {
    toast('กำลังบันทึก...', 'info');
    const payRef = 'PAY-' + Date.now();
    const newPaid = Math.min((q.PaidAmount||0) + amt, q.TotalAmount||0);

    const fields = {
      Title: payRef,
      QuoteID: q.id,
      AmountPaid: amt,
      PaymentDate: document.getElementById('pay-date').value,
      PaymentMethod: document.getElementById('pay-method').value,
      Reference: document.getElementById('pay-ref').value,
      Note: document.getElementById('pay-note').value,
    };
    Object.assign(fields, await uploadPaymentAttachments(payRef, slipFile, document.getElementById('pay-wht-file')?.files?.[0]));
    const saved = await createListItem(CONFIG.lists.payments, fields);
    // RecordedBy is Person column - skip to avoid errors
    const isFullyPaid = newPaid >= (q.TotalAmount||0) && (q.TotalAmount||0) > 0;
    const updateFields = isFullyPaid ? { PaidAmount: newPaid, Status: 'Closed' } : { PaidAmount: newPaid };
    await updateListItem(CONFIG.lists.quotations, q.id, updateFields);
    // อัปเดต local cache แทน syncAll
    const qPay = quotesData.find(x => x.id === q.id);
    if (qPay) { qPay.PaidAmount = newPaid; if (isFullyPaid) qPay.Status = 'Closed'; }
    if (paymentsCache) paymentsCache.push({ ...fields, ...saved });
    if (isFullyPaid && qPay) sendPaymentCompleteEmail(qPay, newPaid).catch(function(e) { console.warn('Payment email failed:', e.message); });
    renderDash(); renderQuotes(); renderPayment(); updateBadge();
    clearSlip(true);
    closeModal('payment-modal');
    toast(`บันทึกการชำระสำเร็จ${isFullyPaid?' — ชำระครบแล้ว ✓ Closed':''}${fields.SlipURL?' (พร้อมสลิป)':''}`, 'success');
  } catch(e) { toast('ไม่สำเร็จ: ' + e.message, 'error'); }
  finally { if (submit) submit.disabled = false; }
}

