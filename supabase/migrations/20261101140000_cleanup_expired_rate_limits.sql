-- Expired rate-limit buckets can never be used again; remove them in bounded batches.
CREATE OR REPLACE FUNCTION public.cleanup_expired_edge_rate_limits(p_batch_size integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 5000 THEN
    RAISE EXCEPTION 'invalid batch size' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT scope, key_hash, window_started
    FROM public.edge_request_rate_limits
    WHERE expires_at < statement_timestamp()
    ORDER BY expires_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.edge_request_rate_limits AS limits
  USING expired
  WHERE limits.scope = expired.scope
    AND limits.key_hash = expired.key_hash
    AND limits.window_started = expired.window_started;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_edge_rate_limits(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_edge_rate_limits(integer) TO service_role;
COMMENT ON FUNCTION public.cleanup_expired_edge_rate_limits(integer) IS
  'Deletes only expired hashed request counters in bounded batches; scheduled every 15 minutes.';

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'parmigiana-rate-limit-cleanup'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
  PERFORM cron.schedule(
    'parmigiana-rate-limit-cleanup',
    '*/15 * * * *',
    'SELECT public.cleanup_expired_edge_rate_limits(5000);'
  );
END;
$$;
