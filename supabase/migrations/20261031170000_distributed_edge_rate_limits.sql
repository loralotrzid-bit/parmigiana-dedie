-- Shared, atomic per-window counters for Edge Function abuse controls.
CREATE TABLE public.edge_request_rate_limits (
  scope text NOT NULL CHECK (scope IN (
    'create-order', 'digital-menu-prepare', 'digital-menu-status',
    'totp-verify', 'driver-session-validate', 'delivery-code'
  )),
  key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  window_started timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key_hash, window_started)
);

CREATE INDEX edge_request_rate_limits_expiry_idx
  ON public.edge_request_rate_limits (expires_at);

ALTER TABLE public.edge_request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.edge_request_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.edge_request_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_edge_request_rate_limit(
  p_scope text,
  p_key_hash text,
  p_max_requests integer,
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
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN (
    'create-order', 'digital-menu-prepare', 'digital-menu-status',
    'totp-verify', 'driver-session-validate', 'delivery-code'
  ) OR p_key_hash !~ '^[a-f0-9]{64}$'
    OR p_max_requests < 1 OR p_max_requests > 10000
    OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  v_window_started := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.edge_request_rate_limits AS limits
    (scope, key_hash, window_started, request_count, expires_at)
  VALUES
    (p_scope, p_key_hash, v_window_started, 1,
     v_window_started + make_interval(secs => p_window_seconds + 60))
  ON CONFLICT (scope, key_hash, window_started)
  DO UPDATE SET
    request_count = least(limits.request_count + 1, p_max_requests + 1),
    expires_at = EXCLUDED.expires_at
  RETURNING request_count INTO v_count;

  -- Opportunistic bounded-frequency cleanup; stale keys cannot accumulate forever.
  IF random() < 0.01 THEN
    WITH stale AS (
      SELECT scope, key_hash, window_started
      FROM public.edge_request_rate_limits
      WHERE expires_at < v_now
      ORDER BY expires_at
      LIMIT 200
    )
    DELETE FROM public.edge_request_rate_limits AS limits
    USING stale
    WHERE limits.scope = stale.scope
      AND limits.key_hash = stale.key_hash
      AND limits.window_started = stale.window_started;
  END IF;

  RETURN v_count <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_request_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_request_rate_limit(text, text, integer, integer)
  TO service_role;

COMMENT ON TABLE public.edge_request_rate_limits IS
  'Hashed, short-lived, service-only counters shared across Edge Function instances.';
COMMENT ON FUNCTION public.consume_edge_request_rate_limit(text, text, integer, integer) IS
  'Atomically consumes a per-identity request quota. Callable only by service_role; fail closed on errors.';
