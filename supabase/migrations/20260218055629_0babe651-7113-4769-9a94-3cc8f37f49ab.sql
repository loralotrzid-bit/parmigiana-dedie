
-- 1. Add geo + delivery config + hours to restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS latitude numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS delivery_flat_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_free_under_km numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_per_km_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_delivery_radius_km numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb NOT NULL DEFAULT '{}';

-- 2. Create ETA learning table
CREATE TABLE IF NOT EXISTS public.eta_learning (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  total_orders integer NOT NULL DEFAULT 0,
  avg_announced_eta numeric NOT NULL DEFAULT 0,
  avg_real_duration numeric NOT NULL DEFAULT 0,
  correction_margin numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, week_start)
);

ALTER TABLE public.eta_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read own eta_learning"
  ON public.eta_learning FOR SELECT
  USING (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Service insert eta_learning"
  ON public.eta_learning FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service update eta_learning"
  ON public.eta_learning FOR UPDATE
  USING (true);

-- 3. Add RLS for restaurant updates by admin
CREATE POLICY "Admin update own restaurant"
  ON public.restaurants FOR UPDATE
  USING (
    (has_role(auth.uid(), 'restaurant_admin') AND id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );
