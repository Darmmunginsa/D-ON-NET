// ============================================================
// AUTH — Google Identity Services (GIS)
// ============================================================
let currentUser = null;
let userRoles = { isAdmin: false, isApprover: false, isSales: true }; // default to sales

// Cache settings items to avoid re-fetching
let _settingsCache = null;

async function loadUserRoles() {
  if (!currentUser) return;
  try {
    const email = currentUser.email.toLowerCase();

    // Use cached settings if available (loaded by syncAll)
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    _settingsCache = items; // cache for reuse

    const roleItem = items.find(i =>
      i.Title === 'Role_' + email ||
      i.Title === 'Role_' + email.split('@')[0]
    );

    if (roleItem && roleItem.Value) {
      const role = roleItem.Value.trim().toLowerCase();
      userRoles = {
        isAdmin:    role === 'admin',
        isApprover: role === 'approver' || role === 'admin',
        isSales:    role === 'sales' || (!['admin','approver'].includes(role))
      };
      console.log('Roles from Settings:', JSON.stringify(userRoles));
      return;
    }

    // Fallback: config bootstrap + approval tiers
    const adminList    = (CONFIG.adminEmails || []).map(e => String(e).toLowerCase());
    const approverList = (CONFIG.approverEmails || []).map(e => String(e).toLowerCase());
    const tierEmails   = (typeof approvalTiers !== 'undefined' ? approvalTiers : []).map(t => (t.approverEmail||'').toLowerCase()).filter(Boolean);
    if (adminList.includes(email)) {
      userRoles = { isAdmin: true, isApprover: true, isSales: false };
    } else if (approverList.includes(email) || tierEmails.includes(email)) {
      userRoles = { isAdmin: false, isApprover: true, isSales: false };
    } else {
      userRoles = { isAdmin: false, isApprover: false, isSales: true };
    }
    console.log('Roles from config/tier:', JSON.stringify(userRoles));
  } catch(e) {
    console.warn('Role load failed:', e.message);
    userRoles = { isAdmin: false, isApprover: false, isSales: true };
  }
}

function isAdminUser() { return userRoles.isAdmin; }
function isApproverUser() { return userRoles.isApprover || userRoles.isAdmin; }
function isSalesUser() { return userRoles.isSales; }

let currentApproveId = null;
let currentPaymentQuoteId = null;
let quoteItems = [];
let editingQuoteId = null;
let catalogData = [];
let quotesData = [];
let editingProductId = null;

// ── Google Identity Services (GIS) ──
function _decodeJwt(t) {
  try { const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(b)))); }
  catch(e) { return {}; }
}
async function _waitGoogle(ms) {
  const t = Date.now();
  while ((typeof google === 'undefined' || !google.accounts) && Date.now() - t < ms) { await new Promise(r => setTimeout(r, 100)); }
  return typeof google !== 'undefined' && !!google.accounts;
}
let _gisInited = false;
function _initGIS() {
  if (_gisInited || typeof google === 'undefined' || !google.accounts) return _gisInited;
  if (!CONFIG.googleClientId || CONFIG.googleClientId.indexOf('PASTE') === 0) { console.warn('ยังไม่ได้ตั้งค่า googleClientId'); return false; }
  google.accounts.id.initialize({ client_id: CONFIG.googleClientId, callback: _onGoogleCredential, auto_select: false });
  const host = document.getElementById('gbtn');
  if (host) { try { google.accounts.id.renderButton(host, { theme: 'filled_blue', size: 'large', width: 260, text: 'signin_with', shape: 'pill' }); } catch(e) {} }
  _gisInited = true;
  return true;
}
function _onGoogleCredential(resp) {
  if(!AuthSession.accept(resp && resp.credential,CONFIG.googleClientId)){toast("กรุณาใช้บัญชี Google Workspace ของ dongroups.com", "error");return;}
  const p = _decodeJwt(resp && resp.credential);
  if (!p || !p.email) { toast('เข้าสู่ระบบไม่สำเร็จ', 'error'); return; }
  currentUser = { displayName: p.name || p.email, email: p.email, picture: p.picture || '' };
  try { AppStorage.setItem('guser', JSON.stringify(currentUser)); } catch(e) {}
  afterLogin();
}
// คงชื่อ msalLogin เดิมไว้ให้ปุ่มใน index.html ทำงาน → เรียก Google prompt
async function msalLogin() {
  if (!(await _waitGoogle(8000))) { toast('โหลด Google Sign-In ไม่สำเร็จ — ตรวจอินเทอร์เน็ต', 'error'); return; }
  if (!_initGIS()) { toast('ยังไม่ได้ตั้งค่า Google Client ID', 'error'); return; }
  try { google.accounts.id.prompt(); } catch(e) { toast('กดปุ่ม Google เพื่อเข้าสู่ระบบ', 'info'); }
}
function googleLogin() { return msalLogin(); }

