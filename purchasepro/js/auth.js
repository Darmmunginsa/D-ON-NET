// ============================================================
// AUTH — Google Identity Services (GIS) สำหรับ PurchasePro
// afterLogin() อยู่ใน app.js (เรียกหลังล็อกอินสำเร็จ)
// ============================================================
let currentUser = null;

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
  const p = _decodeJwt(resp && resp.credential);
  if (!p || !p.email) { toast('เข้าสู่ระบบไม่สำเร็จ', 'error'); return; }
  currentUser = { displayName: p.name || p.email, email: p.email, picture: p.picture || '' };
  try { localStorage.setItem('ppuser', JSON.stringify(currentUser)); } catch(e) {}
  afterLogin();
}
// คงชื่อ msalLogin เดิมไว้ให้ปุ่มใน index.html ทำงาน → เรียก Google prompt
async function msalLogin() {
  if (!(await _waitGoogle(8000))) { toast('โหลด Google Sign-In ไม่สำเร็จ — ตรวจอินเทอร์เน็ต', 'error'); return; }
  if (!_initGIS()) { toast('ยังไม่ได้ตั้งค่า Google Client ID', 'error'); return; }
  try { google.accounts.id.prompt(); } catch(e) { toast('กดปุ่ม Google เพื่อเข้าสู่ระบบ', 'info'); }
}
function googleLogin() { return msalLogin(); }

// กู้เซสชันจาก localStorage ถ้ามี, ไม่งั้นเตรียมปุ่ม Google
async function tryRestoreSession() {
  try {
    const s = localStorage.getItem('ppuser');
    if (s) { currentUser = JSON.parse(s); if (currentUser && currentUser.email) { await afterLogin(); return true; } }
  } catch(e) {}
  if (await _waitGoogle(8000)) _initGIS();
  return false;
}

async function logout() {
  currentUser = null;
  try { localStorage.removeItem('ppuser'); } catch(e) {}
  try { if (typeof google !== 'undefined' && google.accounts) google.accounts.id.disableAutoSelect(); } catch(e) {}
  location.reload();
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
