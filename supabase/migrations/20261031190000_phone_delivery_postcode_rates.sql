ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS phone_delivery_fallback_fee numeric(8,2) NOT NULL DEFAULT 15.00
  CHECK (phone_delivery_fallback_fee >= 0 AND phone_delivery_fallback_fee <= 100);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_postcode text
  CHECK (delivery_postcode IS NULL OR delivery_postcode ~ '^\d{4}$');

CREATE TABLE IF NOT EXISTS public.restaurant_delivery_postcode_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  postcode text NOT NULL CHECK (postcode ~ '^6\d{3}$'),
  locality text NOT NULL DEFAULT '',
  fee numeric(8,2) NOT NULL CHECK (fee >= 0 AND fee <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, postcode)
);

ALTER TABLE public.restaurant_delivery_postcode_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_delivery_postcode_rates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_delivery_postcode_rates TO authenticated;
GRANT ALL ON public.restaurant_delivery_postcode_rates TO service_role;
DROP POLICY IF EXISTS restaurant_admin_manage_postcode_rates ON public.restaurant_delivery_postcode_rates;
CREATE POLICY restaurant_admin_manage_postcode_rates
  ON public.restaurant_delivery_postcode_rates FOR ALL TO authenticated
  USING (public.can_manage_table_service(restaurant_id))
  WITH CHECK (public.can_manage_table_service(restaurant_id));

-- Initial editable sample rates for La Parmigiana (Charleroi area).
INSERT INTO public.restaurant_delivery_postcode_rates (restaurant_id, postcode, locality, fee)
SELECT r.id, seed.postcode, seed.locality, seed.fee
FROM public.restaurants r
CROSS JOIN (VALUES
  ('6000', 'Charleroi', 5.50),
  ('6001', 'Marcinelle', 6.00),
  ('6010', 'Couillet', 7.00),
  ('6020', 'Dampremy', 7.50),
  ('6030', 'Marchienne-au-Pont', 8.00),
  ('6031', 'Monceau-sur-Sambre', 6.50),
  ('6032', 'Mont-sur-Marchienne', 7.50),
  ('6040', 'Jumet', 8.00),
  ('6041', 'Gosselies', 9.00),
  ('6042', 'Lodelinsart', 10.00)
) AS seed(postcode, locality, fee)
WHERE r.slug = 'la-parmigiana'
ON CONFLICT (restaurant_id, postcode) DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_phone_order(p_request_id uuid, p_user_id uuid, p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE request public.phone_order_requests; o public.orders; i jsonb; oi uuid; stock_row record;
 signature text := md5(p_order::text || p_items::text);
BEGIN
 INSERT INTO public.phone_order_requests(request_id,restaurant_id,staff_user_id,payload_signature)
 VALUES(p_request_id,(p_order->>'restaurant_id')::uuid,p_user_id,signature) ON CONFLICT DO NOTHING;
 SELECT * INTO request FROM public.phone_order_requests WHERE request_id=p_request_id FOR UPDATE;
 IF request.staff_user_id<>p_user_id OR request.restaurant_id<>(p_order->>'restaurant_id')::uuid OR request.payload_signature<>signature THEN RAISE EXCEPTION 'Requete deja utilisee'; END IF;
 IF request.order_id IS NOT NULL THEN SELECT * INTO o FROM public.orders WHERE id=request.order_id; RETURN to_jsonb(o)-'delivery_code'; END IF;
 FOR stock_row IN SELECT p.id,sum((x->>'quantity')::integer) AS quantity FROM public.products p JOIN jsonb_array_elements(p_items) x ON p.id=(x->>'product_id')::uuid GROUP BY p.id ORDER BY p.id LOOP
  PERFORM 1 FROM public.products WHERE id=stock_row.id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=stock_row.id AND is_available AND is_published AND (stock IS NULL OR stock>=stock_row.quantity)) THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
 END LOOP;
 INSERT INTO public.orders(restaurant_id,guest_session_id,order_number,order_type,order_source,status,payment_status,subtotal,total,note,client_phone,payment_method,delivery_address,delivery_postcode,delivery_lat,delivery_lng,delivery_fee,scheduled_at)
 VALUES(request.restaurant_id,p_user_id::text,public.next_order_number(request.restaurant_id),p_order->>'order_type','phone','pending','unpaid',(p_order->>'subtotal')::numeric,(p_order->>'total')::numeric,p_order->>'note',p_order->>'client_phone',p_order->>'payment_method',p_order->>'delivery_address',p_order->>'delivery_postcode',(p_order->>'delivery_lat')::numeric,(p_order->>'delivery_lng')::numeric,(p_order->>'delivery_fee')::numeric,(p_order->>'scheduled_at')::timestamptz) RETURNING * INTO o;
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  INSERT INTO public.order_items(order_id,product_id,product_name,quantity,unit_price,total_price) VALUES(o.id,(i->>'product_id')::uuid,i->>'_server_product_name',(i->>'quantity')::integer,(i->>'_server_unit_price')::numeric,(i->>'_server_unit_price')::numeric*(i->>'quantity')::integer) RETURNING id INTO oi;
  INSERT INTO public.order_item_choices(order_item_id,option_name,price_supplement) SELECT oi,x->>'name',(x->>'price')::numeric FROM jsonb_array_elements(coalesce(i->'options','[]'::jsonb)) x;
 END LOOP;
 UPDATE public.phone_order_requests SET order_id=o.id WHERE request_id=p_request_id;
 RETURN to_jsonb(o)-'delivery_code';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_phone_order(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_phone_order(uuid,uuid,jsonb,jsonb) TO service_role;
