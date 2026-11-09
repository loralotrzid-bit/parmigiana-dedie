// Read-only capacity probe: 100 concurrent virtual users, 3 waves.
// It requests local SPA routes and public Supabase reads only; it never creates orders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(line => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')];
  }));
const app = process.env.MONITOR_APP_URL || 'http://localhost:8082';
const api = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!api || !key) throw new Error('Supabase public URL/key missing in .env.local');

const users = Math.min(100, Math.max(1, Number(process.env.LOAD_USERS || 100)));
const waves = Math.min(10, Math.max(1, Number(process.env.LOAD_WAVES || 3)));
const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.join(reportDir, `load-${stamp}.jsonl`);
const summaryPath = path.join(reportDir, `load-${stamp}-summary.json`);
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const samples = {};
const checks = {};
let failures = 0;

function record(name, ok, status, ms) {
  samples[name] ??= [];
  samples[name].push(ms);
  checks[name] ??= { ok: 0, fail: 0, statuses: {} };
  checks[name][ok ? 'ok' : 'fail']++;
  checks[name].statuses[status] = (checks[name].statuses[status] || 0) + 1;
  if (!ok) failures++;
  fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), name, ok, status, ms }) + '\n');
}

async function request(name, url, expected = [200]) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, cache: 'no-store' });
    await response.arrayBuffer();
    record(name, expected.includes(response.status), response.status, Math.round(performance.now() - started));
  } catch {
    record(name, false, 'ERR', Math.round(performance.now() - started));
  } finally {
    clearTimeout(timeout);
  }
}

const localPaths = ['/menu/la-parmigiana', '/menu/la-parmigiana?counter=1', '/cart', '/admin', '/admin/service'];
const probes = [
  ...localPaths.map((route, i) => user => request(`local-route-${i + 1}`, `${app}${route}${route.includes('?') ? '&' : '?'}load_user=${user}`)),
  user => request('public-restaurant-read', `${api}/rest/v1/restaurants?select=id,slug,digital_menu_enabled&slug=eq.la-parmigiana`),
  user => request('public-category-read', `${api}/rest/v1/categories?select=id,name&limit=50`),
];

console.log(`Read-only load probe started: ${users} concurrent users × ${waves} waves; log=${logPath}`);
const startedAt = new Date().toISOString();
const startedMs = Date.now();
for (let wave = 1; wave <= waves; wave++) {
  await Promise.all(Array.from({ length: users }, async (_, userIndex) => {
    const user = `${wave}-${userIndex + 1}`;
    for (const probe of probes) await probe(user);
  }));
  console.log(`wave ${wave}/${waves} complete; requests=${Object.values(samples).reduce((sum, values) => sum + values.length, 0)}; failures=${failures}`);
}

const latency = Object.fromEntries(Object.entries(samples).map(([name, values]) => {
  values.sort((a, b) => a - b);
  return [name, { min: values[0], median: values[Math.floor(values.length * 0.5)], p95: values[Math.floor(values.length * 0.95)], max: values.at(-1) }];
}));
const summary = { startedAt, finishedAt: new Date().toISOString(), elapsedMs: Date.now() - startedMs, concurrentVirtualUsers: users, waves, requests: Object.values(samples).reduce((sum, values) => sum + values.length, 0), failures, checks, latency };
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`Load probe finished; failures=${failures}\n${summaryPath}`);
if (failures) process.exitCode = 1;
