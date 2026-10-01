// ============================================================
// In-App Tour (แนะนำการใช้งาน) — SalePro
// ทัวร์ "แยกรายหน้า": ทุกหน้ามีทัวร์ของตัวเอง เด้งครั้งแรกที่เปิดหน้านั้น
// กดข้าม/จบ/✕ แล้วหน้านั้นจะไม่เด้งอีก (จำต่อผู้ใช้+ต่อหน้า ใน SharePoint Settings)
// ปุ่ม 🧭 บน topbar = ดูทัวร์ของ "หน้าปัจจุบัน" ซ้ำได้ทุกเมื่อ
// ============================================================
(function(){
  var APP='SalePro';
  var MANUAL_URL='https://claude.ai/artifact/QkGQaHq4qKg3PLQrfU7H41'; // คู่มือฉบับเต็ม
  var VER='v2';

  function GET(k){ try{ return (typeof getSettingValue==='function')?getSettingValue(k):''; }catch(e){ return ''; } }
  function PUT(k,v){ try{ if(typeof putSettingValue==='function') return putSettingValue(k,v); }catch(e){} }
  function sw(tab){ return function(){ var b=document.querySelector('.st-tab[data-tab="'+tab+'"]'); if(b && typeof switchSTTab==='function') switchSTTab(tab,b); }; }

  // ── นิยามทัวร์แต่ละหน้า ──
  var END={link:true,title:'จบทัวร์หน้านี้ 🎉',body:'อยากดูละเอียดเปิดคู่มือฉบับเต็มได้ · เมนูซ้ายพาไปหน้าอื่น (แต่ละหน้ามีทัวร์เอง) · กด 🧭 มุมบนขวาเพื่อดูหน้านี้ซ้ำ'};
  var TOURS={
    dashboard:[
      {title:'ยินดีต้อนรับสู่ SalePro 👋',body:'นี่คือหน้าภาพรวม (Dashboard) สรุปสถานะงานขายทั้งหมด — กด “ถัดไป” เพื่อชมทีละจุด'},
      {sel:'.stats-grid',title:'การ์ดสรุป',body:'ตัวเลข 4 ช่อง: ใบเสนอราคาเดือนนี้ · รออนุมัติ · อนุมัติแล้ว · ค้างชำระ'},
      {sel:'#sales-report',title:'ภาพรวมยอดขาย',body:'สรุปยอดขายแยกตามช่วง/สถานะ'},
      {sel:'#d-recent',title:'ใบเสนอราคาล่าสุด',body:'ใบที่เพิ่งสร้าง/แก้ไขล่าสุด'},
      {sel:'#d-approve-list',title:'รออนุมัติ',body:'ใบที่ต้องอนุมัติด่วน กดเข้าไปจัดการได้'},
      {sel:'#topbar-btn',title:'สร้างใบเสนอราคา',body:'ปุ่มลัดนี้อยู่ทุกหน้า กดเพื่อเริ่มใบใหม่'},
      {sel:'button[onclick*="syncAll"]',title:'Sync',body:'ดึงข้อมูลล่าสุดจาก SharePoint'},
      {sel:'button[onclick*="openThemeModal"]',title:'ธีม',body:'ปรับสี/พื้นหลังของระบบ (จำเฉพาะเครื่อง)'},
      END
    ],
    quotes:[
      {title:'หน้าใบเสนอราคา',body:'รวมใบเสนอราคาทั้งหมด ใช้ค้นหา จัดกลุ่ม และเข้าถึงทุกการกระทำต่อใบ'},
      {sel:'#f-search',title:'ค้นหา',body:'พิมพ์เลขที่ใบหรือชื่อลูกค้าเพื่อค้นหา'},
      {sel:'#f-status',title:'กรองสถานะ',body:'Draft / Pending / Approved / Rejected / Cancelled'},
      {sel:'#page-quotes .btn-primary',title:'สร้างใหม่',body:'เริ่มใบเสนอราคาใบใหม่'},
      {sel:'#basket-bar',title:'ตะกร้า',body:'รวมหลายใบเข้ากลุ่มเดียวเพื่อจัดการพร้อมกัน'},
      {sel:'#quotes-body',title:'ตารางใบเสนอราคา',body:'แต่ละแถวแสดง เลขที่ · ลูกค้า · Tag · วันที่ · มูลค่า · วิธีชำระ · สถานะ · ชำระเงิน · ติดตาม และไอคอนจัดการท้ายแถว (เลื่อนเมาส์เพื่อดูคำอธิบายแต่ละปุ่ม)'},
      {sel:'#quotes-body button[onclick*="openApproveModal"]',title:'👁 ดูรายละเอียด',body:'เปิดดูใบเสนอราคาแบบเต็ม (ข้อมูล รายการ ยอดรวม สถานะ)'},
      {sel:'#quotes-body button[onclick*="editQuote"]',title:'✏️ แก้ไข',body:'แก้ไขใบนี้ — แสดงเฉพาะใบที่ยังแก้ได้ (ไม่ใช่ Approved/ยกเลิก/ปิด/รับ PO แล้ว)'},
      {sel:'#quotes-body button[onclick*="showPDFForQuote"]',title:'📄 PDF',body:'เปิด/พิมพ์ใบเสนอราคาเป็น PDF'},
      {sel:'#quotes-body button[onclick*="openBasketAssign"]',title:'🗂 จัดเข้าตะกร้า',body:'จัดใบนี้เข้ากลุ่ม/ตะกร้าเพื่อจัดหมวดและค้นหาง่าย'},
      {sel:'#quotes-body button[onclick*="duplicateQuote"]',title:'🔁 สร้างใหม่จากใบนี้',body:'คัดลอกเป็นใบใหม่ (เลข QT ใหม่) สำหรับลูกค้าซื้อซ้ำ — แสดงเฉพาะใบที่ปิดการขาย/รับ PO แล้ว'},
      {sel:'#quotes-body button[onclick*="reviseQuote"]',title:'↩ Revise',body:'สร้างใบแก้ไขใหม่ — แสดงเฉพาะใบที่ถูกยกเลิก'},
      {sel:'#quotes-body button[onclick*="cancelQuote"]',title:'🗑 ลบ / ยกเลิก',body:'Draft = ลบทิ้ง · ใบสถานะอื่น = ยกเลิกใบ'},
      {sel:'#quotes-body button[onclick*="openSaleTrackerModal"]',title:'🕐 คอลัมน์ “ติดตาม”',body:'ปุ่มนี้เปลี่ยนตามสถานะดีล: “ติดตาม” (ยังไม่ปิดการขาย) · “ประวัติ” (กำลังดำเนินการ) · “ปิดแล้ว” — กดเพื่อเปิด Sale Tracker ที่รวมงานหลังการขายทั้งหมด'},
      {title:'เปิด Sale Tracker เพื่อดูต่อ',body:'ในนั้นมีหลายแท็บ (PO ลูกค้า · ออกเอกสาร · แจ้งจัดซื้อ · ช่างติดตั้ง · ชำระเงิน · ค่าใช้จ่าย · เอกสาร) — ทัวร์เฉพาะของ Sale Tracker จะเด้งอัตโนมัติเมื่อเปิดครั้งแรก'},
      END
    ],
    newquote:[
      {title:'สร้างใบเสนอราคา',body:'หน้านี้รวมเครื่องมือทั้งหมด — ทัวร์นี้จะพาชมทีละปุ่ม ไม่เว้นแม้แต่ตัวเล็ก ๆ'},
      {sel:'#nq-zone-info .card-header h3',title:'ข้อมูลหัวใบ',body:'การ์ดแรก: ข้อมูลใบ ลูกค้า และผู้จัดทำ'},
      {sel:'button[onclick*="openCustomerPicker"]',title:'เลือกลูกค้า',body:'ดึงชื่อ/ที่อยู่/เลขภาษี/ผู้ติดต่อจากฐานลูกค้าอัตโนมัติ'},
      {sel:'#q-client',title:'ชื่อลูกค้า',body:'พิมพ์เองได้ มีคำแนะนำอัตโนมัติระหว่างพิมพ์'},
      {sel:'#q-payment',title:'วิธีชำระเงิน',body:'เงินสด / โอน / เครดิต 30 / เครดิต 60 / Cheque'},
      {sel:'#q-validity',title:'อายุใบเสนอราคา',body:'เลือก 14–90 วัน ระบบคำนวณ “วันหมดอายุ” ให้อัตโนมัติในช่อง Expire'},
      {sel:'#q-sig-preview',title:'ลายเซ็นผู้จัดทำ',body:'อัปโหลดลายเซ็น หรือกด “ใช้ลายเซ็นเดิม” (ระบบจำไว้ให้)'},
      {sel:'#fs-info',title:'ปรับขนาดตัวอักษร',body:'สไลเดอร์นี้ย่อ/ขยายฟอนต์เฉพาะโซนหัวใบ (แต่ละโซนปรับแยกกันได้)'},
      {sel:'#nq-fab',title:'แถบเครื่องมือลอยตัว',body:'รวมปุ่มจัดการรายการทั้งหมด · ลากย้ายด้วย ⠿ และย่อ/ขยายด้วย ▾'},
      {sel:'button[onclick*="addItem"]',title:'เพิ่มรายการ',body:'เพิ่มแถวสินค้า/บริการเปล่า'},
      {sel:'button[onclick*="openCatalogPicker"]',title:'เลือกจาก Catalog',body:'ดึงสินค้าจากคลังพร้อมราคา/ต้นทุน'},
      {sel:'button[onclick*="addGroupRow"]',title:'เพิ่มหัวข้อกลุ่ม',body:'แถวหัวข้อสำหรับจัดกลุ่มรายการ'},
      {sel:'button[onclick*="addBlankRow"]',title:'เพิ่มบรรทัดว่าง',body:'เว้นบรรทัดให้อ่านง่าย/เติมช่องว่าง'},
      {sel:'button[onclick*="addNoteRow"]',title:'แทรกหมายเหตุ',body:'แถวข้อความอิสระแทรกกลางรายการ'},
      {sel:'button[onclick*="addPageBreak"]',title:'แทรกตัวแบ่งหน้า',body:'บังคับให้รายการถัดไปขึ้นหน้าใหม่ใน PDF'},
      {sel:'button[onclick*="toggleColPanel"]',title:'คอลัมน์',body:'เปิด/ปิดคอลัมน์ (Part No., จำนวน, หน่วย, ราคา/หน่วย, ส่วนลด%, รวม) และเส้นแบ่งคอลัมน์'},
      {sel:'button[onclick*="toggleSpacingPanel"]',title:'ระยะห่าง',body:'ปรับช่องไฟแถวและระยะบรรทัดของ PDF ให้พอดีหน้ากระดาษ'},
      {sel:'#price-period-sel',title:'งวดราคา',body:'หัวคอลัมน์ราคา: ราคา/หน่วย · ราคา/เดือน · ราคา/ปี'},
      {sel:'#g-disc',title:'ส่วนลดรวม',body:'ใส่ตัวเลข + เลือกหน่วย % หรือ ฿ ระบบคิดยอดให้ทันที'},
      {sel:'#t-grand',title:'ยอดรวมสุทธิ',body:'คำนวณ VAT 7% และยอดสุทธิให้อัตโนมัติ'},
      {sel:'button[onclick*="saveNoteTermsDefault"]',title:'หมายเหตุ (ตั้งค่าเริ่มต้น)',body:'พิมพ์หมายเหตุ และกด “💾 ตั้งเป็นค่าเริ่มต้น” เพื่อใช้ในใบใหม่ทุกครั้ง'},
      {sel:'#q-terms',title:'เงื่อนไขการชำระเงิน',body:'ข้อความเงื่อนไข (ตั้งค่าเริ่มต้นได้เช่นกัน)'},
      {sel:'#approver-box',title:'ผู้อนุมัติ',body:'ระบบเลือกผู้อนุมัติตามมูลค่าใบให้อัตโนมัติ · ถ้าขายต่ำกว่าทุนจะขึ้นแถบเตือนให้ขออนุมัติพิเศษ'},
      {sel:'button[onclick*="saveQuote(\'Draft\'"]',title:'บันทึก Draft',body:'เก็บเป็นฉบับร่าง แก้ต่อได้'},
      {sel:'button[onclick*="saveQuote(\'Pending\'"]',title:'ส่งอนุมัติ',body:'บันทึกและส่งเข้าคิวอนุมัติ'},
      {sel:'button[onclick*="previewPDF"]',title:'Preview PDF',body:'เปิดตัวอย่าง — สั่งพิมพ์/บันทึก PDF ได้จากหน้านั้น'},
      END
    ],
    approve:[
      {title:'หน้ารออนุมัติ',body:'สำหรับผู้มีสิทธิ์อนุมัติใบเสนอราคา'},
      {sel:'#approve-list',title:'รายการรออนุมัติ',body:'เปิดดูรายละเอียดแล้วกด ✓ อนุมัติ หรือ ✕ ปฏิเสธ · เคส “ขายต่ำกว่าทุน” จะมีกล่องอนุมัติแยกต่างหาก'},
      END
    ],
    payment:[
      {title:'หน้าติดตามชำระเงิน',body:'รวมใบที่ต้องเก็บเงิน'},
      {sel:'#payment-list',title:'รายการเก็บเงิน',body:'กด “+ บันทึกชำระ” เพื่อใส่ยอด/วันที่/วิธีชำระ/เลขอ้างอิง และแนบสลิป (รองรับหัก ณ ที่จ่าย)'},
      END
    ],
    catalog:[
      {title:'หน้า Catalog สินค้า',body:'คลังสินค้า/บริการที่ดึงไปใช้ในใบเสนอราคา'},
      {sel:'#cat-search',title:'ค้นหาสินค้า',body:'ค้นด้วยชื่อ/Part No.'},
      {sel:'#cat-filter',title:'กรองหมวดหมู่',body:'Hardware / Software / Service / Consumable'},
      {sel:'#cat-grid',title:'รายการสินค้า',body:'การ์ดสินค้าพร้อมราคา · หมายเหตุ: การจัดการราคาทุนทำที่ PurchasePro'},
      END
    ],
    customers:[
      {title:'หน้าลูกค้า (CRM)',body:'ฐานข้อมูลลูกค้าสำหรับออกใบ'},
      {sel:'#cust-search',title:'ค้นหาลูกค้า',body:'ค้นด้วยชื่อ/บริษัท'},
      {sel:'button[onclick*="openAddCustomer"]',title:'เพิ่มลูกค้าใหม่',body:'บันทึก รหัส/ชื่อ/ผู้ติดต่อ/เลขภาษี/ที่อยู่ออกบิล'},
      {sel:'#customers-body',title:'ตารางลูกค้า',body:'แต่ละแถวแก้ไข/ลบได้ และถูกดึงไปใช้ตอน “เลือกลูกค้า” ในใบเสนอราคา'},
      END
    ],
    forecast:[
      {title:'หน้า Sale Forecast',body:'ตารางพยากรณ์ยอดขาย/โอกาสทางธุรกิจ'},
      {sel:'#fc-search',title:'ค้นหา',body:'ค้นด้วยลูกค้า/โปรเจกต์'},
      {sel:'#fc-filter-status',title:'กรองสถานะ',body:'กรองตามสถานะโอกาสการขาย'},
      {sel:'button[onclick*="exportForecastCSV"]',title:'Export CSV',body:'ดาวน์โหลดเปิดใน Excel'},
      {sel:'button[onclick*="addForecastRow"]',title:'เพิ่มรายการ',body:'เพิ่มแถวพยากรณ์ใหม่'},
      {sel:'#forecast-body',title:'ตารางพยากรณ์',body:'แก้ไขค่าต่าง ๆ ได้ในตารางโดยตรง (มูลค่า One Time/รายปี/รายเดือน ฯลฯ)'},
      END
    ],
    vendor:[
      {title:'หน้า Vendor',body:'ข้อมูลผู้ขาย/ซัพพลายเออร์'},
      {sel:'#vd-search',title:'ค้นหา Vendor',body:'ค้นด้วยชื่อผู้ขาย'},
      {sel:'button[onclick*="openAddVendor"]',title:'เพิ่ม Vendor',body:'บันทึกชื่อ/ผู้ติดต่อ/เบอร์/อีเมล + แนบสัญญา'},
      {sel:'#vendor-body',title:'ตาราง Vendor',body:'แก้ไข/ลบ และแนบเอกสารสัญญาได้'},
      END
    ],
    contracts:[
      {title:'หน้าทะเบียนสัญญา',body:'งานต่อเนื่อง/สัญญารายปี พร้อมระบบเตือนก่อนหมดอายุ'},
      {sel:'#ct-reminders',title:'เตือนใกล้หมดอายุ',body:'แถบแจ้งสัญญาที่ใกล้ครบกำหนด'},
      {sel:'#ct-search',title:'ค้นหา',body:'ค้นด้วยคู่สัญญา/ชื่อสัญญา/PO'},
      {sel:'#ct-filter-status',title:'กรองสถานะ',body:'ปกติ / ใกล้หมดอายุ / หมดอายุ'},
      {sel:'button[onclick*="openContractImport"]',title:'นำเข้าจาก Excel',body:'วางข้อมูลจาก Excel/Sheets เข้ามาทีเดียว'},
      {sel:'button[onclick*="openAddContract"]',title:'เพิ่มสัญญา',body:'ผูกได้หลายใบเสนอราคา ตั้งเตือนล่วงหน้า + อีเมลผู้รับเตือน'},
      {sel:'#contracts-body',title:'ตารางสัญญา',body:'ดูวงเงิน เบิกจ่ายสะสม คงเหลือ และ %ใช้ไป (เบิกจ่ายดึงจากการชำระอัตโนมัติ)'},
      END
    ],
    company:[
      {title:'ตั้งค่าบริษัท (แอดมิน)',body:'ข้อมูล/รูปที่จะไปแสดงบนเอกสาร'},
      {sel:'#logo-preview',title:'Logo บริษัท',body:'อัปโหลดโลโก้สำหรับหัวเอกสาร'},
      {sel:'#coname-preview',title:'ภาพชื่อบริษัท',body:'ใช้ไฟล์ภาพชื่อบริษัท (PNG โปร่งใส) และปรับกว้าง/สูงให้พอดีฟอร์มจริง'},
      {sel:'#co-name',title:'ข้อมูลบริษัท',body:'ชื่อ (ไทย/อังกฤษ) ที่อยู่ เบอร์ แฟกซ์ เลขภาษี'},
      {sel:'#co-docno-format',title:'รูปแบบเลขที่เอกสาร',body:'กำหนดเองด้วย token เช่น TIS-{YY}{MM}-{NNNN} → TIS-2609-0026'},
      {sel:'#co-headerfs',title:'ขนาดฟอนต์หัวบริษัทใน PDF',body:'คุมขนาดชื่อ+ที่อยู่+เลขภาษีของเราบนเอกสาร'},
      {sel:'#color-swatches',title:'สีหลักของใบเสนอราคา',body:'เลือกสีสำเร็จหรือกำหนดเอง'},
      {sel:'#co-footer',title:'Footer มาตรฐาน',body:'ข้อความ/เงื่อนไขท้ายเอกสาร'},
      {sel:'button[onclick*="saveCompanySettings"]',title:'บันทึก',body:'กดเพื่อบันทึกการตั้งค่าทั้งหมด'},
      END
    ],
    settings:[
      {title:'Approve Settings (แอดมิน)',body:'ตั้งกติกาการอนุมัติ'},
      {sel:'button[onclick*="addApprovalTier"]',title:'เพิ่มระดับ',body:'เพิ่มช่วงวงเงินอนุมัติใหม่'},
      {sel:'#tiers-body',title:'ระดับการอนุมัติ',body:'กำหนดชื่อระดับ, ช่วงวงเงิน, ชื่อ+อีเมลผู้อนุมัติแต่ละระดับ — ระบบเลือกให้อัตโนมัติตามมูลค่าใบ'},
      {sel:'button[onclick*="saveApprovalTiers"]',title:'บันทึก Settings',body:'บันทึกระดับการอนุมัติ'},
      {sel:'#bc-approvers',title:'ผู้อนุมัติต่ำกว่าทุน',body:'ใส่อีเมลผู้อนุมัติ (คั่นด้วยจุลภาค) สำหรับเคสราคาต่ำกว่าทุน'},
      {sel:'button[onclick*="saveBelowCostApprovers"]',title:'บันทึกผู้อนุมัติ',body:'บันทึกรายชื่อผู้อนุมัติต่ำกว่าทุน'},
      END
    ],
    tracker:[
      {title:'Sale Tracker — งานหลังปิดการขาย',body:'ศูนย์รวมทุกงานของดีลนี้ แยกเป็นหลายแท็บ — ทัวร์นี้พาชมทีละแท็บและเครื่องมือ'},
      {sel:'.st-tab[data-tab="timeline"]',before:sw('timeline'),title:'Timeline / Notes',body:'บันทึกโน้ตและดูประวัติทุกความเคลื่อนไหวของดีล'},
      {sel:'#st-note-input',before:sw('timeline'),title:'เพิ่มโน้ต',body:'พิมพ์บันทึกแล้วกดบันทึก จะถูกเก็บไว้ใน Timeline'},
      {sel:'#st-followup-btn',title:'ตั้งติดตาม / ต่อสัญญา',body:'ตั้งวันแจ้งเตือน (เช่น ต่อสัญญา) ระบบจะส่งเมลอัตโนมัติเมื่อถึงกำหนด'},
      {sel:'.st-tab[data-tab="custpo"]',before:sw('custpo'),title:'PO ลูกค้า + ออกเอกสาร',body:'บันทึกเลข PO + แนบไฟล์ · ออกเอกสารให้ลูกค้า: ใบกำกับภาษี / ใบส่งของ+ใบแจ้งหนี้ / ใบเสร็จ / ใบส่งของชั่วคราว (ทั้งต้นฉบับและสำเนา) · ไม่มี PO จริงก็ขอ “ข้ามการรับ PO” ได้'},
      {sel:'.st-tab[data-tab="procurement"]',before:sw('procurement'),title:'แจ้งจัดซื้อ',body:'เลือก Vendor/รายการ (ราคา=ต้นทุน) แล้วส่งให้ทีมจัดซื้อไปทำต่อใน PurchasePro'},
      {sel:'.st-tab[data-tab="tech"]',before:sw('tech'),title:'ช่างติดตั้ง',body:'มอบหมายงานช่าง (ส่งเข้า Tech Portal) — ชื่อ/อีเมลช่าง, วันเวลา, แผนที่, วัสดุ'},
      {sel:'.st-tab[data-tab="payment"]',before:sw('payment'),title:'บันทึกชำระ',body:'กำหนดวันครบชำระ ดูประวัติ และบันทึกการรับเงิน'},
      {sel:'#st-pay-amount',before:sw('payment'),title:'จำนวนเงิน',body:'ใส่ยอดที่รับ + วันที่ + วิธีชำระ + เลขอ้างอิง'},
      {sel:'#st-pay-wht',before:sw('payment'),title:'หัก ณ ที่จ่าย',body:'ใส่ % หรือกดปุ่มลัด 3% ระบบคิด “ยอดรับจริง” ให้อัตโนมัติ'},
      {sel:'#st-slip-drop',before:sw('payment'),title:'แนบสลิป',body:'คลิกหรือลากสลิป/หลักฐานการชำระมาวาง'},
      {sel:'#st-pay-submit-btn',before:sw('payment'),title:'บันทึกการชำระ',body:'กดเพื่อบันทึก — เมื่อชำระครบ ระบบปิดดีลให้อัตโนมัติ'},
      {sel:'.st-tab[data-tab="expense"]',before:sw('expense'),title:'ค่าใช้จ่าย',body:'บันทึกต้นทุนโครงการ (เดินทาง/ที่พัก/ค่าแรงช่าง ฯลฯ) + แนบใบเสร็จ · รวมค่าใช้จ่ายฝั่งช่างให้ด้วย'},
      {sel:'.st-tab[data-tab="docs"]',before:sw('docs'),title:'เอกสาร',body:'เช็กลิสต์เอกสารส่งมอบ + อัปโหลดไฟล์แนบเข้าดีล'},
      {sel:'#st-drop-zone',before:sw('docs'),title:'อัปโหลดเอกสาร',body:'คลิกหรือลากไฟล์มาวางเพื่อแนบ'},
      {sel:'#st-close-deal-btn',before:sw('timeline'),title:'ปิดการขาย',body:'เมื่อครบเงื่อนไข ปุ่มนี้จะโผล่ให้กดปิดดีล (ถ้ายังไม่ขึ้น = ยังมีขั้นตอนค้างอยู่)'},
      {before:sw('timeline'),link:true,title:'จบทัวร์ Sale Tracker 🎉',body:'กด 🧭 บนหัวหน้าต่างนี้เพื่อดูซ้ำได้ · เปิดคู่มือฉบับเต็มสำหรับรายละเอียดเพิ่มเติม'}
    ]
  };

  // ---------- engine ----------
  var CUR=null, PAGEKEY='dashboard', idx=0, els={}, _page='dashboard';
  function KEY(pk){ var em=((typeof currentUser!=='undefined'&&currentUser&&currentUser.email)||'').toLowerCase(); return 'TourSeen_'+APP+'_'+pk+'_'+em+'_'+VER; }
  function seen(pk){ try{ if(localStorage.getItem(KEY(pk)))return true; }catch(e){} return !!GET(KEY(pk)); }
  function markSeen(pk){ try{ localStorage.setItem(KEY(pk),'1'); }catch(e){} PUT(KEY(pk), new Date().toISOString()); }

  function ensureDom(){
    if(els.blocker) return;
    var css=document.createElement('style');
    css.textContent=''
      +'#itsv-tour-blocker{position:fixed;inset:0;z-index:99998;background:transparent}'
      +'#itsv-tour-ring{position:fixed;z-index:99999;border-radius:10px;border:2px solid #fff;pointer-events:none;'
      +'box-shadow:0 0 0 9999px rgba(15,23,42,.62);transition:top .2s,left .2s,width .2s,height .2s}'
      +'#itsv-tour-card{position:fixed;z-index:100000;max-width:330px;width:calc(100vw - 32px);'
      +'background:#fff;color:#17233f;border-radius:14px;padding:16px 18px 14px;'
      +'box-shadow:0 16px 48px rgba(0,0,0,.4);font-family:"IBM Plex Sans Thai","Sarabun",sans-serif}'
      +'#itsv-tour-card h4{margin:0 30px 6px 0;font-size:16px;font-weight:700}'
      +'#itsv-tour-card p{margin:0;font-size:14px;line-height:1.6;color:#41506a}'
      +'#itsv-tour-x{position:absolute;top:10px;right:12px;border:none;background:none;font-size:18px;line-height:1;color:#9aa3b2;cursor:pointer;padding:2px 4px}'
      +'#itsv-tour-card .tlink{display:inline-block;margin-top:10px;font-size:13px;font-weight:600;'
      +'color:#17356b;text-decoration:none;border:1px solid #cdd6e6;border-radius:8px;padding:6px 12px}'
      +'#itsv-tour-foot{display:flex;align-items:center;gap:8px;margin-top:14px}'
      +'#itsv-tour-prog{font-size:12px;color:#8b93a3;font-family:monospace}'
      +'#itsv-tour-foot .sp{flex:1}'
      +'#itsv-tour-card button.nav{font-family:inherit;cursor:pointer;border-radius:8px;font-size:13px;font-weight:600;padding:7px 14px;border:1px solid transparent}'
      +'.itsv-skip{background:none!important;color:#8b93a3!important}'
      +'.itsv-back{background:#eef1f6!important;color:#41506a!important}'
      +'.itsv-next{background:#17356b!important;color:#fff!important}'
      +'@media(prefers-color-scheme:dark){#itsv-tour-card{background:#1a2436;color:#e7ecf5}'
      +'#itsv-tour-card p{color:#aeb8ca}.itsv-back{background:#2a3752!important;color:#dce3f0!important}'
      +'#itsv-tour-card .tlink{color:#9dc0f5;border-color:#33415d}}';
    document.head.appendChild(css);
    var b=document.createElement('div'); b.id='itsv-tour-blocker';
    var r=document.createElement('div'); r.id='itsv-tour-ring';
    var c=document.createElement('div'); c.id='itsv-tour-card';
    b.appendChild(r); document.body.appendChild(b); document.body.appendChild(c);
    els={blocker:b,ring:r,card:c};
    b.addEventListener('click', function(e){ if(e.target===b) next(); });
    window.addEventListener('resize', reposition);
    document.addEventListener('keydown', onKey, true);
  }
  function onKey(e){ if(!isOpen())return; if(e.key==='Escape'){ e.preventDefault(); finish(); } else if(e.key==='ArrowRight'){ next(); } else if(e.key==='ArrowLeft'){ prev(); } }
  function isOpen(){ return els.blocker && els.blocker.style.display!=='none'; }

  function render(){
    var s=CUR[idx];
    if(s.before){ try{ s.before(); }catch(e){} }
    var el=s.sel?document.querySelector(s.sel):null;
    if(s.sel && (!el || el.offsetParent===null)){ if(idx<CUR.length-1){ idx++; return render(); } }
    var last=idx===CUR.length-1;
    els.card.innerHTML=''
      +'<button id="itsv-tour-x" title="ปิด">✕</button><h4></h4><p></p>'
      +(s.link?('<a class="tlink" href="'+MANUAL_URL+'" target="_blank" rel="noopener">📖 เปิดคู่มือฉบับเต็ม</a>'):'')
      +'<div id="itsv-tour-foot"><span id="itsv-tour-prog"></span><span class="sp"></span>'
      +(idx>0?'<button class="nav itsv-back">ย้อนกลับ</button>':'<button class="nav itsv-skip">ข้าม</button>')
      +'<button class="nav itsv-next">'+(last?'เสร็จสิ้น':'ถัดไป')+'</button></div>';
    els.card.querySelector('h4').textContent=s.title;
    els.card.querySelector('p').textContent=s.body;
    els.card.querySelector('#itsv-tour-prog').textContent=(idx+1)+' / '+CUR.length;
    els.card.querySelector('#itsv-tour-x').onclick=finish;
    var bk=els.card.querySelector('.itsv-back'), sk=els.card.querySelector('.itsv-skip');
    if(bk)bk.onclick=prev; if(sk)sk.onclick=finish;
    els.card.querySelector('.itsv-next').onclick=function(){ last?finish():next(); };
    place(el);
  }
  function place(el){ if(el){ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} } setTimeout(function(){ position(el); }, el?200:0); }
  function position(el){
    var r=els.ring, c=els.card;
    if(!el){ r.style.display='none'; els.blocker.style.background='rgba(15,23,42,.62)';
      c.style.left='50%'; c.style.top='50%'; c.style.transform='translate(-50%,-50%)'; return; }
    els.blocker.style.background='transparent'; r.style.display='block'; c.style.transform='none';
    var b=el.getBoundingClientRect(), pad=6;
    r.style.top=(b.top-pad)+'px'; r.style.left=(b.left-pad)+'px'; r.style.width=(b.width+pad*2)+'px'; r.style.height=(b.height+pad*2)+'px';
    var vw=innerWidth, vh=innerHeight, cw=Math.min(330,vw-32), ch=c.offsetHeight||190, gap=14, L, T;
    if(b.right+gap+cw <= vw-8){ L=b.right+gap; T=b.top; }
    else if(b.left-gap-cw >= 8){ L=b.left-gap-cw; T=b.top; }
    else if(b.bottom+gap+ch <= vh-8){ L=b.left; T=b.bottom+gap; }
    else { L=b.left; T=b.top-ch-gap; }
    L=Math.max(16,Math.min(L,vw-cw-16)); T=Math.max(16,Math.min(T,vh-ch-16));
    c.style.left=L+'px'; c.style.top=T+'px';
  }
  function reposition(){ if(!isOpen())return; var s=CUR[idx]; position(s.sel?document.querySelector(s.sel):null); }

  function open(steps,pk){ if(!steps||!steps.length)return; ensureDom(); CUR=steps; PAGEKEY=pk; idx=0; els.blocker.style.display='block'; els.card.style.display='block'; render(); }
  function next(){ if(idx<CUR.length-1){ idx++; render(); } else finish(); }
  function prev(){ if(idx>0){ idx--; render(); } }
  function close(){ if(els.blocker){ els.blocker.style.display='none'; els.card.style.display='none'; } }
  function finish(){ close(); try{ markSeen(PAGEKEY); }catch(e){}
    if(PAGEKEY==='tracker'){ try{ var b=document.querySelector('.st-tab[data-tab="timeline"]'); if(b&&typeof switchSTTab==='function') switchSTTab('timeline',b); }catch(e){} } }

  // ---------- triggers ----------
  function autoForPage(id){ if(TOURS[id] && !seen(id)) setTimeout(function(){ if(!isOpen()) open(TOURS[id],id); },550); }
  function patchShowPage(){
    if(typeof window.showPage!=='function' || window.showPage.__itsv) return;
    var orig=window.showPage;
    window.showPage=function(id,el){ orig(id,el); _page=id; try{ autoForPage(id); }catch(e){} };
    window.showPage.__itsv=true;
  }
  function patchTracker(){
    if(typeof window.openSaleTrackerModal!=='function' || window.openSaleTrackerModal.__itsv) return;
    var orig=window.openSaleTrackerModal;
    window.openSaleTrackerModal=function(){ var r=orig.apply(this,arguments);
      setTimeout(function(){ injectTrackerBtn(); if(!seen('tracker') && !isOpen()) open(TOURS.tracker,'tracker'); },700);
      return r; };
    window.openSaleTrackerModal.__itsv=true;
  }
  function injectTrackerBtn(){
    if(document.getElementById('itsv-tour-btn-st')) return;
    var fu=document.getElementById('st-followup-btn'); if(!fu) return;
    var btn=document.createElement('button');
    btn.id='itsv-tour-btn-st'; btn.className='btn btn-sm'; btn.title='แนะนำการใช้งาน Sale Tracker';
    btn.textContent='🧭';
    btn.onclick=function(){ open(TOURS.tracker,'tracker'); };
    fu.parentNode.insertBefore(btn, fu);
  }

  window.startAppTour=function(force){ var id=_page||'dashboard'; if(!TOURS[id])id='dashboard'; if(force||!seen(id)) open(TOURS[id],id); else if(typeof toast==='function') toast('ดูทัวร์หน้านี้แล้ว — กด 🧭 เพื่อดูซ้ำได้','info'); };

  window.maybeStartTour=function(){
    patchShowPage();
    patchTracker();
    injectBtn();
    // หน้าแรกหลังล็อกอินคือ Dashboard (active อยู่แล้ว ไม่ผ่าน showPage)
    _page=(document.querySelector('.page.active')||{}).id ? document.querySelector('.page.active').id.replace('page-','') : 'dashboard';
    try{ autoForPage(_page); }catch(e){}
  };

  function injectBtn(){
    if(document.getElementById('itsv-tour-btn')) return;
    var anchor=document.getElementById('topbar-btn') || document.querySelector('.topbar');
    if(!anchor) return;
    var btn=document.createElement('button');
    btn.id='itsv-tour-btn'; btn.className='btn btn-sm'; btn.title='แนะนำการใช้งานหน้านี้';
    btn.textContent='🧭'; btn.style.marginInlineStart='6px';
    btn.onclick=function(){ window.startAppTour(true); };
    (anchor.parentNode||document.body).insertBefore(btn, anchor.nextSibling);
  }
})();
