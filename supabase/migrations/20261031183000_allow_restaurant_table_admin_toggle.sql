GRANT UPDATE (is_active) ON public.restaurant_tables TO authenticated;

CREATE POLICY restaurant_admin_manage_tables
ON public.restaurant_tables
FOR UPDATE
TO authenticated
USING (public.can_manage_table_service(restaurant_id))
WITH CHECK (public.can_manage_table_service(restaurant_id));
