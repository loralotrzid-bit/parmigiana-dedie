
CREATE OR REPLACE FUNCTION merge_cart_to_user(p_session_id text, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  session_cart record;
  user_cart record;
BEGIN
  -- lock session cart
  SELECT * INTO session_cart
  FROM carts
  WHERE session_id = p_session_id AND status = 'active'
  FOR UPDATE;

  IF session_cart IS NULL THEN
    RETURN json_build_object('merged', false);
  END IF;

  -- lock user cart
  SELECT * INTO user_cart
  FROM carts
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  -- no user cart → assign session cart to user
  IF user_cart IS NULL THEN
    UPDATE carts
    SET user_id = p_user_id, session_id = NULL
    WHERE id = session_cart.id;
    RETURN json_build_object('merged', true, 'cart_id', session_cart.id);
  END IF;

  -- CRITICAL FIX: copy restaurant_id and order_type from session cart to user cart
  UPDATE carts
  SET restaurant_id = COALESCE(session_cart.restaurant_id, user_cart.restaurant_id),
      order_type = COALESCE(session_cart.order_type, user_cart.order_type),
      updated_at = now()
  WHERE id = user_cart.id;

  -- Delete existing items in user cart (session cart is the fresh one)
  DELETE FROM cart_items WHERE cart_id = user_cart.id;

  -- Move all items from session cart to user cart
  INSERT INTO cart_items (cart_id, product_id, product_name, unit_price, quantity, options)
  SELECT user_cart.id, product_id, product_name, unit_price, quantity, options
  FROM cart_items
  WHERE cart_id = session_cart.id;

  -- mark session cart as merged
  UPDATE carts SET status = 'merged' WHERE id = session_cart.id;

  RETURN json_build_object('merged', true, 'cart_id', user_cart.id);
END;
$$;
