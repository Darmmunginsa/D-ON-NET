// Reusable service lines live in the existing Catalog, Category=Service.
const ServiceCatalogDraft=(()=>{
  function reusable(value){return String(value||'').split(/\r?\n/).filter(line=>!/(?:\bs\s*\/\s*n\b|\bserial\b|หมายเลขเครื่อง)/i.test(line)).join('\n').trim();}
  function fromItem(item){
    if(!item||item.type!=='item'||item.asHeader)throw Error('เลือกรายการงานปกติที่ต้องการเก็บ');
    return {Title:reusable(item.name),Description:reusable(item.desc),PartNumber:reusable(item.pn),Unit:String(item.unit||'งาน'),Price:item.price,Cost:Number(item.cost)||0};
  }
  function fields(draft){
    const title=String(draft.Title||'').trim(),price=Number(draft.Price),cost=Number(draft.Cost||0);
    if(!title||title.length>500)throw Error('กรุณาระบุชื่องานไม่เกิน 500 ตัวอักษร');
    if(String(draft.Price).trim()===''||!Number.isFinite(price)||price<=0)throw Error('กรุณาระบุราคาอ้างอิงต่อหน่วยมากกว่า 0');
    if(!Number.isFinite(cost)||cost<0)throw Error('ต้นทุนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    return {Title:title,Category:'Service',Price:price,Cost:cost,Unit:String(draft.Unit||'งาน').trim(),PartNumber:String(draft.PartNumber||'').trim(),Description:String(draft.Description||'').trim(),CatalogStatus:'Active'};
  }
  return {fromItem,fields};
})();
let _serviceCatalogBusy=false;
function openServiceCatalogSave(id){
  try{
    const draft=ServiceCatalogDraft.fromItem(quoteItems.find(item=>String(item.id)===String(id)));
    for(const key of ['Title','Description','PartNumber','Unit','Price','Cost'])document.getElementById('svc-'+key).value=draft[key];
    document.getElementById('svc-status').textContent='';
    document.getElementById('svc-save').disabled=false;
    document.getElementById('service-catalog-dialog').showModal();document.getElementById('svc-Title').focus();
  }catch(e){toast(e.message,'error');}
}
async function saveServiceCatalog(){
  if(_serviceCatalogBusy)return;
  const status=document.getElementById('svc-status'),button=document.getElementById('svc-save');
  let created=false;
  try{
    const draft={};for(const key of ['Title','Description','PartNumber','Unit','Price','Cost'])draft[key]=document.getElementById('svc-'+key).value;
    const fields=ServiceCatalogDraft.fields(draft);
    _serviceCatalogBusy=true;button.disabled=true;status.textContent='กำลังตรวจรายการซ้ำและบันทึก…';
    const fresh=await getListItems(CONFIG.lists.catalog);
    if(fresh.some(p=>p.Category==='Service'&&CatalogPolicy.key(p.Title)===CatalogPolicy.key(fields.Title)))throw Error('มีงานชื่อนี้ในหมวด Service แล้ว กรุณาใช้รายการเดิมหรือเปลี่ยนชื่อให้แยกขอบเขตงาน');
    fields.SKU='SVC-'+crypto.randomUUID().slice(0,8).toUpperCase();
    await createListItem(CONFIG.lists.catalog,fields);created=true;
    catalogData=await getListItems(CONFIG.lists.catalog);renderCatalog();
    document.getElementById('service-catalog-dialog').close();toast('เก็บใน Catalog ประเภท Service แล้ว','success');
  }catch(e){status.textContent=created?'บันทึกแล้ว แต่โหลด Catalog ใหม่ไม่สำเร็จ กรุณาปิดหน้าต่างแล้วกด Sync ห้ามบันทึกซ้ำ':e.message;if(!created)button.disabled=false;}
  finally{_serviceCatalogBusy=false;}
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('service-catalog-dialog').addEventListener('cancel',event=>{if(_serviceCatalogBusy)event.preventDefault();});
});
