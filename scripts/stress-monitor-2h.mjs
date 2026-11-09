// Two-hour controlled stress monitor for the dedicated La Parmigiana app.
// 1,000 virtual clients load the loopback app; production Supabase receives
// only paced reads and invalid, non-mutating security probes. No orders/users
// or staff calls are created.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readEnv = (name) => {
  const file = path.join(root, '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local is missing');
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/^['"]|['"]$/g, '') || '';
};

const app = process.env.MONITOR_APP_URL || 'http://127.0.0.1:8082';
const api = readEnv('VITE_SUPABASE_URL');
const key = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');
if (!api.startsWith('https://aehfmqoxvfuizcloowlj.supabase.co')) throw new Error('Refusing: .env.local is not the dedicated Parmigiana project');
if (!key) throw new Error('Supabase publishable key missing in .env.local');
const users = 1000;
const durationMs = 2 * 60 * 60 * 1000;
const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.join(reportDir, `stress-2h-${stamp}.jsonl`);
const summaryPath = path.join(reportDir, `stress-2h-${stamp}-summary.json`);
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const localRoutes = [
  '/menu/la-parmigiana', '/menu/la-parmigiana?counter=1', '/cart',
  '/restaurant/la-parmigiana', '/auth/login?redirect=%2Faccount',
  '/admin', '/admin/caisse', '/admin/service', '/delivery',
  '/table/not-a-real-token', '/orders/not-a-real-id',
];
const summary = {
  startedAt: new Date().toISOString(), finishedAt: null, plannedMinutes: 120,
  virtualUsers: users, localTarget: app, supabaseProjectRef: 'aehfmqoxvfuizcloowlj',
  policy: 'Loopback 1,000-user load; paced remote reads; invalid no-write attack probes; no valid order submissions',
  requests: 0, failures: 0, checks: {}, latencyMs: {}, statusCounts: {},
};
const started = Date.now();
const deadline = started + durationMs;
let stopping = false;
const latencySamples = new Map();

function record(name, ok, status, ms, detail = '') {
  summary.requests++;
  if (!ok) summary.failures++;
  const check = summary.checks[name] ??= { ok: 0, fail: 0 };
  check[ok ? 'ok' : 'fail']++;
  const statusKey = `${name}:${status}`;
  summary.statusCounts[statusKey] = (summary.statusCounts[statusKey] || 0) + 1;
  const values = latencySamples.get(name) || [];
  values.push(ms);
  latencySamples.set(name, values);
  logStream.write(`${JSON.stringify({ at: new Date().toISOString(), name, ok, status, ms, detail })}\n`);
}

async function request(name, url, options = {}, expected = [200], validate = () => true) {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
    const body = (await response.text()).slice(0, 2000);
    let valid = false;
    try { valid = expected.includes(response.status) && validate(response, body); } catch { valid = false; }
    record(name, valid, response.status, Math.round(performance.now() - start), valid ? '' : body.replace(/[\r\n]+/g, ' ').slice(0, 240));
  } catch (error) {
    record(name, false, 'ERR', Math.round(performance.now() - start), error instanceof Error ? error.message.slice(0, 160) : 'network error');
  } finally {
    clearTimeout(timer);
  }
}

const isHtml = (_response, body) => /<html[\s>]/i.test(body);
const apiGet = (name, url, validate) => request(name, url, { headers }, [200], validate);
async function localClient(id) {
  let turn = 0;
  while (!stopping && Date.now() < deadline) {
    const route = localRoutes[(id + turn) % localRoutes.length];
    await request('local-client-route', `${app}${route}`, {}, [200], isHtml);
    turn++;
    // 1,000 long-lived virtual clients generate a steady low rate. A separate
    // burst every five minutes verifies 1,000 simultaneous connections.
    await new Promise((resolve) => setTimeout(resolve, 18_000 + Math.random() * 17_000));
  }
}

