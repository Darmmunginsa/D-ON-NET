// ============================================================
// CONFIG — Finance · Google backend (Apps Script + Sheets/Drive) + Google Sign-In
// ใช้ Spreadsheet / Apps Script / Client ID "ตัวเดียวกับ SalePro/PurchasePro/Tech"
// ============================================================
function fmtDate(v) {
  if (!v) return '';
  let y, m, d;
  if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
  else { const s = String(v).split('T')[0]; const p = s.split('-'); if (p.length !== 3) return s; y = p[0]; m = p[1]; d = p[2]; }
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y;
}
const CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxKyaHSpdQueWDHSI0SRu3W9flHRZECtVUs4vPFiPtwfg8h16mFxoJb_GTHrBFVwreQ/exec',
  googleClientId: '1000323548149-1j89kljart0tkdio1atkoov69lfjmk3m.apps.googleusercontent.com',
  lists: {
    // แท็บของ Finance (Apps Script สร้างให้อัตโนมัติเมื่อมีข้อมูลครั้งแรก)
    financeTx:  'FinanceTx',     // รายการรับ-จ่าย ที่กรอกเอง
    financeReq: 'FinanceReq',    // ใบขอเบิก (เบิกจ่าย + อนุมัติ)
    financeCat: 'FinanceCat',    // หมวดหมู่
    // แท็บร่วม (อ่านเพื่อดึงรายรับ/รายจ่ายจากระบบอื่น)
    payments:   'Payments',      // รายรับจาก SalePro
    procurement:'Procurement',   // รายจ่ายจาก PurchasePro (JSON)
    settings:   'Settings',
    quotations: 'Quotations'
  },
  adminEmails:    ['darmmunginsa@gmail.com'],   // ผู้มีสิทธิ์อนุมัติ/ตั้งค่า
  approverEmails: []
};
// หมวดหมู่เริ่มต้น (ถ้าแท็บ FinanceCat ว่าง)
const DEFAULT_CATEGORIES = {
  income:  ['รายรับจากการขาย', 'รับชำระหนี้', 'ดอกเบี้ยรับ', 'รายรับอื่น ๆ'],
  expense: ['เงินเดือน/ค่าแรง', 'ค่าเช่า/สาธารณูปโภค', 'ค่าซื้อสินค้า/วัตถุดิบ', 'ค่าเดินทาง', 'ค่าการตลาด', 'อุปกรณ์สำนักงาน', 'ค่าบริการ/ที่ปรึกษา', 'ภาษี/ค่าธรรมเนียม', 'ค่าใช้จ่ายอื่น ๆ']
};
