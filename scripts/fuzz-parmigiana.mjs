// Randomized, low-rate, non-destructive smoke/fuzz checks for the Parmigiana app.
// No valid order, account, waiter call, or persistent mutation is submitted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'.env.local'),'utf8').split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const app=process.env.MONITOR_APP_URL||'http://localhost:8082',api=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!api||!key)throw new Error('Missing local Supabase client config');
const dir=path.join(root,'reports');fs.mkdirSync(dir,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const log=path.join(dir,`fuzz-${stamp}.jsonl`),summary=path.join(dir,`fuzz-${stamp}-summary.json`);
const duration=10*60_000,start=Date.now(),end=start+duration,stats={startedAt:new Date(start).toISOString(),finishedAt:null,minutes:10,requests:0,failures:0,cases:{},latencyMs:{}};
const rnd=a=>a[Math.floor(Math.random()*a.length)],randHex=n=>Array.from({length:n},()=>Math.floor(Math.random()*16).toString(16)).join('');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
function save(name,ok,status,ms,detail=''){stats.requests++;if(!ok)stats.failures++;const c=stats.cases[name]??={ok:0,fail:0,statuses:{}};c[ok?'ok':'fail']++;c.statuses[status]=(c.statuses[status]||0)+1;(stats.latencyMs[name]??=[]).push(ms);fs.appendFileSync(log,JSON.stringify({at:new Date().toISOString(),name,ok,status,ms,detail})+'\n');}
async function hit(name,url,opt={},expected=[200],validateBody=()=>true){let t=performance.now();try{const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),7000),r=await fetch(url,{...opt,signal:ac.signal});clearTimeout(timer);const body=(await r.text()).slice(0,450);const ok=expected.includes(r.status)&&validateBody(r.status,body);save(name,ok,r.status,Math.round(performance.now()-t),ok?'':body.replace(/[\r\n]+/g,' ').slice(0,180));}catch(e){save(name,false,'ERR',Math.round(performance.now()-t),String(e).slice(0,180));}}
const randomPaths=['/','/menu/la-parmigiana','/menu/la-parmigiana?counter=1','/cart','/cart?step=profile','/cart?step=payment','/auth/login','/auth/signup','/auth/callback','/table/not-a-token','/orders/not-a-uuid','/admin','/admin/service','/delivery','/not-a-real-route'];
const badTokens=['','x',randHex(36),'../../admin',`' OR 1=1 --`,null,1234];
let n=0;console.log(`Randomized safe fuzzing started; log=${log}`);
while(Date.now()<end){n++;
 const route=rnd(randomPaths);await hit('random-local-route',`${app}${route}${route.includes('?')?'&':'?'}fuzz=${randHex(8)}`);
 const invalidToken=rnd(badTokens);
 await hit('digital-menu-invalid-payload',`${api}/functions/v1/digital-menu`,{method:'POST',headers,body:JSON.stringify(rnd([{action:'prepare',slug:'la-parmigiana',order_type:'dine_in',items:[]},{action:'prepare',slug:'la-parmigiana',order_type:'delivery',items:[{}]},{action:'status',token:'invalid',order_id:randHex(8)},{action:'unknown',x:randHex(10)},{action:123},{table_token:invalidToken}]))},[400,401,403,404,405,422,429]);
 await hit('unknown-edge-function',`${api}/functions/v1/${rnd(['not-a-function','admin-create-user','sql-console'])}`,{method:'POST',headers,body:JSON.stringify({action:rnd(['create','query','execute']),email:'not-an-email',password:'x',restaurant_id:'invalid',sql:'select 1'})},[401,403,404,405,400]);
 await hit('random-protected-read',`${api}/rest/v1/${rnd(['user_roles','profiles','orders','digital_menu_sessions','table_service_calls'])}?select=*&limit=2`,{headers},[200,401,403],(status,body)=>status!==200||Array.isArray(JSON.parse(body))&&JSON.parse(body).length===0);
 if(n%8===0)console.log(`fuzz running ~${Math.round((Date.now()-start)/60000)} min; batches=${n}; failures=${stats.failures}`);
 await new Promise(r=>setTimeout(r,1500));
}
stats.finishedAt=new Date().toISOString();stats.elapsedMs=Date.now()-start;
for(const a of Object.values(stats.latencyMs)){a.sort((x,y)=>x-y);Object.assign(a,{})}
stats.latencySummary=Object.fromEntries(Object.entries(stats.latencyMs).map(([k,a])=>{a.sort((x,y)=>x-y);return[k,{min:a[0],median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}]}));delete stats.latencyMs;
fs.writeFileSync(summary,JSON.stringify(stats,null,2));console.log(`Fuzz finished requests=${stats.requests} failures=${stats.failures}\n${log}\n${summary}`);
