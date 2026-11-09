-- The Parmigiana reward program is not active yet; keep its RPC inaccessible to browser roles.
REVOKE EXECUTE ON FUNCTION public.claim_loyalty_reward(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_loyalty_reward(text) TO service_role;

COMMENT ON FUNCTION public.claim_loyalty_reward(text) IS
  'Server-only claim function. Customer reward redemption remains paused until the loyalty program is launched.';
