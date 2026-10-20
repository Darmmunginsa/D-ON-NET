// ============================================================
// AUTH — Google Identity Services (GIS) + role (approver)
// ============================================================
let currentUser = null;
let userRoles = { isAdmin: false, isApprover: false };
let _settingsCache = null;

async function loadUserRoles() {
  if (!currentUser) return;
  try {
    const email = currentUser.email.toLowerCase();
    const items = _settingsCache || await getListItems(CONFIG.lists.settings);
    _settingsCache = items;
    const roleItem = items.find(i => i.Title === 'Role_' + email || i.Title === 'Role_' + email.split('@')[0]);
    const role = roleItem && roleItem.Value ? roleItem.Value.trim().toLowerCase() : '';
    const adminList = (CONFIG.adminEmails || []).map(e => String(e).toLowerCase());
    const apprList  = (CONFIG.approverEmails || []).map(e => String(e).toLowerCase());
    const isAdmin = role === 'admin' || adminList.includes(email);
    const isApprover = isAdmin || role === 'approver' || role === 'finance' || apprList.includes(email);
    userRoles = { isAdmin, isApprover };
  } catch (e) { userRoles = { isAdmin: false, isApprover: false }; }
}
function isAdminUser() { return userRoles.isAdmin; }
function isApproverUser() { return userRoles.isApprover; }

function _decodeJwt(t) { try { const b = t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch(e){ return {}; } }
async function _waitGoogle(ms) { const t = Date.now(); while ((typeof google === 'undefined' || !google.accounts) && Date.now()-t < ms) { await new Promise(r=>setTimeout(r,100)); } return typeof google !== 'undefined' && !!google.accounts; }
let _gisInited = false;
function _initGIS() {
  if (_gisInited || typeof google === 'undefined' || !google.accounts) return _gisInited;
  google.accounts.id.initialize({ client_id: CONFIG.googleClientId, callback: _onGoogleCredential, auto_select: false });
  const host = document.getElementById('gbtn');
  if (host) { try { google.accounts.id.renderButton(host, { theme:'filled_blue', size:'large', width:260, text:'signin_with', shape:'pill' }); } catch(e){} }
  _gisInited = true; return true;
}
function _onGoogleCredential(resp) {
  if(!AuthSession.accept(resp && resp.credential,CONFIG.googleClientId)){toast("กรุณาใช้บัญชี Google Workspace ของ dongroups.com", "error");return;}
  const p = _decodeJwt(resp && resp.credential);
  if (!p || !p.email) { toast('เข้าสู่ระบบไม่สำเร็จ','error'); return; }
  currentUser = { email: p.email, displayName: p.name || p.email, picture: p.picture || '' };
  try { AppStorage.setItem('finuser', JSON.stringify(currentUser)); } catch(e){}
  afterLogin();
}
async function msalLogin() {
  if (!(await _waitGoogle(8000))) { toast('โหลด Google Sign-In ไม่สำเร็จ','error'); return; }
  if (!_initGIS()) { toast('ยังไม่ได้ตั้งค่า Google Client ID','error'); return; }
  try { google.accounts.id.prompt(); } catch(e){ toast('กดปุ่ม Google เพื่อเข้าสู่ระบบ','info'); }
}
function googleLogin() { return msalLogin(); }
async function tryRestoreSession() {
  const p=AuthSession.profile(CONFIG.googleClientId);
  if(p){currentUser={email:p.email,displayName:p.name||p.email,picture:p.picture||''};await afterLogin();return true;}
  if(await _waitGoogle(8000))_initGIS();return false;
}
async function logout() {
  AuthSession.clear();
  currentUser = null;
  try { AppStorage.removeItem('finuser'); } catch(e){}
  try { if (typeof google !== 'undefined' && google.accounts) google.accounts.id.disableAutoSelect(); } catch(e){}
  location.reload();
}
window.addEventListener('DOMContentLoaded', () => { tryRestoreSession(); });
