# Session ของทั้ง 4 ระบบ

SalePro, PurchasePro, Finance และ Tech Portal ใช้ shared/gateway-client.js ร่วมกัน

- Idle timeout 60 นาทีต่อแท็บ เตือนก่อน 5 นาที
- pointerdown, keydown, input, wheel และ touchstart เป็นกิจกรรมผู้ใช้; focus/visibility/API polling ไม่ต่อเวลา
- เก็บเวลาใน sessionStorage เพื่อไม่รีเซ็ตเพียงโหลดหน้าเดิมใหม่; ตรวจซ้ำเมื่อกลับแท็บหรือก่อนเรียก gateway
- อายุ Google ID token ยังบังคับตาม exp เดิม ไม่ขยายหรือข้ามการตรวจลายเซ็น/สิทธิ์ฝั่ง gateway
- ใกล้หมดอายุ พยายามขอ credential ผ่าน Google One Tap หนึ่งครั้งต่อ token โดยใช้ GIS instance เดิม Google อาจต้องให้ผู้ใช้กดยืนยันหรือบล็อก prompt ได้ จึงไม่รับประกันการต่ออายุเงียบ
- มีปุ่ม Google ในคำเตือน/หน้าล็อก หาก SDK โหลดได้; มีทางกลับหน้า login ถ้า Google UI ใช้ไม่ได้
- callback การต่ออายุ/กู้คืนยอมรับเฉพาะ sub บัญชีเดิม ไม่เรียก afterLogin/initNewQuote ซ้ำ จึงคง DOM ฟอร์มที่ยังไม่ได้บันทึกในแท็บเดิม
- Draft ใหม่ใช้ IndexedDB และคิวซิงก์ตาม LOCAL-FIRST-SETUP.md; การแก้ใบเดิมที่มีอยู่บนเซิร์ฟเวอร์ยังต้องกดบันทึกออนไลน์ก่อนปิดแท็บ/รีเฟรช
- ไม่ส่งคำขอที่ล้มเหลวซ้ำอัตโนมัติ ผู้ใช้ตรวจผลก่อนสั่งบันทึกใหม่
- ค่า idle เป็นข้อกำหนด client UI ไม่ใช่ session cookie ฝั่งเซิร์ฟเวอร์; gateway ยังคงตรวจ Google token และสิทธิ์ทุก request

ตรวจด้วย tests/session-expiry.test.cjs และ tests/gateway-auth.test.mjs รวม 22 ข้อ และ browser mock ที่จำลองเวลา 55/60 นาทีพร้อม callback SalePro จริง ไม่เรียก Google หรือ backend จริง

เอกสาร Google GIS: https://developers.google.com/identity/gsi/web/reference/js-reference
