// ============================================================
// COMPANY SETTINGS
// ============================================================
let companySettings = { CompanyName:'', CompanyNameEn:'', TaxID:'', Phone:'', Fax:'', Email:'', Address:'', AddressEn:'', PrimaryColor:'#1a3a5c', FooterText:'', LogoURL:'', SignatureURL:'', LogoBase64:'', SignatureBase64:'', HeaderFontSize:10, DocNoFormat:'', HeaderNameImage:'', HeaderNameW:0, HeaderNameH:0 };
// ข้อมูลหัวเอกสารเพิ่มเติม (ชื่อ/ที่อยู่ EN + Fax) — เก็บใน Settings JSON เลี่ยงเพิ่มคอลัมน์ Company list
function loadCompanyExtra() {
  try { const it = (_settingsCache || []).find(i => i.Title === 'CompanyExtra'); if (it && it.Value) { const o = JSON.parse(it.Value)||{}; companySettings.CompanyNameEn=o.CompanyNameEn||''; companySettings.AddressEn=o.AddressEn||''; companySettings.Fax=o.Fax||''; companySettings.DocNoFormat=o.DocNoFormat||''; companySettings.HeaderNameImage=o.HeaderNameImage||''; companySettings.HeaderNameW=+o.HeaderNameW||0; companySettings.HeaderNameH=+o.HeaderNameH||0; } } catch(e) {}
}
async function saveCompanyExtra() {
  const value = JSON.stringify({ CompanyNameEn:companySettings.CompanyNameEn||'', AddressEn:companySettings.AddressEn||'', Fax:companySettings.Fax||'', DocNoFormat:companySettings.DocNoFormat||'', HeaderNameImage:companySettings.HeaderNameImage||'', HeaderNameW:+companySettings.HeaderNameW||0, HeaderNameH:+companySettings.HeaderNameH||0 });
  const items = _settingsCache || await getListItems(CONFIG.lists.settings);
  const ex = items.find(i => i.Title === 'CompanyExtra');
  if (ex) { await updateListItem(CONFIG.lists.settings, ex.id, { Value: value }); ex.Value = value; }
  else { const c = await createListItem(CONFIG.lists.settings, { Title: 'CompanyExtra', Value: value }); if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'CompanyExtra', Value: value }); }
}
let companySettingsId = null;
let pendingLogoFile = null;
let pendingSignatureFile = null;
let pendingConameFile = null;

async function loadCompanySettings() {
  try {
    const items = await getListItems(CONFIG.lists.company);
    const item = items.find(i=>i.Title==='main');
    if (item) {
      companySettings={...companySettings,...item};
      companySettingsId=item.id;
      // If LogoURL is a base64 data URL, also set LogoBase64
      if (item.LogoURL && item.LogoURL.startsWith('data:')) companySettings.LogoBase64 = item.LogoURL;
      if (item.SignatureURL && item.SignatureURL.startsWith('data:')) companySettings.SignatureBase64 = item.SignatureURL;
    }
  } catch(e) { console.warn('Could not load company settings:', e.message); }
  loadCompanyExtra();
}

