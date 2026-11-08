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

function approvalEmail(value){return String(value||'').trim().toLowerCase();}
function canApproveQuotation(q){const email=approvalEmail(currentUser?.email);return !!email&&q?.Status==='Pending'&&!!approvalEmail(q.ApproverEmail)&&approvalEmail(q.ApproverEmail)===email;}
function pendingApprovalsForUser(){return quotesData.filter(q=>q.Status==='Pending'&&(userRoles.isAdmin||canApproveQuotation(q)));}
function filterQuotesForUser(allQuotes, freshSettings) {
  allQuotes=allQuotes.filter(q=>!(q.Status==='Draft'&&(q.DraftArchived===true||q.DraftArchived==='true')));
  if (!currentUser) return [];
  // Admin and Approver see all quotes
  if (userRoles.isAdmin || userRoles.isApprover) return allQuotes;
  // Sales see only their own quotes
  const myEmail = approvalEmail(currentUser.email);
  return allQuotes.filter(q => {
    const saleEmail = approvalEmail(q.SaleEmail);
    // Match by sale email, or show if no sale email assigned (own quotes)
    const shared = Array.isArray(freshSettings) ? freshSettings.some(s => s.Title === 'QuoteShared_' + q.id && s.Value === '1') : (typeof _isQuoteShared==='function' && _isQuoteShared(q.id));
    return saleEmail === myEmail || saleEmail === '' || (!!approvalEmail(q.ApproverEmail)&&approvalEmail(q.ApproverEmail)===myEmail) || shared;
  });
}

