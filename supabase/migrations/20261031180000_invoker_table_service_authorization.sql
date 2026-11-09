-- This helper reads only the caller's own role/profile rows, which already have RLS.
-- Run as the caller so it does not need elevated table privileges.
CREATE OR REPLACE FUNCTION public.can_manage_table_service(p_restaurant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.is_active
   AND (ur.role::text = 'super_admin' OR (ur.role::text = 'restaurant_admin' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.restaurant_id = p_restaurant
   )))
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_table_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_table_service(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_manage_table_service(uuid) IS
  'Invoker-rights RLS helper; checks the current caller against their own RLS-protected role and profile.';
