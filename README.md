# D-ON-NET — iT Services Internal Systems (Google Edition)

ชุดเว็บแอปภายใน ใช้ **Google Sheets + Drive + Gmail** ผ่าน **Google Apps Script** และล็อกอินด้วย **Google**

เปิดใช้งานที่: `https://darmmunginsa.github.io/D-ON-NET/`

## แอปในรีโป
- `salepro/` — ระบบใบเสนอราคา (พร้อมใช้งาน)
- `purchasepro/` — ระบบจัดซื้อ (กำลังพอร์ต)
- `tech/` — พอร์ทัลช่าง (กำลังพอร์ต)

## การตั้งค่า (SalePro)
ดู `salepro/README-SETUP.md` — ค่าคอนฟิกอยู่ใน `salepro/js/config.js` และ backend อยู่ใน `salepro/apps-script/Code.gs`

> ต้องเปิดผ่าน **https** (GitHub Pages) เท่านั้น — Google Sign-In และ Apps Script CORS ใช้กับ http://localhost ไม่ได้
