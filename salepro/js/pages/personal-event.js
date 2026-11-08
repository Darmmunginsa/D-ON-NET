// ============================================================
// PERSONAL EVENT — นัดหมายส่วนตัวของผู้ใช้ (พิมพ์เอง) บนปฏิทินคิวงาน
//   เก็บใน Settings: PersonalEvent_v1_<uuid> = {owner,ownerName,title,date,time,durationMinutes,note}
//   เห็นเฉพาะของตัวเอง · ลากย้ายวันได้ · แก้ไข/ลบได้
// ============================================================
const PersonalEvent = (() => {
  const prefix = 'PersonalEvent_v1_';
  let dlg, editing = null;

  function _build() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'queue-dialog';           // ใช้สไตล์เดียวกับหน้าจัดนัด
    dlg.innerHTML =
      '<form method="dialog">' +
      '<h3 id="pe-heading">นัดของฉัน</h3>' +
      '<label>หัวข้อนัด<input id="pe-title" maxlength="200" placeholder="เช่น ประชุมทีม / เข้าพบลูกค้า"></label>' +
      '<label>วันที่<input id="pe-date" type="date" required></label>' +
      '<label>เวลา (เว้นว่างได้)<input id="pe-time" type="time"></label>' +
      '<label>ระยะเวลา (นาที · เว้นว่างได้)<input id="pe-dur" type="number" min="1" max="1440"></label>' +
      '<label>รายละเอียด / สถานที่<textarea id="pe-note" maxlength="1000" rows="2"></textarea></label>' +
      '<p id="pe-msg" role="status"></p>' +
      '<div><button type="button" class="btn btn-primary" id="pe-save">✓ บันทึกนัด</button> ' +
      '<button type="button" class="btn" id="pe-del" style="color:var(--red)">ลบ</button> ' +
      '<button type="button" class="btn" id="pe-close">ปิด</button></div>' +
      '</form>';
    document.body.appendChild(dlg);
    document.getElementById('pe-save').onclick = _save;
    document.getElementById('pe-del').onclick = _remove;
    document.getElementById('pe-close').onclick = () => dlg.close();
  }

  const _msg = s => { const el = document.getElementById('pe-msg'); if (el) el.textContent = s || ''; };

  // ───── ซิงก์ไป Google Calendar จริง (ทางเดียว SalePro → Google) ─────
  const GCAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  function _addMinutes(date, time, dur) {
    const p = time.split(':'); let total = (+p[0]) * 60 + (+p[1]) + dur, dayAdd = Math.floor(total / 1440);
    total = ((total % 1440) + 1440) % 1440;
    const eh = String(Math.floor(total / 60)).padStart(2, '0'), em = String(total % 60).padStart(2, '0');
    let d = date; if (dayAdd) { const dd = new Date(date + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + dayAdd); d = dd.toISOString().slice(0, 10); }
    return d + 'T' + eh + ':' + em + ':00';
  }
  function _gcalBody(o) {
    const b = { summary: o.title || 'นัดของฉัน', description: o.note || '', extendedProperties: { private: { salepro: '1' } } };
    if (o.time && /^\d{2}:\d{2}$/.test(o.time)) {
      const dur = Number.isInteger(o.durationMinutes) && o.durationMinutes > 0 ? o.durationMinutes : 60;
      b.start = { dateTime: o.date + 'T' + o.time + ':00', timeZone: 'Asia/Bangkok' };
      b.end = { dateTime: _addMinutes(o.date, o.time, dur), timeZone: 'Asia/Bangkok' };
    } else {
      b.start = { date: o.date };
      const dd = new Date(o.date + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + 1);
      b.end = { date: dd.toISOString().slice(0, 10) };
    }
    return b;
  }
  // สร้าง/แก้ไขนัดใน Google — คืน gcalId (สร้างใหม่ถ้ายังไม่มี หรือของเดิมถูกลบไปแล้ว)
  async function _gcalSync(gcalId, o) {
    if (typeof getCalendarToken !== 'function') return gcalId || '';
    const tok = await getCalendarToken();
    const body = JSON.stringify(_gcalBody(o));
    const hdr = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
    const url = gcalId ? GCAL + '/' + encodeURIComponent(gcalId) : GCAL;
    let resp = await fetch(url, { method: gcalId ? 'PATCH' : 'POST', headers: hdr, body });
    if (!resp.ok && gcalId && (resp.status === 404 || resp.status === 410)) {   // ถูกลบใน Google แล้ว → สร้างใหม่
      resp = await fetch(GCAL, { method: 'POST', headers: hdr, body });
    }
    if (!resp.ok) { let m = 'HTTP ' + resp.status; try { const j = await resp.json(); m = (j.error && j.error.message) || m; } catch (_) {} if (resp.status === 403) m += ' (เปิด Google Calendar API แล้วหรือยัง)'; throw Error(m); }
    return (await resp.json()).id || gcalId || '';
  }
  async function _gcalDelete(gcalId) {
    if (!gcalId || typeof getCalendarToken !== 'function') return;
    const tok = await getCalendarToken();
    const resp = await fetch(GCAL + '/' + encodeURIComponent(gcalId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } });
    if (!resp.ok && resp.status !== 404 && resp.status !== 410) throw Error('HTTP ' + resp.status);
  }

  // แปลงแถว Settings → event objects ของผู้ใช้คนนี้
  function fromSettings(settings, email) {
    const me = String(email || '').toLowerCase();
    return (settings || []).filter(r => String(r.Title || '').startsWith(prefix)).flatMap(r => {
      let v; try { v = JSON.parse(r.Value || '{}'); } catch (_) { return []; }
      if (!v || String(v.owner || '').toLowerCase() !== me) return [];
      const date = /^\d{4}-\d{2}-\d{2}$/.test(v.date || '') ? v.date : '';
      if (!date) return [];
      return [{
        id: 'personal:' + r.id, personalId: r.id, source: 'personal', type: 'personal',
        date, time: /^\d{2}:\d{2}$/.test(v.time || '') ? v.time : '',
        title: String(v.title || 'นัดของฉัน'), client: 'นัดส่วนตัว', ref: '',
        owner: String(v.ownerName || v.owner || ''), done: false,
        detail: String(v.note || ''), durationMinutes: Number.isInteger(v.durationMinutes) ? v.durationMinutes : null,
        gcalId: String(v.gcalId || '')
      }];
    });
  }

  // เปิดฟอร์ม: open() ใหม่ · open(dateStr) ใหม่พร้อมวัน · open(null, eventObj) แก้ไข
  function open(dateStr, ev) {
    if (!currentUser) { toast('กรุณาเข้าสู่ระบบ', 'error'); return; }
    _build();
    editing = ev && ev.personalId ? ev : null;
    _msg('');
    document.getElementById('pe-heading').textContent = editing ? 'แก้ไขนัดของฉัน' : 'เพิ่มนัดของฉัน';
    document.getElementById('pe-del').style.display = editing ? '' : 'none';
    document.getElementById('pe-title').value = editing ? (ev.title || '') : '';
    document.getElementById('pe-date').value = editing ? (ev.date || '') : (dateStr || new Date().toISOString().slice(0, 10));
    document.getElementById('pe-time').value = editing ? (ev.time || '') : '';
    document.getElementById('pe-dur').value = editing && ev.durationMinutes != null ? ev.durationMinutes : '';
    document.getElementById('pe-note').value = editing ? (ev.detail || '') : '';
    dlg.showModal();
  }

  async function _save() {
    const title = (document.getElementById('pe-title').value || '').trim();
    const date = (document.getElementById('pe-date').value || '').trim();
    const time = (document.getElementById('pe-time').value || '').trim();
    const durRaw = (document.getElementById('pe-dur').value || '').trim();
    const note = (document.getElementById('pe-note').value || '').trim();
    if (!title) { _msg('กรุณาใส่หัวข้อนัด'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { _msg('กรุณาเลือกวันที่'); return; }
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { _msg('เวลาไม่ถูกต้อง'); return; }
    let durationMinutes = null;
    if (durRaw !== '') { const n = Number(durRaw); if (!Number.isInteger(n) || n < 1 || n > 1440) { _msg('ระยะเวลาต้องเป็น 1–1440 นาที'); return; } durationMinutes = n; }
    const obj = {
      owner: currentUser.email || '', ownerName: currentUser.displayName || currentUser.email || '',
      title, date, time, durationMinutes, note
    };
    const btn = document.getElementById('pe-save'); btn.disabled = true; _msg('กำลังบันทึก...');
    try {
      // ซิงก์ Google Calendar จริงก่อน (best-effort) เพื่อให้ได้ gcalId มาเก็บคู่กัน
      let gcalId = editing ? (editing.gcalId || '') : '', gcalMsg = '';
      try { _msg('กำลังซิงก์ Google Calendar...'); gcalId = await _gcalSync(gcalId, obj) || gcalId; }
      catch (e) { gcalMsg = ' · ยังไม่ซิงก์ Google: ' + e.message; }
      const value = JSON.stringify(Object.assign({}, obj, { gcalId, updatedAt: new Date().toISOString() }));
      if (editing) await updateListItem(CONFIG.lists.settings, editing.personalId, { Value: value });
      else await createListItem(CONFIG.lists.settings, { Title: prefix + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), Value: value });
      dlg.close();
      toast((editing ? 'แก้ไขนัดแล้ว' : 'เพิ่มนัดแล้ว') + (gcalMsg ? gcalMsg : ' · ลง Google Calendar แล้ว'), gcalMsg ? 'info' : 'success');
      if (typeof SaleCalendar !== 'undefined') SaleCalendar.load();
    } catch (e) { _msg('บันทึกไม่สำเร็จ: ' + e.message); }
    finally { btn.disabled = false; }
  }

  async function _remove() {
    if (!editing) return;
    if (!confirm('ลบนัด "' + (editing.title || '') + '" ?')) return;
    const btn = document.getElementById('pe-del'); btn.disabled = true;
    try {
      if (editing.gcalId) { try { await _gcalDelete(editing.gcalId); } catch (_) {} }   // ลบใน Google ด้วย (best-effort)
      await deleteListItem(CONFIG.lists.settings, editing.personalId);
      dlg.close();
      toast('ลบนัดแล้ว', 'success');
      if (typeof SaleCalendar !== 'undefined') SaleCalendar.load();
    } catch (e) { _msg('ลบไม่สำเร็จ: ' + e.message); }
    finally { btn.disabled = false; }
  }

  // ย้ายวัน (ลากวาง) — รับ Value เดิมมาเพื่อคงฟิลด์อื่น + อัปเดต Google ด้วย
  async function move(personalId, oldValue, newDate) {
    let v; try { v = JSON.parse(oldValue || '{}'); } catch (_) { return; }
    v.date = newDate; v.updatedAt = new Date().toISOString();
    if (v.gcalId) { try { v.gcalId = await _gcalSync(v.gcalId, v) || v.gcalId; } catch (_) {} }
    await updateListItem(CONFIG.lists.settings, personalId, { Value: JSON.stringify(v) });
  }

  return { prefix, fromSettings, open, move };
})();
