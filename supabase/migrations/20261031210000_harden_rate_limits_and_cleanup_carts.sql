-- Add a dedicated quota scope for superadmin-only AI diagnostics.
ALTER TABLE public.edge_request_rate_limits
  DROP CONSTRAINT IF EXISTS edge_request_rate_limits_scope_check;
ALTER TABLE public.edge_request_rate_limits
  ADD CONSTRAINT edge_request_rate_limits_scope_check CHECK (scope IN (
    'create-order', 'digital-menu-prepare', 'digital-menu-status', 'cart-api',
    'totp-verify', 'driver-session-validate', 'delivery-code', 'site-diagnostic'
  ));

CREATE OR REPLACE FUNCTION public.consume_edge_request_rate_limit_pair(
  p_scope text,
  p_primary_key_hash text,
  p_primary_max_requests integer,
  p_secondary_key_hash text,
  p_secondary_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_window_started timestamptz;
  v_primary_count integer;
  v_secondary_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_scope NOT IN (
    'create-order', 'digital-menu-prepare', 'digital-menu-status', 'cart-api',
    'totp-verify', 'driver-session-validate', 'delivery-code', 'site-diagnostic'
  ) OR p_primary_key_hash !~ '^[a-f0-9]{64}$'
    OR p_secondary_key_hash !~ '^[a-f0-9]{64}$'
    OR p_primary_key_hash = p_secondary_key_hash
    OR p_primary_max_requests < 1 OR p_primary_max_requests > 10000
    OR p_secondary_max_requests < 1 OR p_secondary_max_requests > 10000
    OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  v_window_started := to_timestamp(floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.edge_request_rate_limits AS limits
    (scope, key_hash, window_started, request_count, expires_at)
  VALUES (p_scope, p_primary_key_hash, v_window_started, 1,
    v_window_started + make_interval(secs => p_window_seconds + 60))
  ON CONFLICT (scope, key_hash, window_started)
  DO UPDATE SET request_count = least(limits.request_count + 1, p_primary_max_requests + 1), expires_at = EXCLUDED.expires_at
  RETURNING request_count INTO v_primary_count;

  INSERT INTO public.edge_request_rate_limits AS limits
    (scope, key_hash, window_started, request_count, expires_at)
  VALUES (p_scope, p_secondary_key_hash, v_window_started, 1,
    v_window_started + make_interval(secs => p_window_seconds + 60))
  ON CONFLICT (scope, key_hash, window_started)
  DO UPDATE SET request_count = least(limits.request_count + 1, p_secondary_max_requests + 1), expires_at = EXCLUDED.expires_at
  RETURNING request_count INTO v_secondary_count;

  RETURN v_primary_count <= p_primary_max_requests AND v_secondary_count <= p_secondary_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_request_rate_limit_pair(text, text, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_request_rate_limit_pair(text, text, integer, text, integer, integer)
  TO service_role;

-- The daily job deletes abandoned carts in a bounded batch, including their child rows.
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

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'parmigiana-cart-cleanup'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
  PERFORM cron.schedule('parmigiana-cart-cleanup', '15 3 * * *', 'SELECT public.cleanup_abandoned_carts(1000);');
END;
$$;
