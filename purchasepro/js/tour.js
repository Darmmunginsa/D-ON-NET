// ============================================================
// In-App Tour (แนะนำการใช้งานสำหรับผู้ใช้ใหม่)
// เด้งครั้งแรกที่เข้าใช้งาน · กดข้าม/จบแล้วจะไม่แสดงอีก (จำต่อผู้ใช้ใน SharePoint Settings)
// กดปุ่ม 🧭 บน topbar เพื่อดูทัวร์ซ้ำได้ทุกเมื่อ
// ============================================================
(function(){
  var APP='PurchasePro';
  var MANUAL_URL='https://claude.ai/artifact/QkGQaHq4qKg3PLQrfU7H41'; // คู่มือฉบับเต็ม (ละเอียด)
  var SEEN_VER='v1';

  // ปรับให้เข้ากับตัวช่วย Settings ของ PurchasePro
  function GET(k){ try{ return (typeof _getSettingVal==='function')?_getSettingVal(k):''; }catch(e){ return ''; } }
  function PUT(k,v){ try{ if(typeof putSetting==='function') return putSetting(k,v); }catch(e){} }

  var STEPS=[
    {title:'ยินดีต้อนรับสู่ PurchasePro 👋',
     body:'ทัวร์สั้น ๆ พาชมเมนูหลักทีละจุด ใช้เวลาไม่ถึง 1 นาที — กด “ถัดไป” เพื่อเริ่ม หรือ “ข้าม” ได้ตลอด'},
    {sel:'[data-page="purchases"]', title:'งานจัดซื้อ',
     body:'งานที่ทีมขายส่งมาจะเข้ามาที่นี่ ทำงานตามขั้นตอน 1–8 (รับงาน → ขอราคา → เทียบราคา → ออก PO → จ่าย → ส่ง → รับของ) หรือกด “+ สร้างงานจัดซื้อเอง” ได้'},
    {sel:'[data-page="catalog"]', title:'Catalog สินค้า',
     body:'คลังสินค้า ราคาทุน/ขาย และ Part No. — ดึงไปใช้ในงานจัดซื้อได้'},
    {sel:'[data-page="vendors"]', title:'Vendor (ผู้ขาย)',
     body:'ข้อมูลผู้ขาย รวมชื่อ ที่อยู่ และอีเมล — ต้องมีอีเมลจึงจะส่งขอราคา (RFQ) ได้'},
    {sel:'[data-page="settings"]', title:'ตั้งค่าบริษัท',
     body:'อัปโหลดโลโก้ ตราประทับ และลายเซนผู้อนุมัติ ที่จะไปแสดงบนใบสั่งซื้อ (PO)'},
    {sel:'button[onclick*="syncAll"]', title:'ซิงก์ข้อมูล',
     body:'กด Sync เพื่อดึงข้อมูลล่าสุดจาก SharePoint (แชร์ชุดเดียวกับ SalePro)'},
    {title:'พร้อมเริ่มใช้งานแล้ว! 🎉',
     body:'อยากดูรายละเอียดทุกปุ่มแบบเต็ม เปิดคู่มือได้เลย และกดปุ่ม 🧭 มุมบนขวาเพื่อดูทัวร์นี้ซ้ำได้ทุกเมื่อ',
     link:true}
  ];

  // ---------- engine ----------
  var idx=0, els={};
  function KEY(){ var em=((typeof currentUser!=='undefined'&&currentUser&&currentUser.email)||'').toLowerCase(); return 'TourSeen_'+APP+'_'+em+'_'+SEEN_VER; }
  function seen(){ try{ if(localStorage.getItem(KEY()))return true; }catch(e){} return !!GET(KEY()); }
  function markSeen(){ try{ localStorage.setItem(KEY(),'1'); }catch(e){} PUT(KEY(), new Date().toISOString()); }

  function ensureDom(){
    if(els.blocker) return;
    var css=document.createElement('style');
    css.textContent=''
      +'#itsv-tour-blocker{position:fixed;inset:0;z-index:99998;background:transparent}'
      +'#itsv-tour-ring{position:fixed;z-index:99999;border-radius:10px;border:2px solid #fff;pointer-events:none;'
      +'box-shadow:0 0 0 9999px rgba(15,23,42,.62);transition:top .2s,left .2s,width .2s,height .2s}'
      +'#itsv-tour-card{position:fixed;z-index:100000;max-width:320px;width:calc(100vw - 32px);'
      +'background:#fff;color:#17233f;border-radius:14px;padding:16px 18px 14px;'
      +'box-shadow:0 16px 48px rgba(0,0,0,.4);font-family:"IBM Plex Sans Thai","Sarabun",sans-serif}'
      +'#itsv-tour-card h4{margin:0 0 6px;font-size:16px;font-weight:700}'
      +'#itsv-tour-card p{margin:0;font-size:14px;line-height:1.6;color:#41506a}'
      +'#itsv-tour-card .tlink{display:inline-block;margin-top:10px;font-size:13px;font-weight:600;'
      +'color:#17356b;text-decoration:none;border:1px solid #cdd6e6;border-radius:8px;padding:6px 12px}'
      +'#itsv-tour-foot{display:flex;align-items:center;gap:8px;margin-top:14px}'
      +'#itsv-tour-prog{font-size:12px;color:#8b93a3;font-family:monospace}'
      +'#itsv-tour-foot .sp{flex:1}'
      +'#itsv-tour-card button{font-family:inherit;cursor:pointer;border-radius:8px;font-size:13px;font-weight:600;padding:7px 14px;border:1px solid transparent}'
      +'.itsv-skip{background:none;color:#8b93a3}'
      +'.itsv-back{background:#eef1f6;color:#41506a}'
      +'.itsv-next{background:#17356b;color:#fff}'
      +'@media(prefers-color-scheme:dark){#itsv-tour-card{background:#1a2436;color:#e7ecf5}'
      +'#itsv-tour-card p{color:#aeb8ca}.itsv-back{background:#2a3752;color:#dce3f0}'
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
    var s=STEPS[idx];
    var el=s.sel?document.querySelector(s.sel):null;
    if(s.sel && (!el || el.offsetParent===null)){
      if(idx<STEPS.length-1){ idx++; return render(); }
    }
    var last=idx===STEPS.length-1;
    els.card.innerHTML=''
      +'<h4></h4><p></p>'
      +(s.link?('<a class="tlink" href="'+MANUAL_URL+'" target="_blank" rel="noopener">📖 เปิดคู่มือฉบับเต็ม</a>'):'')
      +'<div id="itsv-tour-foot">'
      +'<span id="itsv-tour-prog"></span><span class="sp"></span>'
      +(idx>0?'<button class="itsv-back">ย้อนกลับ</button>':'<button class="itsv-skip">ข้าม</button>')
      +'<button class="itsv-next">'+(last?'เสร็จสิ้น':'ถัดไป')+'</button></div>';
    els.card.querySelector('h4').textContent=s.title;
    els.card.querySelector('p').textContent=s.body;
    els.card.querySelector('#itsv-tour-prog').textContent=(idx+1)+' / '+STEPS.length;
    var bk=els.card.querySelector('.itsv-back'), sk=els.card.querySelector('.itsv-skip');
    if(bk)bk.onclick=prev; if(sk)sk.onclick=finish;
    els.card.querySelector('.itsv-next').onclick=function(){ last?finish():next(); };
    place(el);
  }
  function place(el){
    if(el){ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }
    setTimeout(function(){ position(el); }, el?180:0);
  }
  function position(el){
    var r=els.ring, c=els.card;
    if(!el){
      r.style.display='none'; els.blocker.style.background='rgba(15,23,42,.62)';
      c.style.left='50%'; c.style.top='50%'; c.style.transform='translate(-50%,-50%)';
      return;
    }
    els.blocker.style.background='transparent'; r.style.display='block'; c.style.transform='none';
    var b=el.getBoundingClientRect(), pad=6;
    r.style.top=(b.top-pad)+'px'; r.style.left=(b.left-pad)+'px';
    r.style.width=(b.width+pad*2)+'px'; r.style.height=(b.height+pad*2)+'px';
    var vw=innerWidth, vh=innerHeight, cw=Math.min(320,vw-32), ch=c.offsetHeight||180, gap=14, L, T;
    if(b.right+gap+cw <= vw-8){ L=b.right+gap; T=b.top; }
    else if(b.bottom+gap+ch <= vh-8){ L=b.left; T=b.bottom+gap; }
    else { L=b.left; T=b.top-ch-gap; }
    L=Math.max(16,Math.min(L,vw-cw-16)); T=Math.max(16,Math.min(T,vh-ch-16));
    c.style.left=L+'px'; c.style.top=T+'px';
  }
  function reposition(){ if(!isOpen())return; var s=STEPS[idx]; position(s.sel?document.querySelector(s.sel):null); }

  function open(){ ensureDom(); idx=0; els.blocker.style.display='block'; els.card.style.display='block'; render(); }
  function next(){ if(idx<STEPS.length-1){ idx++; render(); } else finish(); }
  function prev(){ if(idx>0){ idx--; render(); } }
  function close(){ if(els.blocker){ els.blocker.style.display='none'; els.card.style.display='none'; } }
  function finish(){ close(); try{ markSeen(); }catch(e){} }

  // ---------- public ----------
  window.startAppTour=function(force){ if(force||!seen()) open(); else toastOnce(); };
  function toastOnce(){ if(typeof toast==='function') toast('คุณดูทัวร์นี้แล้ว — กด 🧭 เพื่อดูซ้ำได้','info'); }

  window.maybeStartTour=function(){ try{ if(!seen()) setTimeout(function(){ window.startAppTour(false); },700); }catch(e){} injectBtn(); };

  function injectBtn(){
    if(document.getElementById('itsv-tour-btn')) return;
    var anchor=document.querySelector('button[onclick*="syncAll"]') || document.querySelector('.topbar');
    if(!anchor) return;
    var btn=document.createElement('button');
    btn.id='itsv-tour-btn'; btn.className='btn btn-sm'; btn.title='แนะนำการใช้งาน';
    btn.textContent='🧭'; btn.style.marginInlineStart='6px';
    btn.onclick=function(){ open(); };
    (anchor.parentNode||document.body).insertBefore(btn, anchor.nextSibling);
  }
})();
