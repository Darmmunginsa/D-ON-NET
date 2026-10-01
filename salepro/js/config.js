// ============================================================
// CONFIG — Google backend (Apps Script + Sheets/Drive/Gmail) + Google Sign-In
// ============================================================

// แสดงวันที่รูปแบบ DD/MM/YYYY (ปี ค.ศ.) — ใช้ทุกจุดที่แสดงผลวันที่
function fmtDate(v) {
  if (!v) return '';
  let y, m, d;
  if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
  else {
    const s = String(v).split('T')[0];
    const p = s.split('-');
    if (p.length !== 3) return s;
    y = p[0]; m = p[1]; d = p[2];
  }
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y;
}

const CONFIG = {
  // ⬇⬇ กรอก 2 ค่านี้หลังตั้งค่า Google ⬇⬇
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxKyaHSpdQueWDHSI0SRu3W9flHRZECtVUs4vPFiPtwfg8h16mFxoJb_GTHrBFVwreQ/exec',
  googleClientId: '1000323548149-1j89kljart0tkdio1atkoov69lfjmk3m.apps.googleusercontent.com',

  // แต่ละ list = ชื่อแท็บ (sheet) ใน Google Sheet (สร้างอัตโนมัติเมื่อมีข้อมูลครั้งแรก)
  lists: {
    catalog:     'Catalog',
    quotations:  'Quotations',
    quoteItems:  'QuoteItems',
    approvals:   'Approvals',
    payments:    'Payments',
    settings:    'Settings',
    procurement: 'Procurement',
    contracts:   'Contracts',
    customers:   'Customers',
    company:     'Company'
  },
  // สิทธิ์เริ่มต้น (bootstrap) — อีเมลในนี้จะได้สิทธิ์ทันทีโดยไม่ต้องตั้งในชีต
  adminEmails:    ['darmmunginsa@gmail.com'],   // แอดมิน (เห็นทุกเมนู + ตั้งค่า)
  approverEmails: []                            // ผู้อนุมัติ (เพิ่มอีเมลคั่นด้วย ,)
};
