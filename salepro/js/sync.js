// ============================================================
// SYNC
// ============================================================

// เขียนค่าลง Settings/ProcurementData ให้ถูกลิสต์ (key จัดซื้อ → ProcurementData) + ย้ายค่าเก่าอัตโนมัติ
const _PROC_SETTING_KEYS = ['Procurements','Vendors','CatalogExtra','MailTemplates','POCounter','RemindSent'];
function _listForSettingKey(key) {
  if (_PROC_SETTING_KEYS.includes(key) || /^(Purchase_|PurchaseStatus_|PurchaseBaskets_|PurchaseBasketMap_)/.test(key)) return CONFIG.lists.procurement;
  return CONFIG.lists.settings;
}
async function saveSettingItem(key, value) {
  const L = _listForSettingKey(key);
  const items = _settingsCache || [];
  const ex = items.find(i => i.Title === key);
  if (ex && ex._srcList === L) { await updateListItem(L, ex.id, { Value: value }); ex.Value = value; }
  else if (ex) { const c = await createListItem(L, { Title: key, Value: value }); ex.id = c.id; ex.Value = value; ex._srcList = L; }  // ย้ายจากลิสต์เดิม
  else { const c = await createListItem(L, { Title: key, Value: value }); if (_settingsCache) _settingsCache.push({ id: c.id, Title: key, Value: value, _srcList: L }); }
}

function filterQuotesForUser(allQuotes) {
  if (!currentUser) return [];
  // Admin and Approver see all quotes
  if (userRoles.isAdmin || userRoles.isApprover) return allQuotes;
  // Sales see only their own quotes
  const myEmail = (currentUser.email||'').toLowerCase();
  return allQuotes.filter(q => {
    const saleEmail = (q.SaleEmail||'').toLowerCase();
    // Match by sale email, or show if no sale email assigned (own quotes)
    return saleEmail === myEmail || saleEmail === '';
  });
}

async function syncAll() {
  toast('กำลังซิงค์ข้อมูล...', 'info');
  try {
    // โหลดทีละตัว (sequential) — ลดโอกาส CORS/redirect ของ Apps Script หลุดตอนยิงพร้อมกัน
    const catData     = await getListItems(CONFIG.lists.catalog);
    const allQuotes   = await getListItems(CONFIG.lists.quotations);
    const settingsData= await getListItems(CONFIG.lists.settings);
    const procData    = await getListItems(CONFIG.lists.procurement).catch(()=>[]);   // ข้อมูลจัดซื้อ (ลิสต์แยก)
    const companyData = await getListItems(CONFIG.lists.company);
    catalogData = catData;
    // รวม Settings (ฝั่งขาย) + ProcurementData (ฝั่งจัดซื้อ) เป็น cache เดียว โดยลิสต์จัดซื้อ "ชนะ" ถ้า Title ซ้ำ
    _settingsCache = (settingsData||[]).map(i=>({...i,_srcList:CONFIG.lists.settings}));
    (procData||[]).forEach(p=>{ const pi={...p,_srcList:CONFIG.lists.procurement}; const idx=_settingsCache.findIndex(x=>x.Title===p.Title); if(idx>=0) _settingsCache[idx]=pi; else _settingsCache.push(pi); });
    // ขนาดฟอนต์หัวบริษัท (เก็บใน Settings list แบบ key/value)
    const _hfsItem = settingsData.find(i => i.Title === 'CompanyHeaderFontSize');
    const _headerFs = _hfsItem ? (+_hfsItem.Value || 10) : 10;
    // ใช้ companyData ที่โหลดมาแล้วโดยตรง
    if (companyData && companyData.length > 0) {
      const s = companyData[0];
      companySettings = { CompanyName: s.CompanyName||'', TaxID: s.TaxID||'', Phone: s.Phone||'',
        Email: s.Email||'', Address: s.Address||'', PrimaryColor: s.PrimaryColor||'',
        FooterText: s.FooterText||'', LogoURL: s.LogoURL||'', SignatureURL: s.SignatureURL||'',
        LogoBase64: (s.LogoURL||'').startsWith('data:') ? s.LogoURL : '',
        SignatureBase64: (s.SignatureURL||'').startsWith('data:') ? s.SignatureURL : '',
        HeaderFontSize: _headerFs };
      if (s.PrimaryColor) { document.documentElement.style.setProperty('--accent', s.PrimaryColor); }
    } else {
      companySettings.HeaderFontSize = _headerFs;
    }
    if (typeof loadCompanyExtra === 'function') loadCompanyExtra();   // ชื่อ/ที่อยู่ EN + Fax หัวเอกสาร
    await loadApprovalTiers(); // ใช้ _settingsCache ที่เซ็ตไว้แล้ว
    // cache payments ไว้ใน memory
    paymentsCache = null; // invalidate cache เพื่อโหลดใหม่เมื่อจำเป็น
    // Filter quotes based on user role
    quotesData = filterQuotesForUser(allQuotes);
    // overlay DealStatus จาก Settings list (ถ้ามี) — ที่เก็บใหม่ ไม่อยู่บน quotation item แล้ว
    quotesData.forEach(qq => { const v = getStoredDealStatus(qq.id); if (v) qq.DealStatus = v; });
    // overlay Tag / ชื่อ Project จาก Settings list (เก็บแยก ไม่อยู่บน quotation item)
    quotesData.forEach(qq => { const t = (typeof getQuoteTag === 'function') ? getQuoteTag(qq.id) : ''; if (t) qq.Tag = t; });
    try { await loadCatalogExtra(); } catch(e) {}   // ข้อมูลเสริมสินค้า (ต้นทุน/Vendor)
    renderDash();
    renderQuotes();
    renderCatalog();
    renderApprove();
    renderPayment();
    updateBadge();
    toast('Sync สำเร็จ', 'success');
    // ตรวจการติดตามที่ถึงกำหนด (ต่อสัญญา ฯลฯ) → ส่งเมลแจ้งผู้เกี่ยวข้อง
    checkFollowUpsDue().catch(e => console.warn('followup check:', e.message));
    if (typeof checkContractsDue === 'function') checkContractsDue().catch(e => console.warn('contract check:', e.message));
  } catch(e) {
    toast('Sync ไม่สำเร็จ: ' + e.message, 'error');
  }
}

