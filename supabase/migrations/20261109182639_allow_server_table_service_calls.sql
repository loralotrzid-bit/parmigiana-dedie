-- The restaurant's serving staff must be able to receive and close table calls.
-- This predicate is used by RLS and the status-transition RPC, so keep the
-- authorization scoped to the same restaurant and an active can_serve record.
CREATE OR REPLACE FUNCTION public.can_manage_table_service(p_restaurant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.is_active
        AND (
          ur.role::text = 'super_admin'
          OR (
            ur.role::text = 'restaurant_admin'
            AND EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.user_id = (SELECT auth.uid())
                AND p.restaurant_id = p_restaurant
            )
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.delivery_drivers d
      WHERE d.auth_user_id = (SELECT auth.uid())
        AND d.restaurant_id = p_restaurant
        AND d.is_active
        AND d.can_serve
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_table_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_table_service(uuid) TO authenticated;

-- Make accepting a table order and closing its call one database transaction.
-- The request ID remains idempotent, so a lost HTTP response cannot duplicate
-- the order or leave the customer waiting after the order was accepted.
CREATE OR REPLACE FUNCTION public.submit_staff_order(
  p_request_id uuid, p_user_id uuid, p_order jsonb, p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request public.staff_order_requests;
  o public.orders;
  i jsonb;
  oi uuid;
  stock_row record;
  table_call_id uuid := nullif(p_order->>'table_call_id', '')::uuid;
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
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_drivers d
    WHERE d.auth_user_id=p_user_id AND d.restaurant_id=request.restaurant_id
      AND d.is_active AND d.can_serve
  ) THEN RAISE EXCEPTION 'Acces caisse serveur refuse' USING ERRCODE='42501'; END IF;
  IF p_order->>'order_type' <> 'dine_in' OR coalesce((p_order->>'table_number')::integer, 0) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Commande de salle invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_tables t WHERE t.restaurant_id=request.restaurant_id
      AND t.table_number=(p_order->>'table_number')::integer AND t.is_active
  ) THEN RAISE EXCEPTION 'Table inactive'; END IF;
  IF table_call_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.table_service_calls c
    WHERE c.id=table_call_id AND c.restaurant_id=request.restaurant_id
      AND c.table_number=(p_order->>'table_number')::integer
      AND c.status IN ('pending','acknowledged')
  ) THEN RAISE EXCEPTION 'Cet appel est déjà terminé ou ne correspond pas à cette table'; END IF;
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
  IF table_call_id IS NOT NULL THEN
    UPDATE public.table_service_calls
    SET status='resolved', resolved_at=now(), acknowledged_by=coalesce(acknowledged_by, p_user_id)
    WHERE id=table_call_id AND restaurant_id=request.restaurant_id
      AND table_number=(p_order->>'table_number')::integer
      AND status IN ('pending','acknowledged');
    IF NOT FOUND THEN RAISE EXCEPTION 'Cet appel a déjà été traité'; END IF;
  END IF;
  UPDATE public.staff_order_requests SET order_id=o.id WHERE request_id=p_request_id;
  RETURN to_jsonb(o)-'delivery_code';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_staff_order(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staff_order(uuid,uuid,jsonb,jsonb) TO service_role;
