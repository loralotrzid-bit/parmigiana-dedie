-- Harden the super-admin-only cascade RPC against search_path object shadowing.
-- Its role check and deletion scope are unchanged; the function is never invoked
-- by this migration.
CREATE OR REPLACE FUNCTION public.delete_restaurant_cascade(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Super admin required' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(user_id) INTO v_user_ids
  FROM public.profiles
  WHERE restaurant_id = p_restaurant_id AND user_id IS NOT NULL;

  IF v_user_ids IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = ANY(v_user_ids);
    UPDATE public.profiles SET restaurant_id = NULL WHERE restaurant_id = p_restaurant_id;
  END IF;

  DELETE FROM public.delivery_settings WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.driver_sessions WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.admin_alerts WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.audit_log WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.eta_learning WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.promo_codes WHERE restaurant_id = p_restaurant_id;

  DELETE FROM public.driver_locations
  WHERE driver_id IN (
    SELECT id FROM public.delivery_drivers WHERE restaurant_id = p_restaurant_id
  );
  DELETE FROM public.delivery_drivers WHERE restaurant_id = p_restaurant_id;

  DELETE FROM public.order_item_choices
  WHERE order_item_id IN (
    SELECT oi.id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.restaurant_id = p_restaurant_id
  );
  DELETE FROM public.order_items
  WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
  DELETE FROM public.chat_messages
  WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
  DELETE FROM public.delivery_assignments
  WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
  DELETE FROM public.orders WHERE restaurant_id = p_restaurant_id;

  DELETE FROM public.product_options
  WHERE product_id IN (
    SELECT p.id
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    WHERE c.restaurant_id = p_restaurant_id
  );
  DELETE FROM public.product_option_groups
  WHERE product_id IN (
    SELECT p.id
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    WHERE c.restaurant_id = p_restaurant_id
  );
  DELETE FROM public.products
  WHERE category_id IN (SELECT id FROM public.categories WHERE restaurant_id = p_restaurant_id);
  DELETE FROM public.categories WHERE restaurant_id = p_restaurant_id;

  DELETE FROM public.cart_items
  WHERE cart_id IN (SELECT id FROM public.carts WHERE restaurant_id = p_restaurant_id);
  DELETE FROM public.carts WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.restaurants WHERE id = p_restaurant_id;
END;
$function$;
