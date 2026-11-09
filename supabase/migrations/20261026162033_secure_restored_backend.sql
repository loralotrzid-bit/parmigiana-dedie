ALTER VIEW public.public_restaurants SET (security_invoker = true);
ALTER FUNCTION public.merge_cart_to_user(text, uuid) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.delete_restaurant_cascade(uuid), public.decrement_product_stock(), public.check_prep_time_anomaly(), public.handle_new_user(), public.next_order_number(uuid), public.merge_cart_to_user(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid), public.merge_cart_to_user(text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.increment_loyalty_score(text), public.claim_loyalty_reward(text), public.use_promo_code_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_loyalty_score(text), public.claim_loyalty_reward(text), public.use_promo_code_atomic(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.delete_restaurant_cascade(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Super admin required' USING ERRCODE = '42501';
  END IF;
  -- Collect admin user_ids linked to this restaurant
  SELECT array_agg(user_id) INTO v_user_ids
  FROM profiles
  WHERE restaurant_id = p_restaurant_id AND user_id IS NOT NULL;

  -- Delete their roles
  IF v_user_ids IS NOT NULL THEN
    DELETE FROM user_roles WHERE user_id = ANY(v_user_ids);
    -- Clear restaurant_id from profiles (don't delete profiles, keep user accounts)
    UPDATE profiles SET restaurant_id = NULL WHERE restaurant_id = p_restaurant_id;
  END IF;

  -- Delete delivery-related data
  DELETE FROM delivery_settings WHERE restaurant_id = p_restaurant_id;
  DELETE FROM driver_sessions WHERE restaurant_id = p_restaurant_id;
  DELETE FROM admin_alerts WHERE restaurant_id = p_restaurant_id;
  DELETE FROM audit_log WHERE restaurant_id = p_restaurant_id;
  DELETE FROM eta_learning WHERE restaurant_id = p_restaurant_id;
  DELETE FROM promo_codes WHERE restaurant_id = p_restaurant_id;

  -- Delete delivery drivers and their locations
  DELETE FROM driver_locations WHERE driver_id IN (SELECT id FROM delivery_drivers WHERE restaurant_id = p_restaurant_id);
  DELETE FROM delivery_drivers WHERE restaurant_id = p_restaurant_id;

  -- Delete orders and related data
  DELETE FROM order_item_choices WHERE order_item_id IN (
    SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.restaurant_id = p_restaurant_id
  );
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = p_restaurant_id);
  DELETE FROM chat_messages WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = p_restaurant_id);
  DELETE FROM delivery_assignments WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = p_restaurant_id);
  DELETE FROM orders WHERE restaurant_id = p_restaurant_id;

  -- Delete products, options, option groups
  DELETE FROM product_options WHERE product_id IN (
    SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.restaurant_id = p_restaurant_id
  );
  DELETE FROM product_option_groups WHERE product_id IN (
    SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.restaurant_id = p_restaurant_id
  );
  DELETE FROM products WHERE category_id IN (SELECT id FROM categories WHERE restaurant_id = p_restaurant_id);
  DELETE FROM categories WHERE restaurant_id = p_restaurant_id;

  -- Delete carts
  DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE restaurant_id = p_restaurant_id);
  DELETE FROM carts WHERE restaurant_id = p_restaurant_id;

  -- Finally delete the restaurant
  DELETE FROM restaurants WHERE id = p_restaurant_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_restaurant_cascade(uuid) TO authenticated;
REVOKE INSERT ON public.orders, public.order_items, public.order_item_choices FROM anon, authenticated;