async function localBurst() {
  const id = Math.floor((Date.now() - started) / 300_000);
  await Promise.all(Array.from({ length: users }, (_, i) => {
    const route = localRoutes[(i + id) % localRoutes.length];
    return request('local-1000-user-burst', `${app}${route}`, {}, [200], isHtml);
  }));
}

async function remoteReadAndSecurityChecks() {
  await Promise.all([
    apiGet('supabase-public-restaurant-read', `${api}/rest/v1/restaurants?select=id,slug,digital_menu_enabled,is_paused&slug=eq.la-parmigiana`,
      (_r, body) => { const v = JSON.parse(body); return Array.isArray(v) && v.length === 1; }),
    apiGet('supabase-public-catalog-read', `${api}/rest/v1/categories?select=id,name&limit=30`,
      (_r, body) => Array.isArray(JSON.parse(body))),
  ]);
  const protectedTables = ['orders', 'profiles', 'digital_menu_sessions', 'table_service_calls', 'phone_order_requests'];
  await Promise.all(protectedTables.map((table) => request(`anon-read-${table}`,
    `${api}/rest/v1/${table}?select=*&limit=2`, { headers }, [200, 401, 403],
    (response, body) => response.status !== 200 || (Array.isArray(JSON.parse(body)) && JSON.parse(body).length === 0))));
  const attackInputs = [
    ['invalid-digital-menu-order', 'digital-menu', { action: 'prepare', slug: 'la-parmigiana', order_type: 'dine_in', items: [] }],
    ['anonymous-superadmin-create', 'admin-create-user', { email: 'invalid', password: 'x', restaurant_id: 'not-a-uuid' }],
    ['anonymous-sql-console', 'sql-console', { sql: 'select 1' }],
    ['empty-create-order', 'create-order', {}],
    ['invalid-cart-operation', 'cart-api', { action: 'delete_all' }],
    ['invalid-staff-operation', 'delivery-api', { action: 'assign', order_id: 'not-a-uuid' }],
  ];
  await Promise.all(attackInputs.map(([name, fn, body]) => request(name,
    `${api}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) },
    [400, 401, 403, 404, 405, 413, 422, 429], () => true)));
}

console.log(`2h monitor started; ${users} virtual clients; loopback app ${app}; Supabase project ${summary.supabaseProjectRef}`);
console.log(`Full JSONL log: ${logPath}`);
const stopProgress = setInterval(() => {
  console.log(`progress ${Math.floor((Date.now() - started) / 60_000)}/120m · ${summary.requests} requests · ${summary.failures} failures`);
}, 60_000);
const clientWorkers = Array.from({ length: users }, (_, i) => localClient(i));
let lastBurst = 0;
let lastRemoteProbe = 0;
try {
  while (Date.now() < deadline) {
    const elapsed = Date.now() - started;
    if (elapsed - lastBurst >= 300_000) {
      lastBurst = elapsed;
      await localBurst();
      console.log(`1,000-user local burst complete at ${Math.floor(elapsed / 60_000)}m`);
    }
    if (elapsed - lastRemoteProbe >= 60_000) {
      lastRemoteProbe = elapsed;
      await remoteReadAndSecurityChecks();
      console.log(`paced read/security probes complete at ${Math.floor(elapsed / 60_000)}m`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  stopping = true;
  await Promise.all(clientWorkers);
  clearInterval(stopProgress);
  summary.finishedAt = new Date().toISOString();
  summary.elapsedMs = Date.now() - started;
  await new Promise((resolve) => logStream.end(resolve));
  for (const [name, values] of latencySamples) {
    values.sort((a, b) => a - b);
    summary.latencyMs[name] = { count: values.length, min: values[0], median: values[Math.floor(values.length * 0.5)], p95: values[Math.floor(values.length * 0.95)], max: values.at(-1) };
  }
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`finished · ${summary.requests} requests · ${summary.failures} failures`);
  console.log(`JSONL: ${logPath}`);
  console.log(`Summary: ${summaryPath}`);
}
if (summary.failures) process.exitCode = 1;
