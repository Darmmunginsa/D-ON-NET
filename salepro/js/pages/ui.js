// ============================================================
// PAGES
// ============================================================
const pageTitles = {dashboard:'Dashboard',quotes:'ใบเสนอราคา',newquote:'สร้างใบเสนอราคาใหม่',approve:'รออนุมัติ',payment:'ติดตามการชำระเงิน',catalog:'Catalog สินค้า',settings:'Approve Settings',customers:'ลูกค้า (CRM)',company:'ตั้งค่าบริษัท',forecast:'Sale Forecast',vendor:'Vendor',contracts:'ทะเบียนสัญญา'};

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[id] || id;
  if (id === 'newquote') { if (!editingQuoteId) initNewQuote(); setTimeout(updateApproverBox, 200); setTimeout(initNqFab, 0); setTimeout(function(){ autoGrowAll(document.getElementById('page-newquote')); }, 60); }
  if (id === 'approve') renderApprove();
  if (id === 'payment') renderPayment();
  if (id === 'settings') { setTimeout(renderTiers, 50); setTimeout(() => { if (typeof renderBelowCostApproverSetting==='function') renderBelowCostApproverSetting(); }, 50); }
  if (id === 'customers') { loadCustomers().then(renderCustomers); }
  if (id === 'forecast') { loadForecast(); }
  if (id === 'contracts') { loadContracts().then(renderContracts); }
  if (id === 'vendor') { loadVendors(); }
  if (id === 'catalog') { Promise.all([loadCatalogExtra(), (typeof loadVendors==='function'?loadVendors():null)]).then(renderCatalog); }
  if (id === 'company') {
    loadCompanySettings().then(() => {
      renderCompanySettingsForm();
      // Show admin section only for SQ-Admin
      const adminSection = document.getElementById('admin-settings-section');
      if (adminSection) {
        adminSection.style.display = userRoles.isAdmin ? 'block' : 'none';
      }
    });
  }
}

// ── Textarea ขยายสูงอัตโนมัติตามจำนวนบรรทัด ──
function autoGrow(el){ if(!el)return; el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
function autoGrowAll(scope){ try{ (scope||document).querySelectorAll('textarea.autogrow').forEach(autoGrow); }catch(e){} }

// ── Debounce helper (กัน re-render ถี่ตอนพิมพ์ค้นหา) ──
function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
window.searchQuotes = debounce(() => renderQuotes(), 220);
window.searchCatalog = debounce(() => renderCatalog(), 220);
window.searchCustomers = debounce(() => renderCustomers(), 220);

