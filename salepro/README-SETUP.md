# SalePro (Google Edition) — คู่มือติดตั้ง

เวอร์ชันนี้ใช้ **Google Sheets + Google Drive + Gmail** ผ่าน **Google Apps Script** แทน SharePoint
และล็อกอินด้วย **Sign in with Google**

โค้ดหน้าเพจเหมือนเดิมทุกอย่าง เปลี่ยนแค่ชั้นข้อมูล (`js/config.js`, `js/api.js`, `js/auth.js`) + `apps-script/Code.gs`

---

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)

### 1) สร้าง Google Sheet (ฐานข้อมูล)
- สร้าง Google Sheet เปล่า 1 ไฟล์ (เช่นชื่อ "SalePro DB")
- คัดลอก **Spreadsheet ID** จาก URL: `https://docs.google.com/spreadsheets/d/`**`<ID ตรงนี้>`**`/edit`
- แท็บต่าง ๆ (Quotations, Customers, Settings ฯลฯ) ระบบจะ **สร้างให้อัตโนมัติ** เมื่อมีข้อมูลครั้งแรก

### 2) สร้างโฟลเดอร์ Google Drive (เก็บไฟล์แนบ: สลิป/ลายเซ็น/เอกสาร)
- สร้างโฟลเดอร์ใน Drive (เช่น "SalePro Files")
- คัดลอก **Folder ID** จาก URL: `https://drive.google.com/drive/folders/`**`<ID ตรงนี้>`**

### 3) ติดตั้ง Apps Script backend
1. ไปที่ https://script.google.com → **New project**
2. ลบโค้ดเดิม แล้ววางเนื้อหาไฟล์ `apps-script/Code.gs` ทั้งหมด
3. แก้ 2 บรรทัดบนสุด:
   - `SPREADSHEET_ID` = ID จากข้อ 1
   - `UPLOAD_FOLDER_ID` = ID จากข้อ 2
4. **Deploy → New deployment → เลือกชนิด Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. กด Deploy → อนุญาตสิทธิ์ (Authorize) → คัดลอก **Web app URL** (ลงท้าย `/exec`)

### 4) สร้าง Google OAuth Client ID (สำหรับ Sign in with Google)
1. ไปที่ https://console.cloud.google.com → สร้าง/เลือก Project
2. **APIs & Services → OAuth consent screen** → ตั้งค่าเป็น Internal (ถ้าใช้ใน Workspace) หรือ External แล้วเพิ่มอีเมลทีมเป็น test users
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins**: ใส่ origin ที่จะเปิดเว็บนี้ เช่น
     - `http://localhost:5500` (ตอนทดสอบ)
     - `https://your-domain.com` (ตอนใช้งานจริง)
   - คัดลอก **Client ID** (`xxxx.apps.googleusercontent.com`)

### 5) ใส่ค่าใน `js/config.js`
```js
appsScriptUrl: 'วาง Web app URL จากข้อ 3',
googleClientId: 'วาง Client ID จากข้อ 4',
```

### 6) กำหนดสิทธิ์ผู้ใช้ (admin/approver)
ในแท็บ **Settings** ของ Google Sheet เพิ่มแถว (คอลัมน์ `Title`, `Value`):
- `Role_อีเมล@โดเมน` → `admin` หรือ `approver` หรือ `sales`

---

## ข้อควรรู้ด้านความปลอดภัย
- Apps Script รันด้วยสิทธิ์เจ้าของ (คุณ) และ front-end ส่งอีเมลผู้ใช้ไปเป็นผู้บันทึก
- เหมาะกับใช้ภายในทีม — ถ้าต้องการกันการปลอมตัวตน สามารถอัปเกรดให้ Apps Script ตรวจ Google ID token ได้ (แจ้งได้)

## ต้องเปิดเว็บยังไง
- ต้องเปิดผ่าน http(s) origin (ไม่ใช่เปิดไฟล์ file:// ตรง ๆ) เพราะ Google Sign-In ต้องการ origin
- ทดสอบง่าย ๆ: ใช้ VS Code "Live Server" (จะได้ `http://localhost:5500`) แล้วเพิ่ม origin นี้ในข้อ 4