// กู้เซสชันจาก AppStorage ถ้ามี, ไม่งั้นเตรียมปุ่ม Google
async function tryRestoreSession() {
  const p=AuthSession.profile(CONFIG.googleClientId);
  if(p){currentUser={email:p.email,displayName:p.name||p.email,picture:p.picture||''};await afterLogin();return true;}
  if(await _waitGoogle(8000))_initGIS();return false;
}

async function afterLogin() {
  try {
    document.getElementById('user-name').textContent = currentUser.displayName || currentUser.email;
    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-avatar').textContent = (currentUser.displayName || 'U')[0].toUpperCase();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    initNewQuote();
    // โหลดสิทธิ์ก่อน sync — ให้การกรองใบเสนอราคา (Admin/Approver เห็นทุกใบ) ถูกต้องตั้งแต่เข้าโปรแกรม
    await loadUserRoles();
    await syncAll();
    // Load saved theme (per-user)
    await loadTheme();
    // Load Sale profile (name/tel/signature) from SharePoint — durable across devices
    await loadSaleProfile();
    // โหลดทะเบียนลูกค้าไว้ล่วงหน้า — เพื่อจับคู่ชื่อ/ที่อยู่ ไทย-EN บนใบเสนอราคา/เอกสารสำคัญ
    if (typeof loadCustomers === 'function') { try { await loadCustomers(); } catch(e) { console.warn('preload customers failed:', e.message); } }
    // Show role badge after sync (tiers loaded)
    const roleBadge = document.getElementById('user-role-badge');
    if (roleBadge) {
      if (userRoles.isAdmin) {
        roleBadge.innerHTML = '<span style="background:rgba(248,113,113,0.2);color:var(--red);padding:1px 6px;border-radius:10px;font-size:9px">Admin</span>';
      } else if (userRoles.isApprover) {
        roleBadge.innerHTML = '<span style="background:rgba(251,191,36,0.2);color:var(--amber);padding:1px 6px;border-radius:10px;font-size:9px">Approver</span>';
      } else {
        roleBadge.innerHTML = '<span style="background:rgba(79,142,247,0.15);color:var(--accent2);padding:1px 6px;border-radius:10px;font-size:9px">Sales</span>';
      }
    // Show/hide admin-only nav items
    document.querySelectorAll('.nav-admin-only').forEach(el => {
      el.style.display = userRoles.isAdmin ? 'flex' : 'none';
    });
    }
    // In-app tour (เด้งครั้งแรก / ปุ่ม 🧭)
    if (typeof maybeStartTour === 'function') { try { maybeStartTour(); } catch(e) {} }
    // PO Status callback (เมื่อจัดซื้อคลิกปุ่มสถานะจาก Email)
    await handlePOStatusCallback();
    // ลิงก์อนุมัติขายต่ำกว่าทุนจาก Email (?bcapprove=<id>)
    if (typeof handleBelowCostCallback === 'function') { try { await handleBelowCostCallback(); } catch(e) { console.warn('bc callback', e.message); } }
  } catch(e) {
    toast('Login ไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function logout() {
  AuthSession.clear();
  currentUser = null;
  try { AppStorage.removeItem('guser'); } catch(e) {}
  try { if (typeof google !== 'undefined' && google.accounts) google.accounts.id.disableAutoSelect(); } catch(e) {}
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}


// ── Gmail API OAuth (ส่งอีเมลในนามผู้ที่ล็อกอินจริง ๆ) ──
let _gmailTokenClient = null, _gmailTok = '', _gmailTokExp = 0, _gmailResolve = null, _gmailReject = null;
function _ensureTokenClient() {
  if (_gmailTokenClient) return _gmailTokenClient;
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return null;
  _gmailTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    callback: function(resp) {
      if (resp && resp.access_token) {
        _gmailTok = resp.access_token;
        _gmailTokExp = Date.now() + ((resp.expires_in || 3600) * 1000) - 60000;
        if (_gmailResolve) { _gmailResolve(_gmailTok); _gmailResolve = null; _gmailReject = null; }
      } else if (_gmailReject) {
        _gmailReject(new Error('ไม่ได้รับสิทธิ์ส่งอีเมล (gmail.send)')); _gmailReject = null; _gmailResolve = null;
      }
    }
  });
  return _gmailTokenClient;
}
// คืน access token ที่ใช้ได้ (ขอ consent ครั้งแรก, เงียบหลังจากนั้น)
function getGmailToken() {
  if (_gmailTok && Date.now() < _gmailTokExp) return Promise.resolve(_gmailTok);
  return new Promise(function(res, rej) {
    const tc = _ensureTokenClient();
    if (!tc) { rej(new Error('Google OAuth ยังไม่พร้อม — ลองใหม่อีกครั้ง')); return; }
    _gmailResolve = res; _gmailReject = rej;
    try { tc.requestAccessToken({ prompt: '' }); } catch (e) { rej(e); }
  });
}
