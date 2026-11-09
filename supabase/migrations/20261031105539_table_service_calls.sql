-- Apply this migration only, after reconciling the existing migration history.
-- The QR token is a table capability. A shared link does not prove physical presence.
CREATE TABLE public.restaurant_tables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 table_number integer NOT NULL CHECK (table_number BETWEEN 1 AND 10),
 qr_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 is_active boolean NOT NULL DEFAULT true,
 last_call_at timestamptz,
 UNIQUE(restaurant_id, table_number)
);
CREATE TABLE public.table_service_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 table_id uuid NOT NULL REFERENCES public.restaurant_tables(id),
 table_number integer NOT NULL CHECK (table_number BETWEEN 1 AND 10),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_by uuid REFERENCES auth.users(id),
 resolved_at timestamptz
);
CREATE UNIQUE INDEX one_active_call_per_table ON public.table_service_calls(table_id) WHERE status IN ('pending','acknowledged');
CREATE INDEX service_calls_restaurant_status ON public.table_service_calls(restaurant_id,status,created_at);
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_service_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_tables, public.table_service_calls FROM anon, authenticated;
GRANT SELECT ON public.restaurant_tables, public.table_service_calls TO authenticated;
GRANT ALL ON public.restaurant_tables, public.table_service_calls TO service_role;

-- Check active roles explicitly, rather than relying on stale frontend state.
CREATE FUNCTION public.can_manage_table_service(p_restaurant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id=auth.uid() AND ur.is_active
   AND (ur.role::text='super_admin' OR (ur.role::text='restaurant_admin' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.restaurant_id=p_restaurant
   )))
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_table_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_table_service(uuid) TO authenticated;
CREATE POLICY read_own_restaurant_tables ON public.restaurant_tables FOR SELECT TO authenticated USING (public.can_manage_table_service(restaurant_id));
CREATE POLICY read_own_table_calls ON public.table_service_calls FOR SELECT TO authenticated USING (public.can_manage_table_service(restaurant_id));

-- Public capabilities expose only the label of the scanned table, never call history.
CREATE FUNCTION public.get_service_table(p_token uuid) RETURNS TABLE(table_number integer, restaurant_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT t.table_number,r.name::text FROM public.restaurant_tables t JOIN public.restaurants r ON r.id=t.restaurant_id
 WHERE t.qr_token=p_token AND t.is_active AND r.slug='la-parmigiana' AND r.digital_menu_enabled AND r.dine_in_enabled;
$$;
REVOKE ALL ON FUNCTION public.get_service_table(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_table(uuid) TO anon,authenticated;

CREATE FUNCTION public.request_table_service(p_token uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.restaurant_tables; existing_status text;
BEGIN
 SELECT rt.* INTO t FROM public.restaurant_tables rt JOIN public.restaurants r ON r.id=rt.restaurant_id
 WHERE rt.qr_token=p_token AND rt.is_active AND r.slug='la-parmigiana' AND r.digital_menu_enabled AND r.dine_in_enabled
 FOR UPDATE OF rt;
 IF NOT FOUND THEN RAISE EXCEPTION 'Table inaccessible'; END IF;
 SELECT status INTO existing_status FROM public.table_service_calls WHERE table_id=t.id AND status IN ('pending','acknowledged');
 IF FOUND THEN RETURN existing_status; END IF;
 IF t.last_call_at > now()-interval '30 seconds' THEN RAISE EXCEPTION 'Veuillez patienter avant un nouvel appel'; END IF;
 INSERT INTO public.table_service_calls(restaurant_id,table_id,table_number) VALUES(t.restaurant_id,t.id,t.table_number);
 UPDATE public.restaurant_tables SET last_call_at=now() WHERE id=t.id;
 RETURN 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.request_table_service(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_table_service(uuid) TO anon,authenticated;

-- Only these transitions are writable. Table identity cannot be reassigned by clients.
CREATE FUNCTION public.advance_table_service(p_id uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.table_service_calls;
BEGIN
 SELECT * INTO c FROM public.table_service_calls WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_manage_table_service(c.restaurant_id) THEN RAISE EXCEPTION 'Acces refuse' USING ERRCODE='42501'; END IF;
 IF p_status='acknowledged' AND c.status='pending' THEN
  UPDATE public.table_service_calls SET status='acknowledged',acknowledged_by=auth.uid() WHERE id=p_id;
 ELSIF p_status='resolved' AND c.status='acknowledged' THEN
  UPDATE public.table_service_calls SET status='resolved',resolved_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Etat deja modifie, actualisez'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_table_service(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_table_service(uuid,text) TO authenticated;

INSERT INTO public.restaurant_tables(restaurant_id,table_number)
 SELECT r.id,n FROM public.restaurants r CROSS JOIN generate_series(1,10) n WHERE r.slug='la-parmigiana';
ALTER TABLE public.digital_menu_sessions ADD COLUMN table_number integer CHECK(table_number BETWEEN 1 AND 10);

-- Existing order_source is text in this project's schema. The phone source is
-- accepted only after an active restaurant-admin/super-admin check in create-order.
COMMENT ON TABLE public.table_service_calls IS 'Restaurant service requests; anonymous callers have RPC capability access only, not table access.';

-- Durable idempotency and atomic inserts for phone orders created by staff.
CREATE TABLE public.phone_order_requests (
 request_id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 staff_user_id uuid NOT NULL REFERENCES auth.users(id), payload_signature text NOT NULL,
 order_id uuid REFERENCES public.orders(id)
);
ALTER TABLE public.phone_order_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_order_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.phone_order_requests TO service_role;
CREATE FUNCTION public.submit_phone_order(p_request_id uuid,p_user_id uuid,p_order jsonb,p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
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
 INSERT INTO public.orders(restaurant_id,guest_session_id,order_number,order_type,order_source,status,payment_status,subtotal,total,note,client_phone,payment_method,delivery_address,delivery_lat,delivery_lng,delivery_fee,scheduled_at)
 VALUES(request.restaurant_id,p_user_id::text,public.next_order_number(request.restaurant_id),p_order->>'order_type','phone','pending','unpaid',(p_order->>'subtotal')::numeric,(p_order->>'total')::numeric,p_order->>'note',p_order->>'client_phone',p_order->>'payment_method',p_order->>'delivery_address',(p_order->>'delivery_lat')::numeric,(p_order->>'delivery_lng')::numeric,(p_order->>'delivery_fee')::numeric,(p_order->>'scheduled_at')::timestamptz) RETURNING * INTO o;
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  INSERT INTO public.order_items(order_id,product_id,product_name,quantity,unit_price,total_price) VALUES(o.id,(i->>'product_id')::uuid,i->>'_server_product_name',(i->>'quantity')::integer,(i->>'_server_unit_price')::numeric,(i->>'_server_unit_price')::numeric*(i->>'quantity')::integer) RETURNING id INTO oi;
  INSERT INTO public.order_item_choices(order_item_id,option_name,price_supplement) SELECT oi,x->>'name',(x->>'price')::numeric FROM jsonb_array_elements(coalesce(i->'options','[]'::jsonb)) x;
 END LOOP;
 UPDATE public.phone_order_requests SET order_id=o.id WHERE request_id=p_request_id;
 RETURN to_jsonb(o)-'delivery_code';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_phone_order(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_phone_order(uuid,uuid,jsonb,jsonb) TO service_role;
