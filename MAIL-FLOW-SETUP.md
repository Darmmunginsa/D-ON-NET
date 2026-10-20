# แก้การส่งอีเมลตาม Flow

## สิ่งที่แก้

- SalePro, PurchasePro และ Finance ใช้ action `sendEmail` ของ Apps Script เดิม แทนการขอ Gmail API token จากเบราว์เซอร์หลังบันทึกงาน
- ตอบกลับไปยังผู้ที่ทำรายการผ่าน `replyTo`; ผู้ส่งจริงยังเป็นบัญชีที่รัน Apps Script ไม่ได้เปลี่ยนเป็นบัญชีผู้ล็อกอิน
- รองรับไฟล์แนบทั้ง `base64` และ `contentBytes`
- แจ้งข้อผิดพลาดทางหน้าจอเมื่อส่งไม่สำเร็จ แม้บันทึกธุรกรรมสำเร็จแล้ว
- ไม่ retry action ส่งเมลอัตโนมัติ เพราะเมื่อการตอบกลับขาดหาย เมลอาจส่งออกไปแล้ว
- คำขอจัดซื้อเรียกส่งจริงและรอผลก่อนบันทึก Timeline แทนเปิด `mailto:`

## ตั้งค่าผู้ส่ง @dongroups.com

1. เปิดโปรเจกต์ Apps Script ที่ใช้อยู่กับ URL `appsScriptUrl` ใน config ของระบบ
2. ตรวจบัญชีที่สร้าง Deployment และตัวเลือก **Execute as** ถ้าเป็น **Me** ผู้ส่งคือบัญชีนั้น
3. หากต้องการ From เป็น `@dongroups.com` ต้องให้ Deployment รันด้วยบัญชีบริษัทที่มีสิทธิ์ฐานข้อมูลและโฟลเดอร์เดิม ไม่ใช่เปลี่ยน From ใน JavaScript หรือเปลี่ยน DNS
4. ยังไม่ได้ระบุบัญชีผู้ส่งกลาง จึงไม่เดาหรือเปลี่ยนบัญชี/URL ใน repo
5. อัปเดต `salepro/apps-script/Code.gs` ในโปรเจกต์เดิม แล้วไป **Deploy → Manage deployments → Edit → New version → Deploy** เพื่อคง URL เดิม
6. อนุญาต MailApp ด้วยบัญชีที่ Deploy และตรวจหน้า **Executions** หากมีปัญหาสิทธิ์หรือโควตา

การส่งฝั่งหน้าเว็บใช้ action เดิมที่ backend ใน repo มีอยู่แล้ว ส่วนการตรวจโควตาและผลตอบกลับ `sent` ต้องใช้ Code.gs เวอร์ชันล่าสุด

## ทดสอบจริงหลัง Deploy

ทดสอบเอกสารตัวอย่างและผู้รับทดสอบที่เจ้าของอนุญาต: ส่งอนุมัติ → ผลอนุมัติ → คำขอจัดซื้อ → รับ PO → ชำระครบ และขั้นแจ้งเตือนที่ใช้งานจริงใน PurchasePro/Finance

ตรวจกล่องรับ/Spam, From, Reply-To และไฟล์แนบ ไม่ใช่ดูข้อความสำเร็จบนเว็บอย่างเดียว หากเกิด Network error ให้ตรวจผู้รับหรือ Executions ก่อนส่งซ้ำ

การแจ้งเตือนในโค้ดนี้เกิดจากหน้าเว็บที่เปิดใช้งาน ไม่ใช่ scheduled background worker การเตือนตามเวลาเมื่อปิดเว็บต้องตั้ง trigger แยก

ยังคงระบบการเข้าถึง backend เดิม แพตช์นี้ไม่ได้เพิ่มการยืนยัน Google ID token ฝั่งเซิร์ฟเวอร์หรือเปลี่ยนสิทธิ์ Apps Script

อ้างอิง: https://developers.google.com/apps-script/reference/mail/mail-app และ https://developers.google.com/apps-script/guides/web
