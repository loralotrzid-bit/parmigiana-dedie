
-- 1. Loyalty progress table
CREATE TABLE public.loyalty_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  hidden_score integer NOT NULL DEFAULT 0,
  reward_available boolean NOT NULL DEFAULT false,
  reward_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.loyalty_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own loyalty" ON public.loyalty_progress
  FOR SELECT USING (user_id = (auth.uid())::text);

CREATE POLICY "Service upsert loyalty" ON public.loyalty_progress
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Delivery settings table (temp disable delivery)
CREATE TABLE public.delivery_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  delivery_paused boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  paused_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id)
);

ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read delivery_settings" ON public.delivery_settings
  FOR SELECT USING (true);

CREATE POLICY "Admin update delivery_settings" ON public.delivery_settings
  FOR ALL USING (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );

-- 3. Promo codes table
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  min_order_amount numeric DEFAULT 0,
  max_uses integer,
  current_uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, code)
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active promo codes" ON public.promo_codes
  FOR SELECT USING (true);

CREATE POLICY "Admin manage promo codes" ON public.promo_codes
  FOR ALL USING (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );
