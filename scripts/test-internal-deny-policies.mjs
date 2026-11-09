import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const tables = [
  'cart_items', 'carts', 'digital_menu_sessions', 'edge_request_rate_limits',
  'phone_order_requests', 'restaurant_order_number_counters', 'staff_order_requests',
];
const pg = new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
for (const table of tables) {
  await pg.exec(`CREATE TABLE public.${table}(id integer PRIMARY KEY); ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.${table} TO anon, authenticated, service_role;`);
}
await pg.exec(readFileSync('supabase/migrations/20261101150000_explicit_deny_internal_tables.sql', 'utf8'));
for (const table of tables) await pg.exec(`INSERT INTO public.${table} VALUES (1);`);

await pg.exec('SET ROLE anon');
for (const table of tables) {
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n, 0, `${table} must remain invisible to anon`);
  await assert.rejects(pg.query(`INSERT INTO public.${table} VALUES (2)`), undefined, `${table} must reject anon writes`);
}
await pg.exec('RESET ROLE; SET ROLE authenticated');
for (const table of tables) assert.equal((await pg.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n, 0, `${table} must remain invisible to authenticated clients`);
await pg.exec('RESET ROLE; SET ROLE service_role');
for (const table of tables) assert.equal((await pg.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n, 1, `${table} must remain available to trusted Edge Functions`);
await pg.exec('RESET ROLE');
assert.equal((await pg.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND policyname='deny_browser_access'")).rows[0].n, tables.length);
console.log(`Isolated PostgreSQL checks passed: ${tables.length} internal tables explicitly deny anon/authenticated access while service_role retains access.`);
await pg.close();
