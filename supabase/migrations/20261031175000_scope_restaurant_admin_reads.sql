-- Keep public discovery, but scope hidden restaurant rows to their own admin.
DROP POLICY IF EXISTS "Public read visible restaurants" ON public.restaurants;
CREATE POLICY "Public read visible restaurants"
ON public.restaurants
FOR SELECT
TO public
USING (
  is_visible = true
  OR (public.has_role(auth.uid(), 'restaurant_admin'::public.app_role)
      AND id = public.get_user_restaurant_id(auth.uid()))
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Deletion requests contain personal data and have no restaurant scope column.
-- Only the owner and active superadmins may read them.
DROP POLICY IF EXISTS "Admin read deletion requests" ON public.data_deletion_requests;
