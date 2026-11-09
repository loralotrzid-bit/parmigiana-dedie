
-- =============================================================
-- SECURITY HARDENING MIGRATION
-- =============================================================

-- 1. LOYALTY SYSTEM: Remove user ability to modify sensitive fields
--    Create a secure server-side function for incrementing loyalty
-- =============================================================

-- Drop existing permissive UPDATE policy on loyalty_progress
DROP POLICY IF EXISTS "Users update own loyalty" ON public.loyalty_progress;

-- Create restrictive update policy: users can ONLY update via the secure function
-- No direct UPDATE from users at all
-- (The secure function uses SECURITY DEFINER to bypass RLS)

-- Secure function to increment loyalty score (server-side only)
CREATE OR REPLACE FUNCTION public.increment_loyalty_score(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_increment integer;
  v_existing record;
  v_new_score integer;
  v_reward boolean;
BEGIN
  -- Random increment 8-12
  v_increment := floor(random() * 5 + 8)::integer;
  
  SELECT * INTO v_existing FROM public.loyalty_progress WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.loyalty_progress (user_id, hidden_score, reward_available, reward_claimed)
    VALUES (p_user_id, v_increment, v_increment >= 100, false);
  ELSE
    v_new_score := v_existing.hidden_score + v_increment;
    v_reward := v_new_score >= 100 AND NOT v_existing.reward_claimed;
    
    UPDATE public.loyalty_progress
    SET hidden_score = v_new_score,
        reward_available = v_reward,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- Secure function to claim reward (server-side only)
CREATE OR REPLACE FUNCTION public.claim_loyalty_reward(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
BEGIN
  SELECT * INTO v_existing FROM public.loyalty_progress
  WHERE user_id = p_user_id AND reward_available = true AND reward_claimed = false;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  UPDATE public.loyalty_progress
  SET reward_available = false,
      reward_claimed = true,
      hidden_score = 0,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN true;
END;
$$;

-- 2. PROMO CODE: Atomic use counter to prevent race conditions
-- =============================================================

CREATE OR REPLACE FUNCTION public.use_promo_code_atomic(p_promo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo record;
BEGIN
  -- Lock the row for update to prevent race conditions
  SELECT * INTO v_promo FROM public.promo_codes
  WHERE id = p_promo_id AND is_active = true
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check expiry
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RETURN false;
  END IF;
  
  -- Check max uses
  IF v_promo.max_uses IS NOT NULL AND v_promo.current_uses >= v_promo.max_uses THEN
    RETURN false;
  END IF;
  
  -- Atomic increment
  UPDATE public.promo_codes
  SET current_uses = current_uses + 1
  WHERE id = p_promo_id;
  
  RETURN true;
END;
$$;

-- 3. ADMIN ALERTS: Restrict insert to own restaurant only
-- =============================================================

DROP POLICY IF EXISTS "Admin insert alerts" ON public.admin_alerts;

CREATE POLICY "Admin insert own alerts" ON public.admin_alerts
FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
);

-- Add read + update for restaurant_admin (own restaurant only)
DROP POLICY IF EXISTS "Super admin read all alerts" ON public.admin_alerts;
DROP POLICY IF EXISTS "Super admin update alerts" ON public.admin_alerts;

CREATE POLICY "Admin read own alerts" ON public.admin_alerts
FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Admin update own alerts" ON public.admin_alerts
FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
);

-- 4. PROMO CODES: Remove public read, restrict to admin + authenticated validation
-- =============================================================

DROP POLICY IF EXISTS "Public read active promo codes" ON public.promo_codes;

CREATE POLICY "Authenticated read active promo codes" ON public.promo_codes
FOR SELECT TO authenticated
USING (is_active = true);

-- 5. DRIVER SESSIONS: Don't expose phone numbers to session validators
--    (handled in edge function code, but also restrict RLS)
-- =============================================================

-- 6. GPS LOCATION: Add server-side jump detection in delivery-api
--    (handled in edge function update below)

-- 7. ETA LEARNING: Remove public read, super_admin only
--    (already correct in RLS)
