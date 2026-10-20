// Durable, per-profile drafts survive a tab closing before a remote save completes.
// Remote writes for each setting key are serialized to avoid duplicate creates/stale updates.
const BasketPersistence = (() => {
  const queues=new Map(),drafts=new Map();let pending=0;
  const prefix='donnet:basket-draft:';
  function read(key){if(drafts.has(key))return drafts.get(key);try{const raw=AppStorage.getItem(prefix+key);if(raw)return JSON.parse(raw);}catch(e){}return null;}
  function store(key,record){drafts.set(key,record);try{AppStorage.setItem(prefix+key,JSON.stringify(record));}catch(e){/* Remote save remains available if browser storage is full/disabled. */}}
  function save(key,value,write){
    const record={value,dirty:true,version:Date.now()+':'+Math.random()};store(key,record);pending++;
    const previous=queues.get(key)||Promise.resolve();
    const task=previous.catch(()=>{}).then(()=>write(key,value)).then(()=>{const latest=read(key);if(latest&&latest.version===record.version)store(key,{...record,dirty:false});});
    const tracked=task.finally(()=>{pending--;if(queues.get(key)===tracked)queues.delete(key);});queues.set(key,tracked);return tracked;
  }
  function load(key,remote,fallback){const draft=read(key);return draft&&draft.dirty?draft.value:(remote||fallback);}
  async function idle(){await Promise.allSettled([...queues.values()]);}
  async function retry(keys,write){await idle();for(const key of keys){const draft=read(key);if(draft&&draft.dirty)await save(key,draft.value,write);}}
  if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
  return {save,load,retry,idle};
})();
