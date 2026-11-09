-- Merge equivalent permissive policies so Postgres evaluates one policy per role/action.
-- Each USING expression is the logical OR of the policies it replaces.

DROP POLICY IF EXISTS "Admin read own audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Super admin read audit_log" ON public.audit_log;
CREATE POLICY audit_log_read_scoped ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'restaurant_admin'::public.app_role)
      AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Super admin read all deletion requests" ON public.data_deletion_requests;
DROP POLICY IF EXISTS "Users read own deletion requests" ON public.data_deletion_requests;
CREATE POLICY deletion_requests_read_scoped ON public.data_deletion_requests
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin read own drivers" ON public.delivery_drivers;
DROP POLICY IF EXISTS delivery_driver_read_own_profile ON public.delivery_drivers;
CREATE POLICY delivery_drivers_read_scoped ON public.delivery_drivers
  FOR SELECT TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'restaurant_admin'::public.app_role)
      AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Admin manage delivery_settings" ON public.delivery_settings;
CREATE POLICY delivery_settings_admin_insert ON public.delivery_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'restaurant_admin'::public.app_role)
      AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    )
  );
CREATE POLICY delivery_settings_admin_update ON public.delivery_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'restaurant_admin'::public.app_role)
      AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'restaurant_admin'::public.app_role)
      AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    )
  );
CREATE POLICY delivery_settings_admin_delete ON public.delivery_settings
  FOR DELETE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'restaurant_admin'::public.app_role)
      AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Super admin read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY profiles_read_scoped ON public.profiles
  FOR SELECT TO public
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Super admin read all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users read own tickets" ON public.support_tickets;
CREATE POLICY support_tickets_read_scoped ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Super admin read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY user_roles_read_scoped ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );
