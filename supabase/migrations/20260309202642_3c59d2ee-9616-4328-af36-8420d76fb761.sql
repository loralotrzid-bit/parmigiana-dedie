-- 1. Remove permissive INSERT/UPDATE on driver_locations
--    All location writes now go through delivery-api edge function (service_role)
DROP POLICY IF EXISTS "Allow insert driver location" ON public.driver_locations;
DROP POLICY IF EXISTS "Allow update driver location" ON public.driver_locations;

-- 2. Fix promo_codes: restrict SELECT to authenticated users only
--    and ensure only active, non-expired, non-exhausted codes are visible
DROP POLICY IF EXISTS "Public read active promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Authenticated validate promo codes" ON public.promo_codes;

CREATE POLICY "Authenticated validate active promo codes" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR current_uses < max_uses)
  );