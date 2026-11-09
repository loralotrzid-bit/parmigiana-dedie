
-- ============================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================

-- ── FIX 1: Profile restaurant_id privilege escalation (CRITICAL) ──
-- Prevent non-super_admin users from changing restaurant_id on their profile.
-- Drop existing permissive user update policy, replace with restricted one.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (
    -- restaurant_id must remain unchanged (compare with current value)
    restaurant_id IS NOT DISTINCT FROM (
      SELECT p.restaurant_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    -- OR the user is a super_admin (allowed to change it)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ── FIX 2: Promo code enumeration (HIGH) ──
-- Remove open SELECT that lets any authenticated user enumerate all active codes.
DROP POLICY IF EXISTS "Authenticated validate active promo codes" ON public.promo_codes;

-- Create a secure RPC for promo code validation (returns only validation result)
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_restaurant_id uuid,
  p_code text,
  p_order_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_promo record;
  v_sanitized text;
BEGIN
  v_sanitized := upper(trim(p_code));
  
  SELECT * INTO v_promo
  FROM public.promo_codes
  WHERE restaurant_id = p_restaurant_id
    AND code = v_sanitized
    AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Code promo invalide.');
  END IF;
  
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Ce code promo a expiré.');
  END IF;
  
  IF v_promo.max_uses IS NOT NULL AND v_promo.current_uses >= v_promo.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Ce code promo a atteint sa limite d''utilisation.');
  END IF;
  
  IF p_order_total < COALESCE(v_promo.min_order_amount, 0) THEN
    RETURN jsonb_build_object('valid', false, 'error', 
      'Commande minimum de ' || COALESCE(v_promo.min_order_amount, 0) || ' € requise.');
  END IF;
  
  RETURN jsonb_build_object(
    'valid', true,
    'promo_id', v_promo.id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'min_order_amount', COALESCE(v_promo.min_order_amount, 0)
  );
END;
$$;

-- ── FIX 3: Public restaurants table exposure (MEDIUM) ──
-- Restrict public read to only visible restaurants.
DROP POLICY IF EXISTS "Public read restaurants" ON public.restaurants;

CREATE POLICY "Public read visible restaurants"
ON public.restaurants
FOR SELECT
TO public
USING (
  is_visible = true
  OR has_role(auth.uid(), 'restaurant_admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
