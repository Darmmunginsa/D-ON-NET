// In-app document preview; opening a file never changes the job record.
const TechDocumentPreview=(()=>{
  let overlay=null,previousFocus=null,navigate=null,updating=false;
  function close(){if(updating)return;navigate=null;if(overlay)overlay.remove();overlay=null;document.removeEventListener('keydown',onKey);previousFocus?.focus();previousFocus=null;}
  function onKey(e){
    if(e.key==='Escape'){e.stopPropagation();close();}
    if(!navigate||e.target?.tagName==='SELECT')return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      e.preventDefault();
      navigate(e.key==='ArrowLeft'?-1:1);
    }
  }
  function open(raw,name,image=false,gallery=null){
    let url;try{url=new URL(raw,location.href);if(!['https:','http:'].includes(url.protocol))return false;}catch{return false;}
    close();previousFocus=document.activeElement;
    overlay=document.createElement('div');overlay.id='tech-document-preview';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',name||'ดูไฟล์แนบ');
    overlay.style.cssText='position:fixed;inset:0;z-index:100010;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:10px';
    const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;gap:14px;color:white;width:min(94vw,1000px)';
    const title=document.createElement('span');title.textContent=name||'ไฟล์แนบ';title.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const link=document.createElement('a');link.textContent='เปิดแท็บใหม่ ↗';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.style.color='#9ec1ff';
    const button=document.createElement('button');button.type='button';button.textContent='✕ ปิด';button.onclick=close;button.style.cssText='padding:8px 12px;cursor:pointer;border-radius:6px;border:1px solid #cbd5e1';
    header.append(title,link,button);overlay.append(header);
    function show(entry){
      const source=new URL(entry.href,location.href);
      const driveId=source.hostname==='drive.google.com'
        ? (source.pathname.match(/\/d\/([-\w]{10,})/)?.[1]||source.searchParams.get('id'))
        : null;
      const next=document.createElement(driveId||!image?'iframe':'img');
      next.src=driveId?'https://drive.google.com/file/d/'+encodeURIComponent(driveId)+'/preview':source.href;
      if(next.tagName==='IMG'){
        next.alt=entry.name||'รูปงาน';
        next.style.cssText='max-width:94vw;max-height:100%;object-fit:contain;border-radius:8px;background:white';
      }else{
        next.title=entry.name||'ดูไฟล์แนบ';
        next.style.cssText='width:min(94vw,1000px);height:100%;border:0;border-radius:8px;background:white';
      }
      title.textContent=entry.name||'ไฟล์แนบ';
      link.href=source.href;
      content.replaceChildren(next);
    }
    const content=document.createElement('div');
    content.style.cssText='width:min(94vw,1000px);height:82vh;min-height:0;display:grid;place-items:center';
    overlay.append(content);
    if(gallery){
      const toolbar=document.createElement('div');
      toolbar.style.cssText='display:flex;flex-wrap:wrap;justify-content:center;gap:8px;align-items:center;color:white;max-width:94vw';
      const makeButton=(label)=>{
        const control=document.createElement('button');
        control.type='button';
        control.className='btn btn-sm';
        control.textContent=label;
        toolbar.append(control);
        return control;
      };
      const prev=makeButton('← ก่อนหน้า');
      const count=document.createElement('span');
      count.setAttribute('role','status');
      toolbar.append(count);
      const next=makeButton('ถัดไป →');
      const closeButton=button;
      let index=gallery.index;
      const select=gallery.entries.some(entry=>gallery.options.destinations(entry.href).length)?document.createElement('select'):null;
      let move;
      if(select){
        select.className='form-control';
        select.style.width='auto';
        select.setAttribute('aria-label','Serial ปลายทาง');
        toolbar.append(select);
        move=makeButton('ย้ายรูป');
      }
      const remove=makeButton('ลบรูปจากงาน');
      function refresh(){
        show(gallery.entries[index]);
        count.textContent=(index+1)+' / '+gallery.entries.length;
        prev.disabled=index===0;
        next.disabled=index===gallery.entries.length-1;
        if(select){
          const destinations=gallery.options.destinations(gallery.entries[index].href);
          select.replaceChildren(new Option('เลือก Serial ปลายทาง',''),...destinations.map(serial=>new Option(serial,serial)));
          select.disabled=destinations.length===0;
          move.disabled=true;
        }
      }
      navigate=step=>{
        if(updating)return;
        const target=index+step;
        if(target<0||target>=gallery.entries.length)return;
        index=target;
        refresh();
      };
      prev.onclick=()=>navigate(-1);
      next.onclick=()=>navigate(1);
      if(select)select.onchange=()=>{move.disabled=!select.value;};
      async function change(removed){
        if(updating)return;
        const entry=gallery.entries[index];
        const controls=[prev,next,remove,closeButton,...(select?[select,move]:[])];
        const disabled=controls.map(control=>control.disabled);
        updating=true;
        controls.forEach(control=>control.disabled=true);
        let done=false;
        try{
          done=await (removed?gallery.options.remove(entry.href,[]):gallery.options.move(entry.href,select.value,[]));
        }catch(error){
          toast('จัดการรูปไม่สำเร็จ: '+error.message,'error');
        }finally{
          updating=false;
          controls.forEach((control,i)=>control.disabled=disabled[i]);
        }
        if(!done)return;
        gallery.source.dispatchEvent(new CustomEvent('tech-photo-change',{detail:{removed,url:entry.href}}));
        gallery.entries.splice(index,1);
        if(!gallery.entries.length){close();return;}
        index=Math.min(index,gallery.entries.length-1);
        refresh();
      }
      remove.onclick=()=>change(true);
      if(move)move.onclick=()=>{if(select.value)change(false);};
      overlay.append(toolbar);
      refresh();
    }else show({href:url.href,name});
    overlay.onclick=e=>{if(e.target===overlay)close();};
    document.body.append(overlay);
    document.addEventListener('keydown',onKey);
    button.focus();
    return true;
  }
  document.addEventListener('click',e=>{
    const link=e.target.closest?.('a[data-tech-preview]');
    if(!link)return;
    const image=link.dataset.techPreview==='image';
    const source=image&&link.closest('[data-photo-job]');
    let gallery=null;
    if(source&&typeof jobPhotoPreviewOptions==='function'){
      const options=jobPhotoPreviewOptions(source.dataset.photoJob);
      if(options){
        const links=[...source.querySelectorAll('a[data-tech-preview="image"]')];
        const entries=links.map(anchor=>({href:anchor.href,name:anchor.dataset.previewName}));
        gallery={source,options,entries,index:links.indexOf(link)};
      }
    }
    if(open(link.href,link.dataset.previewName,image,gallery))e.preventDefault();
  });
  return {open,close};
})();
