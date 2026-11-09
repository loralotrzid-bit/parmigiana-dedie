import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const pg = new PGlite();
const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const superAdmin = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const restaurant1 = '11111111-1111-4111-8111-111111111111';
const restaurant2 = '22222222-2222-4222-8222-222222222222';

await pg.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TYPE public.app_role AS ENUM ('restaurant_admin','super_admin');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.jwt_role', true), '') $$;
  CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT _user_id=auth.uid() AND current_setting('test.role',true)=_role::text $$;
  CREATE FUNCTION public.get_user_restaurant_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT CASE WHEN _user_id=auth.uid() THEN nullif(current_setting('test.restaurant_id',true),'')::uuid END $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), public.has_role(uuid,public.app_role), public.get_user_restaurant_id(uuid) TO anon, authenticated;
`);

const tables = ['audit_log','data_deletion_requests','delivery_drivers','delivery_settings','profiles','support_tickets','user_roles'];
for (const table of tables) {
  await pg.exec(`CREATE TABLE public.${table}(id integer PRIMARY KEY,user_id uuid,restaurant_id uuid,auth_user_id uuid,display_name text); ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO anon,authenticated;`);
}

await pg.exec(`
  CREATE POLICY "Admin read own audit_log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'restaurant_admin') AND restaurant_id=public.get_user_restaurant_id((SELECT auth.uid())));
  CREATE POLICY "Super admin read audit_log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Super admin read all deletion requests" ON public.data_deletion_requests FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Users read own deletion requests" ON public.data_deletion_requests FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
  CREATE POLICY "Admin read own drivers" ON public.delivery_drivers FOR SELECT TO authenticated USING ((public.has_role((SELECT auth.uid()),'restaurant_admin') AND restaurant_id=public.get_user_restaurant_id((SELECT auth.uid()))) OR public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY delivery_driver_read_own_profile ON public.delivery_drivers FOR SELECT TO authenticated USING (auth_user_id=(SELECT auth.uid()));
  CREATE POLICY "Public read delivery_settings" ON public.delivery_settings FOR SELECT TO public USING (true);
  CREATE POLICY "Admin manage delivery_settings" ON public.delivery_settings FOR ALL TO authenticated USING ((public.has_role((SELECT auth.uid()),'restaurant_admin') AND restaurant_id=public.get_user_restaurant_id((SELECT auth.uid()))) OR public.has_role((SELECT auth.uid()),'super_admin')) WITH CHECK ((public.has_role((SELECT auth.uid()),'restaurant_admin') AND restaurant_id=public.get_user_restaurant_id((SELECT auth.uid()))) OR public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Super admin read all profiles" ON public.profiles FOR SELECT TO public USING (public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
  CREATE POLICY "Super admin update all profiles" ON public.profiles FOR UPDATE TO public USING (public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()) AND ((NOT (restaurant_id IS DISTINCT FROM (SELECT p.restaurant_id FROM public.profiles p WHERE p.user_id=(SELECT auth.uid())))) OR public.has_role((SELECT auth.uid()),'super_admin')));
  CREATE POLICY "Super admin read all tickets" ON public.support_tickets FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Users read own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
  CREATE POLICY "Super admin read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'super_admin'));
  CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
`);

for (const table of tables) {
  await pg.exec(`INSERT INTO public.${table}(id,user_id,restaurant_id,auth_user_id) VALUES (1,'${admin}','${restaurant1}','${admin}'),(2,'${owner}','${restaurant2}','${owner}'),(3,'${superAdmin}','${restaurant2}','${superAdmin}')`);
}

async function snapshot({ userId, role, restaurantId, dbRole='authenticated' }) {
  await pg.exec(`RESET ROLE; SET ROLE ${dbRole}; SELECT set_config('test.user_id','${userId || ''}',false); SELECT set_config('test.role','${role || ''}',false); SELECT set_config('test.jwt_role','${dbRole}',false); SELECT set_config('test.restaurant_id','${restaurantId || ''}',false);`);
  const result = {};
  for (const table of tables) result[table] = (await pg.query(`SELECT id FROM public.${table} ORDER BY id`)).rows.map((row) => row.id);
  return result;
}

const actors = [
  { userId: admin, role: 'restaurant_admin', restaurantId: restaurant1 },
  { userId: owner, role: '', restaurantId: restaurant2 },
  { userId: superAdmin, role: 'super_admin', restaurantId: '' },
  { userId: '', role: '', restaurantId: '', dbRole: 'anon' },
];
const before = [];
for (const actor of actors) before.push(await snapshot(actor));
await pg.exec('RESET ROLE');
await pg.exec(readFileSync('supabase/migrations/20261101170000_combine_permissive_rls_policies.sql', 'utf8'));
await pg.exec(readFileSync('supabase/migrations/20261101180000_fix_profile_update_rls_recursion.sql', 'utf8'));
const after = [];
for (const actor of actors) after.push(await snapshot(actor));
assert.deepEqual(after, before, 'combined policies must preserve row visibility for anon, user, restaurant admin, and superadmin');

await pg.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('test.user_id','${admin}',false); SELECT set_config('test.role','restaurant_admin',false); SELECT set_config('test.jwt_role','authenticated',false); SELECT set_config('test.restaurant_id','${restaurant1}',false);`);
assert.equal((await pg.query(`UPDATE public.profiles SET display_name='edited' WHERE user_id='${admin}' RETURNING id`)).rows.length, 1, 'users can edit their own non-tenant profile fields');
await assert.rejects(pg.query(`UPDATE public.profiles SET restaurant_id='${restaurant2}' WHERE user_id='${admin}'`), undefined, 'restaurant admins cannot change their restaurant assignment');
assert.equal((await pg.query(`UPDATE public.profiles SET display_name='cross-tenant' WHERE user_id='${owner}' RETURNING id`)).rows.length, 0, 'restaurant admins cannot edit another profile');
await assert.rejects(pg.query('UPDATE public.delivery_settings SET restaurant_id=$1 WHERE id=1', [restaurant2]), undefined, 'restaurant admins must not move their settings to another restaurant');
await pg.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('test.user_id','${superAdmin}',false); SELECT set_config('test.role','super_admin',false); SELECT set_config('test.jwt_role','authenticated',false); SELECT set_config('test.restaurant_id','',false);`);
assert.equal((await pg.query(`UPDATE public.profiles SET restaurant_id='${restaurant1}' WHERE user_id='${owner}' RETURNING id`)).rows.length, 1, 'superadmin retains cross-restaurant profile management');
await pg.exec('RESET ROLE');
console.log('Isolated PostgreSQL checks passed: merged RLS policies preserve row visibility and delivery tenant write boundaries.');
await pg.close();