let _syncTask=null,_syncActor='',_startupFreshEmail='';
const syncEmail=()=>String(currentUser?.email||'').trim().toLowerCase();
function resetStartupData(){_startupFreshEmail='';}
async function ensureStartupData(){const email=syncEmail();if(!email)throw Error('กรุณาเข้าสู่ระบบก่อน');if(_startupFreshEmail===email&&!_syncTask)return;if(!await syncAll()||_startupFreshEmail!==email)throw Error('ยังตรวจข้อมูลล่าสุดไม่สำเร็จ เก็บ Draft ได้ แต่กรุณาซิงก์ก่อนส่งอนุมัติ');}
async function syncAll(){
  const email=syncEmail();if(!email)return false;
  if(_syncTask){const actor=_syncActor,result=await _syncTask;return actor===email?result:syncAll();}
  _syncActor=email;_syncTask=syncAllLatest(email).finally(()=>{_syncTask=null;});return _syncTask;
}
async function syncAllLatest(expectedEmail) {
  _startupFreshEmail='';
  toast('กำลังซิงค์ข้อมูล...', 'info');
  try {
    await BasketPersistence.idle();
    // โหลดทุกแท็บใน "ครั้งเดียว" (multiList) — ลด round-trip บน Apps Script ให้เร็วขึ้นมาก
    let catData, allQuotes, settingsData, procData, companyData, customerData;
    if (typeof getListItemsMulti === 'function') {
      const L = CONFIG.lists;
      const names=[L.catalog,L.quotations,L.settings,L.procurement,L.company];if(L.customers)names.push(L.customers);
      const m = await getListItemsMulti(names,{strict:true});
      if(names.some(name=>!Array.isArray(m[name])))throw Error('ข้อมูลเริ่มต้นจากเซิร์ฟเวอร์ไม่ครบ');
      if(L.customers)customerData=m[L.customers];
      catData = m[L.catalog] || []; allQuotes = m[L.quotations] || []; settingsData = m[L.settings] || [];
      procData = m[L.procurement] || []; companyData = m[L.company] || [];
    } else {
      // fallback: โหลดทีละตัว
      catData     = await getListItems(CONFIG.lists.catalog);
      allQuotes   = await getListItems(CONFIG.lists.quotations);
      settingsData= await getListItems(CONFIG.lists.settings);
      procData    = await getListItems(CONFIG.lists.procurement).catch(()=>[]);
      companyData = await getListItems(CONFIG.lists.company);
      if(CONFIG.lists.customers)customerData=await getListItems(CONFIG.lists.customers);
    }
    if(syncEmail()!==expectedEmail)return false;
    catalogData = catData;
    // รวม Settings (ฝั่งขาย) + ProcurementData (ฝั่งจัดซื้อ) เป็น cache เดียว โดยลิสต์จัดซื้อ "ชนะ" ถ้า Title ซ้ำ
    _settingsCache = [...new Map((settingsData||[]).map(i=>[i.Title,{...i,_srcList:CONFIG.lists.settings}])).values()];
    (procData||[]).forEach(p=>{ const pi={...p,_srcList:CONFIG.lists.procurement}; const idx=_settingsCache.findIndex(x=>x.Title===p.Title); if(idx>=0){if(_listForSettingKey(p.Title)===CONFIG.lists.procurement)_settingsCache[idx]=pi;}else _settingsCache.push(pi); });
    // ขนาดฟอนต์หัวบริษัท (เก็บใน Settings list แบบ key/value)
    const _hfsItem = settingsData.find(i => i.Title === 'CompanyHeaderFontSize');
    const _headerFs = _hfsItem ? (+_hfsItem.Value || 10) : 10;
    // ใช้ companyData ที่โหลดมาแล้วโดยตรง
    if (companyData && companyData.length > 0) {
      const s = companyData[0];if(typeof companySettingsId!=='undefined')companySettingsId=s.id||null;
      companySettings = { CompanyName: s.CompanyName||'', TaxID: s.TaxID||'', Phone: s.Phone||'',
        Email: s.Email||'', Address: s.Address||'', PrimaryColor: s.PrimaryColor||'',
        FooterText: s.FooterText||'', LogoURL: s.LogoURL||'', SignatureURL: s.SignatureURL||'',
        LogoBase64: (s.LogoURL||'').startsWith('data:') ? s.LogoURL : '',
        SignatureBase64: (s.SignatureURL||'').startsWith('data:') ? s.SignatureURL : '',
        HeaderFontSize: _headerFs };
      if (s.PrimaryColor) { document.documentElement.style.setProperty('--accent', s.PrimaryColor); }
    } else {
      companySettings=typeof COMPANY_DEFAULTS!=='undefined'?JSON.parse(JSON.stringify(COMPANY_DEFAULTS)):{};companySettings.HeaderFontSize=_headerFs;if(typeof companySettingsId!=='undefined')companySettingsId=null;
    }
    if (typeof loadCompanyExtra === 'function') loadCompanyExtra();   // ชื่อ/ที่อยู่ EN + Fax หัวเอกสาร
    await loadApprovalTiers(); // ใช้ _settingsCache ที่เซ็ตไว้แล้ว
    if (typeof loadApprovalPolicy === 'function') loadApprovalPolicy();   // เงื่อนไข Margin + Sale อนุมัติเอง
    await loadUserRoles(); // Re-evaluate using the freshly loaded settings/tiers before filtering quotes.
    if(syncEmail()!==expectedEmail)return false;
    await Promise.allSettled([typeof loadTheme==='function'?loadTheme(settingsData):Promise.resolve(),typeof loadSaleProfile==='function'?loadSaleProfile():Promise.resolve(),typeof loadCustomers==='function'&&Array.isArray(customerData)?loadCustomers(customerData):Promise.resolve()]);
    if(syncEmail()!==expectedEmail)return false;
    // cache payments ไว้ใน memory
    paymentsCache = null; // invalidate cache เพื่อโหลดใหม่เมื่อจำเป็น
    // Filter quotes based on user role
    quotesData = filterQuotesForUser(allQuotes);
    // overlay DealStatus จาก Settings list (ถ้ามี) — ที่เก็บใหม่ ไม่อยู่บน quotation item แล้ว
    quotesData.forEach(qq => { const v = getStoredDealStatus(qq.id); if (v) qq.DealStatus = v; });
    // overlay Tag / ชื่อ Project จาก Settings list (เก็บแยก ไม่อยู่บน quotation item)
    quotesData.forEach(qq => { const t = (typeof getQuoteTag === 'function') ? getQuoteTag(qq.id) : ''; if (t) qq.Tag = t; });
    catalogExtraLoaded=false;
    try { await loadCatalogExtra(); if(typeof LocalFirst!=='undefined')await LocalFirst.remember('CatalogExtra',[catalogExtra]); } catch(e) {}   // ข้อมูลเสริมสินค้า (ต้นทุน/Vendor)
    const basketKeys=[_bkKey('QuoteBaskets'),_bkKey('QuoteBasketMap')];
    loadBaskets(); // Reload after settings arrive, even if first render created empty arrays.
    renderDash();
    renderQuotes();
    renderCatalog();
    renderApprove();
    renderPayment();
    if(typeof Billing!=='undefined')Billing.render();
    updateBadge();
    if(typeof LocalFirst!=='undefined'&&typeof LocalFirst.captureAppearance==='function')await LocalFirst.captureAppearance(expectedEmail);
    if(syncEmail()!==expectedEmail)return false;_startupFreshEmail=expectedEmail;
    toast('Sync สำเร็จ', 'success');
    BasketPersistence.retry(basketKeys,async(key,value)=>{if(syncEmail()!==expectedEmail)throw Error('บัญชีเปลี่ยน');return saveSettingItem(key,value);}).catch(e=>console.warn('basket retry:',e.message));
    // ตรวจการติดตามที่ถึงกำหนด (ต่อสัญญา ฯลฯ) → ส่งเมลแจ้งผู้เกี่ยวข้อง
    checkFollowUpsDue().catch(e => console.warn('followup check:', e.message));
    if (typeof checkExpiriesDue === 'function') checkExpiriesDue().catch(e => console.warn('expiry check:', e.message));
    if (typeof checkRecurringDue === 'function') checkRecurringDue().catch(e => console.warn('recurring check:', e.message));
    if (typeof renderImportantBell === 'function') renderImportantBell();
    if (typeof checkContractsDue === 'function') checkContractsDue().catch(e => console.warn('contract check:', e.message));
    return true;
  } catch(e) {
    if(syncEmail()===expectedEmail)toast('Sync ไม่สำเร็จ: ' + e.message, 'error');
    return false;
  }
}

