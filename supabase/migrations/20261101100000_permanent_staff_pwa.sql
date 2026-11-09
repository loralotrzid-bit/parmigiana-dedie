-- Permanent, least-privilege identities for Parmigiana delivery/server staff.
ALTER TABLE public.delivery_drivers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS can_deliver boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_serve boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_drivers_auth_user_unique
  ON public.delivery_drivers(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_drivers_staff_permissions
  ON public.delivery_drivers(restaurant_id, is_active, can_deliver, can_serve);

-- Opening schedule supplied by the restaurant owner; store separate lunch/dinner services.
UPDATE public.restaurants SET opening_hours = '{
  "sunday":{"closed":false,"intervals":[{"open":"12:00","close":"14:30"},{"open":"17:30","close":"23:00"}]},
  "monday":{"closed":true,"intervals":[]},
  "tuesday":{"closed":false,"intervals":[{"open":"11:30","close":"14:30"},{"open":"17:30","close":"22:00"}]},
  "wednesday":{"closed":false,"intervals":[{"open":"12:00","close":"14:30"},{"open":"17:30","close":"22:00"}]},
  "thursday":{"closed":false,"intervals":[{"open":"12:00","close":"14:30"},{"open":"17:30","close":"22:00"}]},
  "friday":{"closed":false,"intervals":[{"open":"17:30","close":"23:00"}]},
  "saturday":{"closed":false,"intervals":[{"open":"12:00","close":"14:30"},{"open":"17:30","close":"23:00"}]}
}'::jsonb WHERE slug = 'la-parmigiana';

DROP POLICY IF EXISTS delivery_driver_read_own_profile ON public.delivery_drivers;
CREATE POLICY delivery_driver_read_own_profile ON public.delivery_drivers
  FOR SELECT TO authenticated USING (auth_user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.staff_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE public.staff_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_push_subscriptions TO authenticated;
GRANT ALL ON public.staff_push_subscriptions TO service_role;
CREATE POLICY staff_manage_own_push_subscriptions ON public.staff_push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.delivery_drivers d WHERE d.auth_user_id = (SELECT auth.uid())
      AND d.restaurant_id = staff_push_subscriptions.restaurant_id AND d.is_active
  ))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.delivery_drivers d WHERE d.auth_user_id = (SELECT auth.uid())
      AND d.restaurant_id = staff_push_subscriptions.restaurant_id AND d.is_active
  ));

-- Server staff may read and process service calls only for their assigned restaurant.
CREATE OR REPLACE FUNCTION public.can_manage_table_service(p_restaurant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.is_active
      AND (ur.role::text = 'super_admin' OR (ur.role::text = 'restaurant_admin' AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.restaurant_id = p_restaurant
      )))
  ) OR EXISTS (
    SELECT 1 FROM public.delivery_drivers d WHERE d.auth_user_id = (SELECT auth.uid())
      AND d.restaurant_id = p_restaurant AND d.is_active AND d.can_serve
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_table_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_table_service(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.staff_order_requests (
  request_id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  staff_user_id uuid NOT NULL REFERENCES auth.users(id),
  payload_signature text NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_order_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_order_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_order_requests TO service_role;

CREATE OR REPLACE FUNCTION public.submit_staff_order(
  p_request_id uuid, p_user_id uuid, p_order jsonb, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.staff_order_requests;
  o public.orders;
  i jsonb;
  oi uuid;
  stock_row record;
  signature text := md5(p_order::text || p_items::text);
BEGIN
  INSERT INTO public.staff_order_requests(request_id, restaurant_id, staff_user_id, payload_signature)
  VALUES(p_request_id, (p_order->>'restaurant_id')::uuid, p_user_id, signature)
  ON CONFLICT DO NOTHING;
  SELECT * INTO request FROM public.staff_order_requests WHERE request_id=p_request_id FOR UPDATE;
  IF request.staff_user_id <> p_user_id OR request.restaurant_id <> (p_order->>'restaurant_id')::uuid
     OR request.payload_signature <> signature THEN RAISE EXCEPTION 'Requete deja utilisee'; END IF;
  IF request.order_id IS NOT NULL THEN
    SELECT * INTO o FROM public.orders WHERE id=request.order_id;
    RETURN to_jsonb(o)-'delivery_code';
  END IF;
  IF p_order->>'order_type' <> 'dine_in' OR coalesce((p_order->>'table_number')::integer, 0) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Commande de salle invalide';
  END IF;
  FOR stock_row IN
    SELECT p.id, sum((x->>'quantity')::integer) AS quantity
    FROM public.products p JOIN jsonb_array_elements(p_items) x ON p.id=(x->>'product_id')::uuid
    GROUP BY p.id ORDER BY p.id
  LOOP
    PERFORM 1 FROM public.products WHERE id=stock_row.id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=stock_row.id AND is_available AND is_published AND (stock IS NULL OR stock >= stock_row.quantity)) THEN
      RAISE EXCEPTION 'Stock insuffisant';
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_tables t WHERE t.restaurant_id=request.restaurant_id
      AND t.table_number=(p_order->>'table_number')::integer AND t.is_active
  ) THEN RAISE EXCEPTION 'Table inactive'; END IF;
  INSERT INTO public.orders(restaurant_id, guest_session_id, order_number, order_type, order_source, status,
    payment_status, subtotal, total, note, client_phone, table_number, payment_method, delivery_fee)
  VALUES(request.restaurant_id, p_user_id::text, public.next_order_number(request.restaurant_id), 'dine_in', 'server',
    'pending', 'unpaid', (p_order->>'subtotal')::numeric, (p_order->>'total')::numeric,
    p_order->>'note', nullif(p_order->>'client_phone',''), (p_order->>'table_number')::integer,
    p_order->>'payment_method', 0) RETURNING * INTO o;
  FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items(order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES(o.id, (i->>'product_id')::uuid, i->>'_server_product_name', (i->>'quantity')::integer,
      (i->>'_server_unit_price')::numeric, (i->>'_server_unit_price')::numeric*(i->>'quantity')::integer)
    RETURNING id INTO oi;
    INSERT INTO public.order_item_choices(order_item_id, option_name, price_supplement)
      SELECT oi, x->>'name', (x->>'price')::numeric FROM jsonb_array_elements(coalesce(i->'options','[]'::jsonb)) x;
  END LOOP;
  UPDATE public.staff_order_requests SET order_id=o.id WHERE request_id=p_request_id;
  RETURN to_jsonb(o)-'delivery_code';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_staff_order(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staff_order(uuid,uuid,jsonb,jsonb) TO service_role;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS served_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS served_at timestamptz;
