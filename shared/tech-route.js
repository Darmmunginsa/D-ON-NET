(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TechRouteCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const text=v=>String(v??'').trim();
 function coordinates(value){const m=text(value).match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(!m)return null;const lat=Number(m[1]),lng=Number(m[2]);return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;}
 function mapPoint(value){try{const u=new URL(value);if(u.protocol!=='https:'||!/(^|\.)(google\.com|google\.co\.th|maps\.app\.goo\.gl|goo\.gl)$/.test(u.hostname))return '';for(const key of ['destination','query','q']){const v=u.searchParams.get(key);if(v&&!/^https?:/i.test(v)&&!v.startsWith('place_id:'))return v;}const m=u.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);return m&&coordinates(m[1]+','+m[2])?m[1]+','+m[2]:'';}catch{return '';}}
 function day(value){const s=text(value);if(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s)){const d=new Date(s);return Number.isFinite(d.getTime())?new Date(d.getTime()+7*3600000).toISOString().slice(0,10):'';}return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';}
 function today(){return day(new Date().toISOString());}
 function clock(value){const s=text(value);if(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s)){const d=new Date(s);return Number.isFinite(d.getTime())?new Date(d.getTime()+7*3600000).toISOString().slice(11,16):'';}return /T\d{2}:\d{2}/.test(s)?s.slice(11,16):'';}
 function key(item){return String(item.q?.id??item.quoteId)+'|'+String(item.job.id);}
 function jobs(items,email,date=today()){return items.filter(i=>i.job&&text(i.job.techEmail).toLowerCase()===text(email).toLowerCase()&&day(i.job.scheduledAt)===date&&!['completed','cancelled'].includes(i.job.status)&&i.q?.Status!=='Cancelled');}
 function destination(item){const pin=mapPoint(item.job.mapUrl);if(pin)return {value:pin,source:'จากแผนที่งาน'};const site=text(item.job.siteAddress||item.job.address);return site?{value:site,source:'ที่อยู่หน้างาน'}:{value:text(item.q?.CustomerAddress),source:'ที่อยู่ลูกค้าในใบเสนอราคา · ตรวจว่าเป็นหน้างานจริง'};}
 function distance(a,b){const rad=v=>v*Math.PI/180,dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
 function sort(items,metrics){return [...items].sort((a,b)=>{const x=metrics.get(key(a))?.km,y=metrics.get(key(b))?.km,ax=Number.isFinite(x),by=Number.isFinite(y);return ax&&by?x-y||clock(a.job.scheduledAt).localeCompare(clock(b.job.scheduledAt)):ax?-1:by?1:clock(a.job.scheduledAt).localeCompare(clock(b.job.scheduledAt))||key(a).localeCompare(key(b));});}
 function directions(origin,destination){return 'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin,destination,travelmode:'driving'});}
 return {coordinates,mapPoint,day,today,clock,key,jobs,destination,distance,sort,directions};
});
