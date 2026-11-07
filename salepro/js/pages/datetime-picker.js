// ============================================================
// DATETIME PICKER — ปฏิทิน + เลือกเวลาแบบคลิกตัวเลขใหญ่ (สไตล์ Windows)
//   ใช้แทน <input type="datetime-local"> ที่กดยาก
//   DateTimePicker.attach(inputEl)  → คลิกช่องแล้วเปิด picker
//   เลือกวัน + ชั่วโมง + นาที แล้วกด "บันทึกวันเวลา" จึง fill กลับเข้าช่อง
// ============================================================
const DateTimePicker = (() => {
  let dlg, target = null;
  let viewY, viewM;          // เดือนที่กำลังดู (ค.ศ.)
  let selDate = null;        // {y,m,d}
  let selH = 9, selMin = 0;  // เวลา

  const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const pad = n => String(n).padStart(2, '0');

  function _style() {
    if (document.getElementById('dtp-style')) return;
    const s = document.createElement('style');
    s.id = 'dtp-style';
    s.textContent = `
    .dtp-dialog{margin:auto;border:none;background:transparent;padding:0;max-height:94vh;overflow:visible}
    .dtp-dialog::backdrop{background:rgba(0,0,0,.55)}
    .dtp-card{background:var(--surface,#181c27);color:var(--text,#e8eaf0);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.5);width:min(94vw,560px);overflow:hidden;font-family:var(--font)}
    .dtp-head{padding:16px 20px;background:linear-gradient(135deg,var(--accent,#4f8ef7),var(--purple,#a78bfa));color:#fff}
    .dtp-head .dtp-preview{font-size:19px;font-weight:700;letter-spacing:.3px}
    .dtp-head .dtp-sub{font-size:11px;opacity:.85;margin-top:2px}
    .dtp-body{display:grid;grid-template-columns:1.25fr 1fr;gap:0}
    @media(max-width:520px){.dtp-body{grid-template-columns:1fr}}
    .dtp-cal{padding:16px 18px;border-right:1px solid var(--border2,rgba(255,255,255,.1))}
    @media(max-width:520px){.dtp-cal{border-right:none;border-bottom:1px solid var(--border2,rgba(255,255,255,.1))}}
    .dtp-monthbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .dtp-monthbar b{font-size:14px}
    .dtp-nav{width:32px;height:32px;border-radius:8px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);cursor:pointer;font-size:16px;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
    .dtp-nav:hover{background:var(--accent,#4f8ef7);color:#fff;border-color:transparent}
    .dtp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
    .dtp-dow{text-align:center;font-size:11px;color:var(--muted);padding:4px 0;font-weight:600}
    .dtp-d{aspect-ratio:1;min-height:34px;border:1px solid transparent;border-radius:9px;background:var(--surface2,#1e2333);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s}
    .dtp-d:hover{background:var(--accent2,#6ea8fe);color:#0f1117}
    .dtp-d.out{opacity:.28;font-weight:400}
    .dtp-d.today{outline:2px solid var(--accent2);outline-offset:-2px}
    .dtp-d.sel{background:var(--accent,#4f8ef7);color:#fff;box-shadow:0 4px 12px rgba(79,142,247,.5)}
    .dtp-time{padding:16px 16px;display:flex;flex-direction:column}
    .dtp-tlabel{font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600}
    .dtp-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:1;min-height:0}
    .dtp-col{display:flex;flex-direction:column;min-height:0}
    .dtp-scroll{overflow-y:auto;max-height:188px;display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:3px;scrollbar-width:thin}
    .dtp-min .dtp-scroll{grid-template-columns:1fr 1fr}
    .dtp-num{padding:9px 0;border-radius:9px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);font-size:16px;font-weight:700;font-family:var(--mono);cursor:pointer;transition:all .12s;text-align:center}
    .dtp-num:hover{background:var(--accent2,#6ea8fe);color:#0f1117}
    .dtp-num.sel{background:var(--green,#34d399);color:#06231a;box-shadow:0 3px 10px rgba(52,211,153,.4)}
    .dtp-foot{display:flex;gap:10px;padding:14px 18px;border-top:1px solid var(--border2,rgba(255,255,255,.1));background:var(--surface2,#1e2333)}
    .dtp-foot .dtp-now{margin-right:auto}
    .dtp-btn{padding:11px 18px;border-radius:10px;border:1px solid var(--border2);background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .15s}
    .dtp-btn:hover{background:rgba(255,255,255,.08)}
    .dtp-btn.primary{background:var(--accent,#4f8ef7);border-color:transparent;color:#fff;flex:1;font-size:15px}
    .dtp-btn.primary:hover{filter:brightness(1.08)}
    `;
    document.head.appendChild(s);
  }

  function _build() {
    _style();
    dlg = document.createElement('dialog');
    dlg.className = 'dtp-dialog';
    dlg.innerHTML =
      '<div class="dtp-card">' +
        '<div class="dtp-head"><div class="dtp-preview" id="dtp-preview">—</div><div class="dtp-sub">เลือกวันในปฏิทิน แล้วคลิกชั่วโมง/นาที จากนั้นกดบันทึก</div></div>' +
        '<div class="dtp-body">' +
          '<div class="dtp-cal">' +
            '<div class="dtp-monthbar"><button type="button" class="dtp-nav" id="dtp-prev">‹</button><b id="dtp-month"></b><button type="button" class="dtp-nav" id="dtp-next">›</button></div>' +
            '<div class="dtp-grid" id="dtp-dow"></div>' +
            '<div class="dtp-grid" id="dtp-days" style="margin-top:3px"></div>' +
          '</div>' +
          '<div class="dtp-time">' +
            '<div class="dtp-cols">' +
              '<div class="dtp-col dtp-hr"><div class="dtp-tlabel">ชั่วโมง</div><div class="dtp-scroll" id="dtp-hours"></div></div>' +
              '<div class="dtp-col dtp-min"><div class="dtp-tlabel">นาที</div><div class="dtp-scroll" id="dtp-mins"></div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="dtp-foot">' +
          '<button type="button" class="dtp-btn dtp-now" id="dtp-nowbtn">วันนี้/เดี๋ยวนี้</button>' +
          '<button type="button" class="dtp-btn" id="dtp-cancel">ยกเลิก</button>' +
          '<button type="button" class="dtp-btn primary" id="dtp-save">✓ บันทึกวันเวลา</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);

    // weekday header
    document.getElementById('dtp-dow').innerHTML = DOW_TH.map(d => '<div class="dtp-dow">' + d + '</div>').join('');
    document.getElementById('dtp-prev').onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } _renderCal(); };
    document.getElementById('dtp-next').onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } _renderCal(); };
    document.getElementById('dtp-cancel').onclick = () => dlg.close();
    document.getElementById('dtp-save').onclick = _save;
    document.getElementById('dtp-nowbtn').onclick = () => { const n = new Date(); selDate = { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }; selH = n.getHours(); selMin = Math.round(n.getMinutes() / 5) * 5 % 60; viewY = selDate.y; viewM = selDate.m; _renderAll(); };
    dlg.addEventListener('cancel', () => {}); // อนุญาตให้ Esc ปิดได้
  }

  function _renderCal() {
    document.getElementById('dtp-month').textContent = MONTHS_TH[viewM] + ' ' + (viewY + 543);
    const first = new Date(viewY, viewM, 1).getDay();
    const days = new Date(viewY, viewM + 1, 0).getDate();
    const prevDays = new Date(viewY, viewM, 0).getDate();
    const t = new Date();
    let html = '';
    for (let i = 0; i < first; i++) html += '<button type="button" class="dtp-d out" disabled>' + (prevDays - first + 1 + i) + '</button>';
    for (let d = 1; d <= days; d++) {
      const isToday = t.getFullYear() === viewY && t.getMonth() === viewM && t.getDate() === d;
      const isSel = selDate && selDate.y === viewY && selDate.m === viewM && selDate.d === d;
      html += '<button type="button" class="dtp-d' + (isToday ? ' today' : '') + (isSel ? ' sel' : '') + '" onclick="DateTimePicker._pickDay(' + d + ')">' + d + '</button>';
    }
    document.getElementById('dtp-days').innerHTML = html;
  }

  function _renderTime() {
    let hh = '';
    for (let h = 0; h < 24; h++) hh += '<button type="button" class="dtp-num' + (h === selH ? ' sel' : '') + '" onclick="DateTimePicker._pickHour(' + h + ')">' + pad(h) + '</button>';
    document.getElementById('dtp-hours').innerHTML = hh;
    let mm = '';
    for (let m = 0; m < 60; m += 5) mm += '<button type="button" class="dtp-num' + (m === selMin ? ' sel' : '') + '" onclick="DateTimePicker._pickMin(' + m + ')">' + pad(m) + '</button>';
    document.getElementById('dtp-mins').innerHTML = mm;
    // เลื่อนให้เห็นค่าที่เลือก
    setTimeout(() => { const el = dlg.querySelector('#dtp-hours .sel'); if (el) el.scrollIntoView({ block: 'nearest' }); }, 0);
  }

  function _renderPreview() {
    const p = document.getElementById('dtp-preview');
    if (!selDate) { p.textContent = 'ยังไม่เลือกวัน'; return; }
    p.textContent = selDate.d + ' ' + MONTHS_TH[selDate.m] + ' ' + (selDate.y + 543) + ' · ' + pad(selH) + ':' + pad(selMin) + ' น.';
  }

  function _renderAll() { _renderCal(); _renderTime(); _renderPreview(); }

  function _pickDay(d) { selDate = { y: viewY, m: viewM, d }; _renderCal(); _renderPreview(); }
  function _pickHour(h) { selH = h; _renderTime(); _renderPreview(); }
  function _pickMin(m) { selMin = m; _renderTime(); _renderPreview(); }

  function _save() {
    if (!selDate) { if (typeof toast === 'function') toast('กรุณาเลือกวันก่อน', 'error'); return; }
    const val = selDate.y + '-' + pad(selDate.m + 1) + '-' + pad(selDate.d) + 'T' + pad(selH) + ':' + pad(selMin);
    if (target) {
      target.value = val;
      _reflectLabel(target);
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    dlg.close();
  }

  // อัปเดตข้อความที่โชว์บนปุ่ม/ช่อง (กรณีใช้ display แยก)
  function _reflectLabel(input) {
    const disp = input.getAttribute('data-dtp-display');
    if (!disp) return;
    const el = document.getElementById(disp);
    if (!el) return;
    el.textContent = input.value ? _fmt(input.value) : 'คลิกเพื่อเลือกวันและเวลา';
    el.classList.toggle('dtp-empty', !input.value);
  }

  function _fmt(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
    if (!m) return v || '';
    return (+m[3]) + ' ' + MONTHS_TH[+m[2] - 1] + ' ' + (+m[1] + 543) + ' · ' + m[4] + ':' + m[5] + ' น.';
  }

  function open(inputEl) {
    if (!dlg) _build();
    target = inputEl;
    const cur = inputEl.value;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(cur || '');
    if (m) { selDate = { y: +m[1], m: +m[2] - 1, d: +m[3] }; selH = +m[4]; selMin = Math.round(+m[5] / 5) * 5 % 60; }
    else { const n = new Date(); selDate = { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }; selH = n.getHours(); selMin = 0; }
    viewY = selDate.y; viewM = selDate.m;
    _renderAll();
    dlg.showModal();
  }

  // ทำให้ช่อง input เปิด picker เมื่อคลิก (ปิด native picker)
  function attach(inputEl) {
    if (!inputEl || inputEl._dtpBound) return;
    inputEl._dtpBound = true;
    inputEl.readOnly = true;
    inputEl.style.cursor = 'pointer';
    inputEl.addEventListener('click', e => { e.preventDefault(); open(inputEl); });
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(inputEl); } });
    _reflectLabel(inputEl);
  }

  return { open, attach, _pickDay, _pickHour, _pickMin, fmt: _fmt };
})();