function renderCompanySettingsForm() {
  const s = companySettings;
  if(document.getElementById('co-name')) {
    document.getElementById('co-name').value = s.CompanyName||'';
    const _en=document.getElementById('co-name-en'); if(_en) _en.value=s.CompanyNameEn||'';
    document.getElementById('co-taxid').value = s.TaxID||'';
    document.getElementById('co-phone').value = s.Phone||'';
    const _fx=document.getElementById('co-fax'); if(_fx) _fx.value=s.Fax||'';
    document.getElementById('co-email').value = s.Email||'';
    document.getElementById('co-address').value = s.Address||'';
    const _aen=document.getElementById('co-address-en'); if(_aen) _aen.value=s.AddressEn||'';
    const _dnf=document.getElementById('co-docno-format'); if(_dnf) _dnf.value=s.DocNoFormat||'';
    document.getElementById('co-footer').value = s.FooterText||'';
    document.getElementById('co-color').value = s.PrimaryColor||'#1a3a5c';
    document.getElementById('co-color-label').textContent = s.PrimaryColor||'#1a3a5c';
    const hfs = +s.HeaderFontSize || 10;
    const hfsEl = document.getElementById('co-headerfs');
    if (hfsEl) { hfsEl.value = hfs; document.getElementById('co-headerfs-val').textContent = hfs + 'px'; }
    selectColor(s.PrimaryColor||'#1a3a5c');
    const logoSrc = s.LogoBase64 || s.LogoURL || '';
    const sigSrc = s.SignatureBase64 || s.SignatureURL || '';
    // Logo preview only shown for admins
    const logoPrev = document.getElementById('logo-preview');
    if (logoPrev && logoSrc) logoPrev.innerHTML=`<img src="${logoSrc}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    // ภาพชื่อบริษัท (หัวเอกสาร)
    const _cw=document.getElementById('coname-w'); if(_cw) _cw.value = s.HeaderNameW||'';
    const _ch=document.getElementById('coname-h'); if(_ch) _ch.value = s.HeaderNameH||'';
    updateConamePreview();
    // Signature now managed per-quote, not here
  }
}
// พรีวิวภาพชื่อบริษัท ตามขนาด กว้าง/สูง ที่ตั้ง (object-fit:fill = ดึง/ย่นได้อิสระ)
function updateConamePreview() {
  const prev = document.getElementById('coname-preview'); if (!prev) return;
  const src = companySettings.HeaderNameImage || '';
  const w = +(document.getElementById('coname-w')?.value) || 0;
  const h = +(document.getElementById('coname-h')?.value) || 0;
  if (src) {
    const ws = w ? w+'px' : 'auto';
    const hs = h ? h+'px' : (w ? 'auto' : '48px');
    const fit = (w && h) ? 'fill' : 'contain';
    prev.innerHTML = `<img src="${src}" style="width:${ws};height:${hs};object-fit:${fit}">`;
  } else {
    prev.innerHTML = '<span style="font-size:12px;color:var(--muted)">คลิกเพื่ออัปโหลดภาพชื่อบริษัท</span>';
  }
}
function clearConameImage() {
  companySettings.HeaderNameImage = '';
  const _f=document.getElementById('coname-file'); if(_f) _f.value='';
  pendingConameFile = null;
  updateConamePreview();
}

function selectColor(color) {
  companySettings.PrimaryColor = color;
  if(document.getElementById('co-color')) {
    document.getElementById('co-color').value = color;
    document.getElementById('co-color-label').textContent = color;
  }
  document.querySelectorAll('#color-swatches [data-color]').forEach(el=>{
    el.style.border = el.dataset.color===color?'2px solid var(--text)':'2px solid transparent';
  });
}

function previewCompanyImage(inputId, previewId, type) {
  const file = document.getElementById(inputId).files[0];
  if (!file) return;
  if (type==='logo') pendingLogoFile=file; else if (type==='coname') pendingConameFile=file; else pendingSignatureFile=file;
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    // Store base64 immediately for PDF use
    if (type==='logo') { companySettings.LogoBase64 = b64; document.getElementById(previewId).innerHTML=`<img src="${b64}" style="max-width:100%;max-height:100%;object-fit:contain">`; }
    else if (type==='coname') { companySettings.HeaderNameImage = b64; updateConamePreview(); }
    else { companySettings.SignatureBase64 = b64; document.getElementById(previewId).innerHTML=`<img src="${b64}" style="max-width:100%;max-height:100%;object-fit:contain">`; }
  };
  reader.readAsDataURL(file);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ย่อรูป base64 ให้สั้นกว่า maxChars (Google Sheet จำกัด 50,000 ตัวอักษร/เซลล์)
async function shrinkImageBase64(dataURL, maxDim, maxChars) {
  maxDim = maxDim || 512; maxChars = maxChars || 45000;
  try {
    if (!dataURL || typeof dataURL !== 'string' || dataURL.indexOf('data:image') !== 0) return dataURL;
    if (dataURL.length <= maxChars) return dataURL;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataURL; });
    let dim = maxDim;
    for (let pass = 0; pass < 9; pass++) {
      const scale = Math.min(1, dim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      let out = c.toDataURL('image/png');                              // คงความโปร่งใสก่อน
      if (out.length > maxChars) out = c.toDataURL('image/jpeg', 0.82); // ถ้ายังใหญ่ใช้ JPEG
      if (out.length <= maxChars) return out;
      dim = Math.round(dim * 0.8);
    }
    const c = document.createElement('canvas');
    const s = Math.min(1, 256 / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch (e) { console.warn('shrink image failed:', e.message); return dataURL; }
}

async function uploadCompanyImage(file, name) {
  // Google Sheets version: บันทึกแค่ Base64 (จัดการใน saveCompanySettings)
  return fileToBase64(file);
}

async function saveSignatureOnly() {
  toast('กำลังบันทึกลายเซ็น...', 'info');
  try {
    if (pendingSignatureFile) {
      companySettings.SignatureBase64 = await fileToBase64(pendingSignatureFile);
      companySettings.SignatureURL = companySettings.SignatureBase64;
      pendingSignatureFile = null;
    }
    const fields = { 
      Title: 'main',
      SignatureURL: companySettings.SignatureURL||''
    };
    if (companySettingsId) {
      await updateListItem(CONFIG.lists.company, companySettingsId, fields);
    } else {
      const c = await createListItem(CONFIG.lists.company, { ...fields, CompanyName:'', TaxID:'', Phone:'', Email:'', Address:'', PrimaryColor:'#1a3a5c', FooterText:'', LogoURL:'' });
      companySettingsId = c.id;
    }
    companySettings = { ...companySettings, ...fields };
    toast('บันทึกลายเซ็นสำเร็จ', 'success');
  } catch(e) { toast('ไม่สำเร็จ: ' + e.message, 'error'); }
}

async function saveCompanySettings() {
  toast('กำลังบันทึก...','info');
  try {
    if (pendingLogoFile) {
      // Store as base64 for reliable display in PDF
      companySettings.LogoBase64 = await fileToBase64(pendingLogoFile);
      companySettings.LogoURL = companySettings.LogoBase64;
      pendingLogoFile=null;
    }
    if (pendingSignatureFile) {
      companySettings.SignatureBase64 = await fileToBase64(pendingSignatureFile);
      companySettings.SignatureURL = companySettings.SignatureBase64;
      pendingSignatureFile=null;
    }
    // ย่อรูปให้ < 45,000 ตัวอักษร ก่อนเก็บลงเซลล์ (กันลิมิต 50k ของ Google Sheet)
    if (companySettings.LogoBase64)      companySettings.LogoBase64      = await shrinkImageBase64(companySettings.LogoBase64, 512, 45000);
    if (companySettings.SignatureBase64) companySettings.SignatureBase64 = await shrinkImageBase64(companySettings.SignatureBase64, 600, 45000);
    const fields = { Title:'main', CompanyName:document.getElementById('co-name').value, TaxID:document.getElementById('co-taxid').value, Phone:document.getElementById('co-phone').value, Email:document.getElementById('co-email').value, Address:document.getElementById('co-address').value, PrimaryColor:companySettings.PrimaryColor, FooterText:document.getElementById('co-footer').value, LogoURL:companySettings.LogoBase64||companySettings.LogoURL||'', SignatureURL:companySettings.SignatureBase64||companySettings.SignatureURL||'' };
    if (companySettingsId) { await updateListItem(CONFIG.lists.company, companySettingsId, fields); }
    else { const c=await createListItem(CONFIG.lists.company, fields); companySettingsId=c.id; }
    companySettings={...companySettings,...fields};
    // ชื่อ/ที่อยู่ EN + Fax → Settings JSON
    companySettings.CompanyNameEn = document.getElementById('co-name-en')?.value || '';
    companySettings.AddressEn = document.getElementById('co-address-en')?.value || '';
    companySettings.Fax = document.getElementById('co-fax')?.value || '';
    companySettings.DocNoFormat = document.getElementById('co-docno-format')?.value.trim() || '';
    // ภาพชื่อบริษัท (หัวเอกสาร) + ขนาด กว้าง/สูง (HeaderNameImage ถูกเก็บตอน preview แล้ว)
    companySettings.HeaderNameW = +(document.getElementById('coname-w')?.value) || 0;
    companySettings.HeaderNameH = +(document.getElementById('coname-h')?.value) || 0;
    if (companySettings.HeaderNameImage) companySettings.HeaderNameImage = await shrinkImageBase64(companySettings.HeaderNameImage, 700, 45000);
    try { await saveCompanyExtra(); } catch(e2) { console.warn('save company extra', e2.message); }
    // ขนาดฟอนต์หัวบริษัท — เก็บแยกใน Settings list (เลี่ยงปัญหา column ใน Company list)
    const headerFs = +(document.getElementById('co-headerfs')?.value) || 10;
    companySettings.HeaderFontSize = headerFs;
    try {
      const items = _settingsCache || await getListItems(CONFIG.lists.settings);
      const existing = items.find(i => i.Title === 'CompanyHeaderFontSize');
      if (existing) { await updateListItem(CONFIG.lists.settings, existing.id, { Value: String(headerFs) }); existing.Value = String(headerFs); }
      else {
        const c = await createListItem(CONFIG.lists.settings, { Title: 'CompanyHeaderFontSize', Value: String(headerFs) });
        if (_settingsCache) _settingsCache.push({ id: c.id, Title: 'CompanyHeaderFontSize', Value: String(headerFs) });
      }
    } catch(e2) { console.warn('Save header font size failed:', e2.message); }
    toast('บันทึกตั้งค่าบริษัทสำเร็จ','success');
  } catch(e) { toast('ไม่สำเร็จ: '+e.message,'error'); }
}
