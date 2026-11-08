(function(root){'use strict';
 let dbPromise;
 function database(){return dbPromise||(dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('donnet-local-first-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('records',{keyPath:'key'});req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db);};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('ปิดแท็บ SalePro อื่นก่อนอัปเดตข้อมูลในเครื่อง'));}));}
 async function open(namespace){const db=await database(),prefix=namespace+'|';
   function run(mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),store=tx.objectStore('records');let value;try{work(store,v=>value=v);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error||Error('บันทึกข้อมูลในเครื่องไม่สำเร็จ'));tx.onerror=()=>reject(tx.error);});}
   return {get:key=>run('readonly',(s,done)=>{const q=s.get(prefix+key);q.onsuccess=()=>done(q.result?.value);}),put:(key,value)=>run('readwrite',s=>s.put({key:prefix+key,value})),remove:key=>run('readwrite',s=>s.delete(prefix+key)),all:key=>run('readonly',(s,done)=>{const q=s.getAll(IDBKeyRange.bound(prefix+key,prefix+key+'\uffff'));q.onsuccess=()=>done(q.result.map(r=>r.value));})};
 }
 root.LocalFirstIDB={open};
})(globalThis);
