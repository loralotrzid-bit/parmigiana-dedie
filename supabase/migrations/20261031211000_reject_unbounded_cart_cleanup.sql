CREATE OR REPLACE FUNCTION public.cleanup_abandoned_carts(p_batch_size integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cart_id uuid;
  v_deleted integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 5000 THEN
    RAISE EXCEPTION 'invalid batch size' USING ERRCODE = '22023';
  END IF;

  FOR v_cart_id IN
    SELECT id FROM public.carts
    WHERE status IN ('active', 'merged') AND updated_at < now() - interval '7 days'
    ORDER BY updated_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
    DELETE FROM public.carts WHERE id = v_cart_id;
    v_deleted := v_deleted + 1;
  END LOOP;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_abandoned_carts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_carts(integer) TO service_role;
