// 20-minute, 100-user, read-only application and Supabase load monitor.
// Never creates orders, accounts, service calls, or cart rows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')];
  }));

const app = process.env.MONITOR_APP_URL || 'http://127.0.0.1:8082';
const api = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const users = Math.min(100, Math.max(1, Number(process.env.LOAD_USERS || 100)));
const durationMs = Math.min(20, Math.max(1, Number(process.env.MONITOR_MINUTES || 20))) * 60_000;
const intervalMs = Math.max(5_000, Number(process.env.LOAD_INTERVAL_MS || 10_000));
if (!api || !key) throw new Error('Missing Supabase public URL/key in .env.local');
if (!api.includes('aehfmqoxvfuizcloowlj.supabase.co')) throw new Error('Refusing load test: unexpected Supabase project URL');

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.join(reportDir, `load-20m-${stamp}.jsonl`);
const summaryPath = path.join(reportDir, `load-20m-${stamp}-summary.json`);
const targets = [
  { name: 'local-menu', url: `${app}/menu/la-parmigiana` },
  { name: 'local-menu-table-choice', url: `${app}/menu/la-parmigiana?counter=1` },
  { name: 'local-cart', url: `${app}/cart` },
  { name: 'local-restaurant', url: `${app}/restaurant/la-parmigiana` },
  { name: 'remote-table-options', url: `${api}/functions/v1/digital-menu`, method: 'POST', body: { action: 'table_options', slug: 'la-parmigiana' } },
  { name: 'remote-restaurant-read', url: `${api}/rest/v1/restaurants?select=id,slug,digital_menu_enabled,is_paused&slug=eq.la-parmigiana` },
  { name: 'remote-catalog-read', url: `${api}/rest/v1/categories?select=id,name,is_published&limit=50` },
];
const stats = { startedAt: new Date().toISOString(), app, projectRef: 'aehfmqoxvfuizcloowlj', users, plannedMinutes: durationMs / 60_000, intervalMs, total: 0, failed: 0, statuses: {}, checks: {}, latencies: {} };
let stop = false;
const startedMs = Date.now();
const deadline = startedMs + durationMs;

function validate(target, status, body) {
  if (status !== 200) return `expected HTTP 200, got ${status}`;
  if (target.name === 'remote-table-options') {
    const value = JSON.parse(body);
    if (value.dine_in_enabled !== true || !Array.isArray(value.tables) || value.tables.length === 0) return 'table options payload invalid';
  } else if (target.name === 'remote-restaurant-read') {
    const value = JSON.parse(body);
    if (!Array.isArray(value) || value.length !== 1 || value[0].digital_menu_enabled !== true || value[0].is_paused === true) return 'restaurant state invalid';
  } else if (target.name === 'remote-catalog-read') {
    if (!Array.isArray(JSON.parse(body))) return 'catalog payload invalid';
  } else if (!body.toLowerCase().includes('<html')) return 'local route did not return HTML';
  return '';
}

async function probe(user, target, turn) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let status = 'ERR';
  let ok = false;
  let detail = '';
  try {
    const response = await fetch(target.url, {
      method: target.method || 'GET',
      headers: target.url.startsWith(api) ? headers : undefined,
      body: target.body ? JSON.stringify(target.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    status = response.status;
    const body = (await response.text()).slice(0, 8_000);
    detail = validate(target, response.status, body);
    ok = !detail;
  } catch (error) {
    detail = error instanceof Error ? error.message.slice(0, 200) : 'request failed';
  } finally {
    clearTimeout(timeout);
  }
  const ms = Math.round(performance.now() - started);
  stats.total++;
  if (!ok) stats.failed++;
  const key = `${target.name}:${status}`;
  stats.statuses[key] = (stats.statuses[key] || 0) + 1;
  stats.checks[target.name] ??= { ok: 0, fail: 0 };
  stats.checks[target.name][ok ? 'ok' : 'fail']++;
  stats.latencies[target.name] ??= [];
  stats.latencies[target.name].push(ms);
  fs.appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), user, turn, target: target.name, ok, status, ms, detail })}\n`);
}

async function worker(userIndex) {
  let turn = 0;
  await new Promise((resolve) => setTimeout(resolve, Math.random() * intervalMs));
  while (!stop && Date.now() < deadline) {
    const target = targets[(userIndex + turn) % targets.length];
    await probe(userIndex + 1, target, turn + 1);
    turn++;
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const progress = setInterval(() => {
  const elapsedMinutes = Math.floor((Date.now() - startedMs) / 60_000);
  console.log(`progress ${elapsedMinutes}/${durationMs / 60_000}m · ${stats.total} requests · ${stats.failed} failures`);
}, 60_000);
console.log(`Started ${users} virtual users for ${durationMs / 60_000} minutes · interval ${intervalMs}ms · log ${logPath}`);
await Promise.all(Array.from({ length: users }, (_, index) => worker(index)));
stop = true;
clearInterval(progress);
stats.finishedAt = new Date().toISOString();
stats.elapsedMs = Date.now() - startedMs;
for (const [name, values] of Object.entries(stats.latencies)) {
  values.sort((a, b) => a - b);
  stats.latencies[name] = { min: values[0], median: values[Math.floor(values.length * 0.5)], p95: values[Math.floor(values.length * 0.95)], max: values.at(-1) };
}
fs.writeFileSync(summaryPath, JSON.stringify(stats, null, 2));
console.log(`Finished · requests=${stats.total} · failures=${stats.failed}\n${logPath}\n${summaryPath}`);
if (stats.failed) process.exitCode = 1;
