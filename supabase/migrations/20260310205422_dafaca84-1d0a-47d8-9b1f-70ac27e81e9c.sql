
-- Fix 1: Add auth.uid() guard to loyalty RPC functions
CREATE OR REPLACE FUNCTION public.increment_loyalty_score(p_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_increment integer;
  v_existing record;
  v_new_score integer;
  v_reward boolean;
BEGIN
  -- Guard: only the authenticated user can increment their own score
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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

CREATE OR REPLACE FUNCTION public.claim_loyalty_reward(p_user_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_existing record;
BEGIN
  -- Guard: only the authenticated user can claim their own reward
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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

-- Fix 2: Remove direct INSERT policy on loyalty_progress (function handles inserts)
DROP POLICY IF EXISTS "Users insert own loyalty" ON public.loyalty_progress;

-- Fix 3: Fix orders INSERT policy to enforce restaurant ownership
DROP POLICY IF EXISTS "Secure insert orders" ON public.orders;
CREATE POLICY "Secure insert orders"
ON public.orders
FOR INSERT
TO public
WITH CHECK (
  (guest_session_id = (auth.uid())::text)
  OR (has_role(auth.uid(), 'restaurant_admin'::app_role) AND restaurant_id = get_user_restaurant_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
