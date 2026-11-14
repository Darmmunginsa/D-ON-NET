// In-app document preview; opening a file never changes the job record.
const TechDocumentPreview=(()=>{
  let overlay=null,previousFocus=null;
  function close(){if(overlay)overlay.remove();overlay=null;document.removeEventListener('keydown',onKey);previousFocus?.focus();previousFocus=null;}
  function onKey(e){if(e.key==='Escape'){e.stopPropagation();close();}}
  function open(raw,name,image=false){
    let url;try{url=new URL(raw,location.href);if(!['https:','http:'].includes(url.protocol))return false;}catch{return false;}
    close();previousFocus=document.activeElement;
    overlay=document.createElement('div');overlay.id='tech-document-preview';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',name||'ดูไฟล์แนบ');
    overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:10px';
    const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;gap:14px;color:white;width:min(94vw,1000px)';
    const title=document.createElement('span');title.textContent=name||'ไฟล์แนบ';title.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const link=document.createElement('a');link.textContent='เปิดแท็บใหม่ ↗';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.style.color='#9ec1ff';
    const button=document.createElement('button');button.type='button';button.textContent='✕ ปิด';button.onclick=close;button.style.cssText='padding:8px 12px;cursor:pointer;border-radius:6px;border:1px solid #cbd5e1';
    header.append(title,link,button);overlay.append(header);
    const driveId=(url.href.match(/\/d\/([-\w]{10,})/)||url.href.match(/[?&]id=([-\w]{10,})/))?.[1];
    const viewer=document.createElement(driveId||!image?'iframe':'img');
    viewer.src=driveId?'https://drive.google.com/file/d/'+driveId+'/preview':url.href;
    if(viewer.tagName==='IMG'){viewer.alt=name||'รูปงาน';viewer.style.cssText='max-width:94vw;max-height:82vh;object-fit:contain;border-radius:8px;background:white';}
    else{viewer.title=name||'ดูไฟล์แนบ';viewer.style.cssText='width:min(94vw,1000px);height:82vh;border:0;border-radius:8px;background:white';}
    overlay.append(viewer);overlay.onclick=e=>{if(e.target===overlay)close();};document.body.append(overlay);document.addEventListener('keydown',onKey);button.focus();return true;
  }
  document.addEventListener('click',e=>{const link=e.target.closest?.('a[data-tech-preview]');if(!link)return;if(open(link.href,link.dataset.previewName,link.dataset.techPreview==='image'))e.preventDefault();});
  return {open,close};
})();
