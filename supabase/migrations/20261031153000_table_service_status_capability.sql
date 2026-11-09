-- A scanned table capability may read only whether its own call is active.
CREATE OR REPLACE FUNCTION public.get_table_service_status(p_token uuid)
RETURNS TABLE(status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.status::text
  FROM public.restaurant_tables t
  JOIN public.restaurants r ON r.id = t.restaurant_id
  JOIN public.table_service_calls c ON c.table_id = t.id
  WHERE t.qr_token = p_token
    AND t.is_active
    AND r.slug = 'la-parmigiana'
    AND r.digital_menu_enabled
    AND c.status IN ('pending', 'acknowledged')
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_table_service_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_service_status(uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.get_table_service_status(uuid) IS
  'QR capability returns only the active call state for its own table; no call history or identity.';
