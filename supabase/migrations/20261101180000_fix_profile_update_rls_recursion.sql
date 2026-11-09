-- Remove a self-query from the profile UPDATE policy. The previous WITH CHECK
-- selected from profiles again, recursively invoking profiles RLS.
CREATE OR REPLACE FUNCTION public.prevent_profile_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Profile restaurant assignment cannot be changed by this role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_tenant_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_tenant_change ON public.profiles;
CREATE TRIGGER profiles_prevent_tenant_change
  BEFORE UPDATE OF restaurant_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_tenant_change();

DROP POLICY IF EXISTS "Super admin update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY profiles_update_scoped ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR user_id = (SELECT auth.uid())
  );
