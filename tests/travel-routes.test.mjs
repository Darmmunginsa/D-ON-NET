import test from 'node:test';
import assert from 'node:assert/strict';
import gateway,{travelDistance} from '../infrastructure/gateway.mjs';
const reply=(body,status=200)=>({body,status});
const input={origin:'วัดเปรมประชา ปทุมธานี',destination:'โคกขาม สมุทรสาคร 74000'};
test('missing key and invalid addresses never call Google',async()=>{
 globalThis.fetch=()=>{throw Error('unexpected');};
 assert.equal((await travelDistance(input,{},reply)).status,503);
 assert.equal((await travelDistance({...input,origin:''},{GOOGLE_MAPS_API_KEY:'secret'},reply)).status,400);
});
test('driving route uses fixed upstream and minimal Essentials fields, never exposes key',async()=>{
 globalThis.fetch=async(url,opt)=>{assert.equal(url,'https://routes.googleapis.com/directions/v2:computeRoutes');assert.equal(opt.headers['X-Goog-Api-Key'],'secret');assert.equal(opt.headers['X-Goog-FieldMask'],'routes.distanceMeters');const body=JSON.parse(opt.body);assert.equal(body.travelMode,'DRIVE');assert.equal(body.routingPreference,'TRAFFIC_UNAWARE');return Response.json({routes:[{distanceMeters:123456}]});};
 const result=await travelDistance(input,{GOOGLE_MAPS_API_KEY:'secret'},reply);assert.equal(result.body.km,123.5);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('no route, Google error and network failure do not invent distance',async()=>{
 for(const mock of [async()=>Response.json({routes:[]}),async()=>new Response('private key detail',{status:403}),async()=>{throw Error('private');}]){globalThis.fetch=mock;const result=await travelDistance(input,{GOOGLE_MAPS_API_KEY:'secret'},reply);assert.equal(result.body.ok,false);assert.equal(result.body.km,undefined);assert.ok(!JSON.stringify(result).includes('private'));}
});
test('unauthenticated route action cannot reach Google',async()=>{
 globalThis.fetch=()=>{throw Error('unexpected');};
 const response=await gateway.fetch(new Request('https://gateway.test/',{method:'POST',headers:{Origin:'https://darmmunginsa.github.io'},body:JSON.stringify({action:'travelDistance',...input})}),{GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://backend.test',GATEWAY_SECRET:'x'.repeat(32),GOOGLE_MAPS_API_KEY:'secret'});
 assert.equal(response.status,401);
});
