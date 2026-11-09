ALTER TABLE public.restaurants ADD COLUMN digital_menu_enabled boolean NOT NULL DEFAULT false, ADD COLUMN takeaway_discount numeric(8,2) NOT NULL DEFAULT 0 CHECK(takeaway_discount>=0);
ALTER TABLE public.products ADD COLUMN weekend_only boolean NOT NULL DEFAULT false;
CREATE TABLE public.digital_menu_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 token_hash text NOT NULL UNIQUE, cart_session_id text NOT NULL UNIQUE, order_id uuid REFERENCES public.orders(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.digital_menu_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.digital_menu_sessions FROM anon, authenticated;
GRANT ALL ON public.digital_menu_sessions TO service_role;
GRANT SELECT(digital_menu_enabled,takeaway_discount) ON public.restaurants TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_digital_menu_order(p_session_id uuid,p_order jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.digital_menu_sessions; o public.orders; i jsonb; oi uuid; stock_row record;
BEGIN
 SELECT * INTO s FROM public.digital_menu_sessions WHERE id=p_session_id AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session expirée'; END IF;
 IF s.order_id IS NOT NULL THEN SELECT * INTO o FROM public.orders WHERE id=s.order_id; RETURN to_jsonb(o)-'delivery_code'; END IF;
 IF p_order->>'order_type' NOT IN ('dine_in','takeaway') THEN RAISE EXCEPTION 'Mode invalide'; END IF;
 -- Lock inventory in deterministic order; no partial orders or duplicate submissions.
 FOR stock_row IN SELECT p.id,p.stock,p.is_available,p.is_published,sum((x->>'quantity')::integer) AS quantity FROM public.products p JOIN jsonb_array_elements(p_items) x ON p.id=(x->>'product_id')::uuid GROUP BY p.id ORDER BY p.id LOOP
   PERFORM 1 FROM public.products WHERE id=stock_row.id FOR UPDATE;
   IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=stock_row.id AND is_available AND is_published AND (stock IS NULL OR stock>=stock_row.quantity)) THEN RAISE EXCEPTION 'Produit indisponible ou stock insuffisant'; END IF;
 END LOOP;
 INSERT INTO public.orders(restaurant_id,guest_session_id,order_number,order_type,order_source,status,payment_status,subtotal,total,note,client_phone,table_number,payment_method,cash_details)
 VALUES(s.restaurant_id,s.cart_session_id,public.next_order_number(s.restaurant_id),p_order->>'order_type','qr','pending','unpaid',(p_order->>'subtotal')::numeric,(p_order->>'total')::numeric,p_order->>'note',p_order->>'client_phone',(p_order->>'table_number')::integer,p_order->>'payment_method',p_order->'cash_details') RETURNING * INTO o;
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   INSERT INTO public.order_items(order_id,product_id,product_name,quantity,unit_price,total_price) VALUES(o.id,(i->>'product_id')::uuid,i->>'_server_product_name',(i->>'quantity')::integer,(i->>'_server_unit_price')::numeric,(i->>'_server_unit_price')::numeric*(i->>'quantity')::integer) RETURNING id INTO oi;
   INSERT INTO public.order_item_choices(order_item_id,option_name,price_supplement) SELECT oi,x->>'name',(x->>'price')::numeric FROM jsonb_array_elements(coalesce(i->'options','[]'::jsonb)) x;
 END LOOP;
 UPDATE public.digital_menu_sessions SET order_id=o.id WHERE id=s.id;
 RETURN to_jsonb(o)-'delivery_code';
END; $$;
REVOKE ALL ON FUNCTION public.submit_digital_menu_order(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_digital_menu_order(uuid,jsonb,jsonb) TO service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.digital_menu_sessions;
