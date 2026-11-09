-- Loyalty points are intentionally paused until the reward program is defined.
-- Prevent a client from invoking the SECURITY DEFINER function repeatedly to farm points.
REVOKE EXECUTE ON FUNCTION public.increment_loyalty_score(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_loyalty_score(text) TO service_role;

COMMENT ON FUNCTION public.increment_loyalty_score(text) IS
  'Server-only award function. Browser roles cannot mint loyalty points; enable a validated, idempotent order-award flow before reopening.';
