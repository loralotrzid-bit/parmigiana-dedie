
-- Ensure unique indexes (IF NOT EXISTS for safety)
CREATE UNIQUE INDEX IF NOT EXISTS carts_user_active_unique
ON carts(user_id)
WHERE user_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS carts_session_active_unique
ON carts(session_id)
WHERE session_id IS NOT NULL AND status = 'active';

-- Recreate merge function (clean version, no ON CONFLICT on cart_items)
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

  -- No user cart → assign session cart to user
  IF user_cart IS NULL THEN
    UPDATE carts
    SET user_id = p_user_id, session_id = NULL, updated_at = now()
    WHERE id = session_cart.id;
    RETURN json_build_object('merged', true, 'cart_id', session_cart.id);
  END IF;

  -- Both exist → move items from session cart to user cart
  INSERT INTO cart_items (cart_id, product_id, product_name, unit_price, quantity, options)
  SELECT user_cart.id, product_id, product_name, unit_price, quantity, options
  FROM cart_items
  WHERE cart_id = session_cart.id;

  -- Mark session cart as merged
  UPDATE carts
  SET status = 'merged', updated_at = now()
  WHERE id = session_cart.id;

  RETURN json_build_object('merged', true, 'cart_id', user_cart.id);
END;
$$;
