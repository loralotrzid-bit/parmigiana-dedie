import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const pg = new PGlite();
await pg.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE SCHEMA cron;
  CREATE TABLE cron.job(jobid bigserial primary key, jobname text, schedule text, command text, active boolean default true);
  CREATE FUNCTION cron.unschedule(p_job_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN DELETE FROM cron.job WHERE jobid = p_job_id; RETURN FOUND; END $$;
  CREATE FUNCTION cron.schedule(p_job_name text, p_schedule text, p_command text) RETURNS bigint LANGUAGE plpgsql AS $$
    DECLARE new_id bigint; BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(p_job_name,p_schedule,p_command) RETURNING jobid INTO new_id; RETURN new_id; END $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
`);
await pg.exec(readFileSync('supabase/migrations/20261031170000_distributed_edge_rate_limits.sql', 'utf8'));
await pg.exec(readFileSync('supabase/migrations/20261031171500_add_cart_rate_limit_scope.sql', 'utf8'));
await pg.exec(readFileSync('supabase/migrations/20261031172000_atomic_dual_rate_limit.sql', 'utf8'));
await pg.exec(readFileSync('supabase/migrations/20261031210000_harden_rate_limits_and_cleanup_carts.sql', 'utf8'));
await pg.exec(readFileSync('supabase/migrations/20261101140000_cleanup_expired_rate_limits.sql', 'utf8'));

await pg.exec("SET ROLE service_role; SET request.jwt.claim.role='service_role'");
const key = 'a'.repeat(64);
assert.equal((await pg.query('select public.consume_edge_request_rate_limit($1,$2,$3,$4) as allowed', ['create-order', key, 2, 60])).rows[0].allowed, true);
assert.equal((await pg.query('select public.consume_edge_request_rate_limit($1,$2,$3,$4) as allowed', ['create-order', key, 2, 60])).rows[0].allowed, true);
assert.equal((await pg.query('select public.consume_edge_request_rate_limit($1,$2,$3,$4) as allowed', ['create-order', key, 2, 60])).rows[0].allowed, false);
assert.equal((await pg.query('select public.consume_edge_request_rate_limit($1,$2,$3,$4) as allowed', ['digital-menu-prepare', key, 1, 60])).rows[0].allowed, true);
assert.equal((await pg.query('select public.consume_edge_request_rate_limit($1,$2,$3,$4) as allowed', ['cart-api', key, 1, 60])).rows[0].allowed, true);
const paired = ['cart-api', 'c'.repeat(64), 1, 'd'.repeat(64), 1, 60];
assert.equal((await pg.query('select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6) as allowed', paired)).rows[0].allowed, true);
assert.equal((await pg.query('select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6) as allowed', paired)).rows[0].allowed, false);

const sharedRestaurantIp = 'f'.repeat(64);
for (let i = 1; i <= 100; i++) {
  const sessionHash = i.toString(16).padStart(64, '0');
  const accepted = (await pg.query(
    'select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6) as allowed',
    ['digital-menu-prepare', sessionHash, 30, sharedRestaurantIp, 1200, 60],
  )).rows[0].allowed;
  assert.equal(accepted, true, `guest session ${i} should pass shared-restaurant-IP burst`);
}
const sharedStatusIp = '9'.repeat(64);
for (let i = 1; i <= 100; i++) {
  const orderTokenHash = (1000 + i).toString(16).padStart(64, '0');
  for (let poll = 0; poll < 10; poll++) {
    const accepted = (await pg.query(
      'select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6) as allowed',
      ['digital-menu-status', orderTokenHash, 600, sharedStatusIp, 6000, 60],
    )).rows[0].allowed;
    assert.equal(accepted, true, `order status poll ${i}/${poll} should pass shared-IP burst`);
  }
}
const sharedTableCallIp = '8'.repeat(64);
for (let i = 1; i <= 100; i++) {
  const tableIdentityHash = (2000 + Math.ceil(i / 10)).toString(16).padStart(64, '0');
  const accepted = (await pg.query(
    'select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6) as allowed',
    ['digital-menu-prepare', tableIdentityHash, 30, sharedTableCallIp, 300, 60],
  )).rows[0].allowed;
  assert.equal(accepted, true, `table call ${i} should pass a 100-customer burst across ten tables`);
}
await pg.exec('RESET ROLE');
assert.equal((await pg.query('select count(*)::int as n from cron.job where jobname=$1 and active', ['parmigiana-cart-cleanup'])).rows[0].n, 1);
await pg.exec("SET ROLE service_role; SET request.jwt.claim.role='service_role'");
assert.equal((await pg.query('select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6) as allowed', ['site-diagnostic', 'e'.repeat(64), 5, 'a'.repeat(64), 20, 60])).rows[0].allowed, true);

const cleanupKeys = ['2'.repeat(64), '3'.repeat(64), '4'.repeat(64)];
for (let i = 0; i < cleanupKeys.length; i++) {
  await pg.query(
    `insert into public.edge_request_rate_limits(scope,key_hash,window_started,request_count,expires_at)
     values('create-order',$1,now() - interval '2 hours',1,$2)`,
    [cleanupKeys[i], i < 2 ? new Date(Date.now() - 60_000).toISOString() : new Date(Date.now() + 3_600_000).toISOString()],
  );
}
assert.equal((await pg.query('select public.cleanup_expired_edge_rate_limits(1) as deleted')).rows[0].deleted, 1);
assert.equal((await pg.query('select count(*)::int as n from public.edge_request_rate_limits where key_hash=any($1::text[])', [cleanupKeys])).rows[0].n, 2);
assert.equal((await pg.query('select public.cleanup_expired_edge_rate_limits(5000) as deleted')).rows[0].deleted, 1);
assert.equal((await pg.query('select count(*)::int as n from public.edge_request_rate_limits where key_hash=any($1::text[]) and expires_at<now()', [cleanupKeys])).rows[0].n, 0);
await pg.exec('RESET ROLE');
assert.equal((await pg.query('select count(*)::int as n from cron.job where jobname=$1 and schedule=$2 and active', ['parmigiana-rate-limit-cleanup','*/15 * * * *'])).rows[0].n, 1);
await pg.exec("SET ROLE service_role; SET request.jwt.claim.role='service_role'");

await pg.exec("RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.role='authenticated'");
await assert.rejects(pg.query('select public.consume_edge_request_rate_limit($1,$2,$3,$4)', ['create-order', key, 2, 60]));
await assert.rejects(pg.query('select public.consume_edge_request_rate_limit_pair($1,$2,$3,$4,$5,$6)', paired));
await assert.rejects(pg.query('select public.cleanup_expired_edge_rate_limits(1)'));
await pg.exec('RESET ROLE');
const count = (await pg.query('select request_count from public.edge_request_rate_limits where scope=$1 and key_hash=$2', ['create-order', key])).rows[0].request_count;
assert.equal(count, 3);
console.log('Isolated PostgreSQL checks passed: atomic thresholds, paired scopes, service-only access, scheduled cleanup, expired-counter pruning and 100-session shared-IP bursts.');
await pg.close();
