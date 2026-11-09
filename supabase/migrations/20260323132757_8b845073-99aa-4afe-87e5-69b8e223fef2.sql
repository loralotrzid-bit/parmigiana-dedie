DROP FUNCTION IF EXISTS public.merge_cart_to_user(text, uuid);

CREATE OR REPLACE FUNCTION public.merge_cart_to_user(p_session_id text, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  session_cart record;
  user_cart record;
BEGIN
  SELECT * INTO session_cart
  FROM carts
  WHERE session_id = p_session_id AND status = 'active'
  FOR UPDATE;

  IF session_cart IS NULL THEN
    RETURN json_build_object('merged', false);
  END IF;

  SELECT * INTO user_cart
  FROM carts
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  IF user_cart IS NULL THEN
    UPDATE carts
    SET user_id = p_user_id, session_id = NULL, updated_at = now()
    WHERE id = session_cart.id;
    RETURN json_build_object('merged', true, 'cart_id', session_cart.id);
  END IF;

  INSERT INTO cart_items (cart_id, product_id, product_name, unit_price, quantity, options)
  SELECT user_cart.id, product_id, product_name, unit_price, quantity, options
  FROM cart_items
  WHERE cart_id = session_cart.id
  ON CONFLICT DO NOTHING;

  UPDATE carts
  SET status = 'merged', updated_at = now()
  WHERE id = session_cart.id;

  RETURN json_build_object('merged', true, 'cart_id', user_cart.id);
END;
$$;