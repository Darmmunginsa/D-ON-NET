// ============================================================
// CONFIG — PurchasePro · Google backend (Apps Script + Sheets/Drive/Gmail) + Google Sign-In
// ใช้ Spreadsheet / Apps Script / Client ID "ตัวเดียวกับ SalePro" (ข้อมูลร่วมกัน)
// ============================================================

// แสดงวันที่รูปแบบ DD/MM/YYYY (ปี ค.ศ.)
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
  appsScriptUrl: 'https://d-on-net-gateway.darmmunginsa.workers.dev/',
  googleClientId: '1000323548149-1j89kljart0tkdio1atkoov69lfjmk3m.apps.googleusercontent.com',

  // ชื่อแท็บใน Google Sheet (ร่วมกับ SalePro)
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
  adminEmails:    ['admin@dongroups.com'],
  approverEmails: []
};
