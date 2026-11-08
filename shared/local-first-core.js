(function(root){'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function valid(r,owner){return r&&r.schema===1&&r.owner===owner&&typeof r.draftId==='string'&&typeof r.revision==='string'&&Array.isArray(r.parents)&&r.parents.every(p=>typeof p==='string')&&['draft','submitted'].includes(r.kind)&&(r.kind==='submitted'||r.snapshot&&Array.isArray(r.snapshot.items)&&r.snapshot.fields);}
 function heads(records){const unique=new Map(records.map(r=>[r.revision,r])),parents=new Set([...unique.values()].flatMap(r=>r.parents));return [...unique.values()].filter(r=>!parents.has(r.revision));}
 function create({store,remote,owner,uuid,now=()=>new Date().toISOString(),changed=()=>{}}){
   let flushing=null,localTail=Promise.resolve();
   const all=async()=>(await store.all('revision:')).filter(v=>valid(v.record,owner));
   async function compact(){const values=await all(),keep=new Set(heads(values.map(v=>v.record)).map(r=>r.revision));for(const v of values)if(!keep.has(v.record.revision))await store.remove('revision:'+v.record.revision);}
   async function list(){const groups=new Map();for(const {record}of await all()){if(!groups.has(record.draftId))groups.set(record.draftId,[]);groups.get(record.draftId).push(record);}return [...groups].map(([id,revs])=>({id,heads:heads(revs)})).filter(g=>g.heads.some(r=>r.kind==='draft'));}
   function save(draftId,parents,snapshot,kind='draft',quoteId=''){
     const task=localTail.then(async()=>{const records=new Map((await all()).map(v=>[v.record.revision,v])),bases=new Set();for(const id of parents){const v=records.get(id);if(v?.dirty)(v.record.baseParents||v.record.parents).forEach(p=>bases.add(p));else bases.add(id);}const ancestry=new Set([...parents,...bases]);const record={schema:1,owner,draftId:draftId||uuid(),revision:uuid(),parents:[...ancestry],baseParents:[...bases],snapshot:copy(snapshot),kind,quoteId,at:now()};await store.put('revision:'+record.revision,{record,dirty:true});await compact();changed();return record;});localTail=task.catch(()=>{});return task;
   }
   async function ingest(rows){for(const record of rows){if(!valid(record,owner))continue;const key='revision:'+record.revision,old=await store.get(key);if(!old)await store.put(key,{record:copy(record),dirty:false});else if(old.dirty)await store.put(key,{...old,dirty:false});}}
   async function flush(){if(flushing)return flushing;flushing=(async()=>{await localTail;const response=await remote.read(),rows=Array.isArray(response)?response:response.records;await ingest(rows);await compact();if(!Array.isArray(response)&&response.cursor!==undefined)await store.put('cursor',response.cursor);const known=new Set(rows.filter(r=>valid(r,owner)).map(r=>r.revision));for(const value of await all()){if(!value.dirty)continue;const r=value.record;if(!known.has(r.revision)){await remote.append(r);known.add(r.revision);}const still=await store.get('revision:'+r.revision);if(still)await store.put('revision:'+r.revision,{record:r,dirty:false});changed();}changed();})();try{return await flushing;}finally{flushing=null;}}
   async function pending(){return (await all()).filter(v=>v.dirty).length;}
   return {list,save,flush,pending,ingest,all,cache:async(name,rows)=>{if(Array.isArray(rows))await store.put('cache:'+name,{at:now(),rows:copy(rows)});},cached:name=>store.get('cache:'+name)};
 }
 const api={create,heads,valid};if(typeof module==='object'&&module.exports)module.exports=api;else root.LocalFirstCore=api;
})(globalThis);
