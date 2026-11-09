-- SECURITY DEFINER helpers must not let an arbitrary caller enumerate other users.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles own_role
        WHERE own_role.user_id = auth.uid()
          AND own_role.role = 'super_admin'::public.app_role
          AND own_role.is_active
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles target_role
      WHERE target_role.user_id = _user_id
        AND target_role.role = _role
        AND target_role.is_active
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_restaurant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.restaurant_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
    AND auth.uid() IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles own_role
        WHERE own_role.user_id = auth.uid()
          AND own_role.role = 'super_admin'::public.app_role
          AND own_role.is_active
      )
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.has_role(uuid,public.app_role) IS
  'Returns role membership only for the caller or an active super_admin; prevents role enumeration by arbitrary user ID.';
COMMENT ON FUNCTION public.get_user_restaurant_id(uuid) IS
  'Returns restaurant scope only for the caller or an active super_admin; prevents profile scope enumeration.';
