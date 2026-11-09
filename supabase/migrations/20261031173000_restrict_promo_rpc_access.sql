-- Limit role helper RPCs to authenticated users. RLS policies still work for signed-in application sessions.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_restaurant_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_id(uuid) TO authenticated, service_role;

-- Promo validation/redemption is not transactionally coupled to order creation yet.
-- Prevent direct browser RPC calls that leak promo metadata or consume usage counters.
REVOKE ALL ON FUNCTION public.validate_promo_code(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(uuid, text, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.use_promo_code_atomic(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_promo_code_atomic(uuid) TO service_role;

COMMENT ON FUNCTION public.validate_promo_code(uuid, text, numeric) IS
  'Service-role only until validation and discount redemption are integrated atomically into order creation.';
COMMENT ON FUNCTION public.use_promo_code_atomic(uuid) IS
  'Service-role only; client-side promo redemption is disabled until order creation consumes promo atomically.';
