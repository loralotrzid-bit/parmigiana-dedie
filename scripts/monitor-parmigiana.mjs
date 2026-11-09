// Controlled 30-minute availability/security smoke monitor. Read-only probes only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1).replace(/^['"]|['"]$/g,'')]; }));
const app = process.env.MONITOR_APP_URL || 'http://localhost:8082';
const api = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!api || !key) throw new Error('Supabase public URL/key missing in .env.local');
const reportDir = path.join(root, 'reports'); fs.mkdirSync(reportDir,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const logPath=path.join(reportDir,`monitor-${stamp}.jsonl`), summaryPath=path.join(reportDir,`monitor-${stamp}-summary.json`);
const durationMs=30*60*1000, intervalMs=10_000, startedMs=Date.now(), deadline=startedMs+durationMs;
const stats={startedAt:new Date().toISOString(),app,api,plannedMinutes:30,intervalSeconds:10,probes:0,failures:0,checks:{},latencies:{}};
function record(name,ok,ms,status,detail=''){stats.probes++;if(!ok)stats.failures++;stats.checks[name]??={ok:0,fail:0,statuses:{}};stats.checks[name][ok?'ok':'fail']++;stats.checks[name].statuses[status]=(stats.checks[name].statuses[status]||0)+1;const a=stats.latencies[name]??=[];a.push(ms);const e={at:new Date().toISOString(),name,ok,ms,status,detail};fs.appendFileSync(logPath,JSON.stringify(e)+'\n');if(!ok)console.error(JSON.stringify(e));}
async function probe(name,url,options={},expected=[200],validateBody=()=>true){const start=performance.now();try{const c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);const r=await fetch(url,{...options,signal:c.signal});clearTimeout(timer);let body='';try{body=(await r.text()).slice(0,800)}catch{};const ok=expected.includes(r.status)&&validateBody(r.status,body);record(name,ok,Math.round(performance.now()-start),r.status,ok?'':body.replace(/[\r\n]+/g,' ').slice(0,240));}catch(e){record(name,false,Math.round(performance.now()-start),'ERR',String(e).slice(0,240));}}
const headers={apikey:key,Authorization:`Bearer ${key}`};
let cycle=0;
console.log(`30-minute controlled monitor started; logs: ${logPath}`);
while(Date.now()<deadline){cycle++;
  await probe('local-menu',`${app}/menu/la-parmigiana`);
  await probe('local-cart-refresh',`${app}/cart?monitor=${cycle}`);
  await probe('local-login-refresh',`${app}/auth/login?monitor=${cycle}`);
  await probe('public-restaurant-read',`${api}/rest/v1/restaurants?select=id,slug,digital_menu_enabled&slug=eq.la-parmigiana`,{headers});
  await probe('public-catalog-read',`${api}/rest/v1/categories?select=id,name&order=sort_order.asc`,{headers});
  // Malformed/unauthorized table token: expected denial, must not create a service call.
  await probe('invalid-table-token-denied',`${api}/rest/v1/rpc/get_service_table`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_token:'00000000-0000-4000-8000-000000000000'})},[200,400,401,403],(status,body)=>status!==200||Array.isArray(JSON.parse(body))&&JSON.parse(body).length===0);
  // Sensitive relation should be denied/empty to anon. This is a read-only policy probe.
  await probe('roles-anon-not-disclosed',`${api}/rest/v1/user_roles?select=user_id,role`,{headers},[200,401,403],(status,body)=>status!==200||Array.isArray(JSON.parse(body))&&JSON.parse(body).length===0);
  if(cycle%6===0)console.log(`monitor running: ${Math.round((Date.now()-startedMs)/60000)} min, cycles=${cycle}, failures=${stats.failures}`);
  await new Promise(r=>setTimeout(r,Math.min(intervalMs,Math.max(0,deadline-Date.now()))));
}
stats.finishedAt=new Date().toISOString();stats.elapsedMs=Date.now()-startedMs;stats.cycles=cycle;
for(const [n,a] of Object.entries(stats.latencies)){a.sort((x,y)=>x-y);stats.latencies[n]={min:a[0],median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};}
fs.writeFileSync(summaryPath,JSON.stringify(stats,null,2));
console.log(`Monitor finished. probes=${stats.probes} failures=${stats.failures}\n${logPath}\n${summaryPath}`);
