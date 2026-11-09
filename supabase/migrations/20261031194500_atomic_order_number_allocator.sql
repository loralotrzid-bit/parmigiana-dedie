-- Reserve one daily order number atomically so concurrent checkouts cannot
-- receive the same number. The business day rolls over at 05:00 Brussels time.
CREATE TABLE IF NOT EXISTS public.restaurant_order_number_counters (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  last_number integer NOT NULL CHECK (last_number BETWEEN 1 AND 9999),
  PRIMARY KEY (restaurant_id, business_date)
);

ALTER TABLE public.restaurant_order_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_order_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.restaurant_order_number_counters TO service_role;

-- Continue today's existing sequence rather than restarting at 1 on deploy.
WITH business_day AS (
  SELECT (timezone('Europe/Brussels', now()) - interval '5 hours')::date AS value
)
INSERT INTO public.restaurant_order_number_counters (restaurant_id, business_date, last_number)
SELECT o.restaurant_id, d.value, LEAST(9999, GREATEST(1, max(o.order_number)))
FROM public.orders o CROSS JOIN business_day d
WHERE (timezone('Europe/Brussels', o.created_at) - interval '5 hours')::date = d.value
GROUP BY o.restaurant_id, d.value
ON CONFLICT (restaurant_id, business_date) DO UPDATE
SET last_number = GREATEST(public.restaurant_order_number_counters.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION public.next_order_number(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_date date := (timezone('Europe/Brussels', now()) - interval '5 hours')::date;
  v_number integer;
BEGIN
  INSERT INTO public.restaurant_order_number_counters AS counter (restaurant_id, business_date, last_number)
  VALUES (p_restaurant_id, v_business_date, 1)
  ON CONFLICT (restaurant_id, business_date) DO UPDATE
    SET last_number = counter.last_number + 1
    WHERE counter.last_number < 9999
  RETURNING last_number INTO v_number;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'Daily order number limit reached';
  END IF;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.next_order_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO service_role;

-- Index the hot order listing and its common joins for the POS/admin workload.
CREATE INDEX IF NOT EXISTS orders_restaurant_status_created_idx
  ON public.orders (restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_item_choices_order_item_id_idx
  ON public.order_item_choices (order_item_id);
