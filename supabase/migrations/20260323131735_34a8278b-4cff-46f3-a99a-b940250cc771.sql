
-- 1. Add status column to carts
ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2. Unique partial indexes: only ONE active cart per session / per user
CREATE UNIQUE INDEX IF NOT EXISTS carts_session_active_unique
  ON public.carts (session_id)
  WHERE session_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS carts_user_active_unique
  ON public.carts (user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carts_session_id ON public.carts (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carts_status ON public.carts (status);

-- 4. Transactional merge RPC function
CREATE OR REPLACE FUNCTION public.merge_cart_to_user(
  p_session_id text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_cart record;
  v_user_cart record;
  v_session_items jsonb;
  v_user_items jsonb;
  v_item record;
  v_match_id uuid;
BEGIN
  -- 1. Lock session cart
  SELECT * INTO v_session_cart
  FROM carts
  WHERE session_id = p_session_id AND status = 'active'
  FOR UPDATE;

  IF v_session_cart IS NULL THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'no_session_cart');
  END IF;

  -- Check if session cart has items
  IF NOT EXISTS (SELECT 1 FROM cart_items WHERE cart_id = v_session_cart.id) THEN
    -- No items: just assign or ignore
    SELECT * INTO v_user_cart
    FROM carts
    WHERE user_id = p_user_id AND status = 'active'
    FOR UPDATE;

    IF v_user_cart IS NULL THEN
      -- Assign session cart to user
      UPDATE carts
      SET user_id = p_user_id, session_id = NULL, updated_at = now()
      WHERE id = v_session_cart.id;
    ELSE
      -- Mark session cart as merged (empty)
      UPDATE carts SET status = 'merged', updated_at = now() WHERE id = v_session_cart.id;
    END IF;

    RETURN jsonb_build_object('merged', false, 'reason', 'empty_session_cart');
  END IF;

  -- 2. Lock user cart
  SELECT * INTO v_user_cart
  FROM carts
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  -- Case A: no user cart → assign session cart
  IF v_user_cart IS NULL THEN
    UPDATE carts
    SET user_id = p_user_id, session_id = NULL, updated_at = now()
    WHERE id = v_session_cart.id;

    RETURN jsonb_build_object('merged', true, 'cart_id', v_session_cart.id, 'strategy', 'assigned');
  END IF;

  -- Case B: different restaurant → replace user cart
  IF v_session_cart.restaurant_id IS DISTINCT FROM v_user_cart.restaurant_id THEN
    DELETE FROM cart_items WHERE cart_id = v_user_cart.id;
    
    -- Move session items to user cart
    UPDATE cart_items SET cart_id = v_user_cart.id WHERE cart_id = v_session_cart.id;
    
    UPDATE carts
    SET restaurant_id = v_session_cart.restaurant_id,
        order_type = v_session_cart.order_type,
        updated_at = now()
    WHERE id = v_user_cart.id;

    UPDATE carts SET status = 'merged', updated_at = now() WHERE id = v_session_cart.id;

    RETURN jsonb_build_object('merged', true, 'cart_id', v_user_cart.id, 'strategy', 'replaced');
  END IF;

  -- Case C: same restaurant → merge items
  -- Check if user cart has items
  IF NOT EXISTS (SELECT 1 FROM cart_items WHERE cart_id = v_user_cart.id) THEN
    -- User cart empty: move items
    UPDATE cart_items SET cart_id = v_user_cart.id WHERE cart_id = v_session_cart.id;
    UPDATE carts SET status = 'merged', updated_at = now() WHERE id = v_session_cart.id;

    RETURN jsonb_build_object('merged', true, 'cart_id', v_user_cart.id, 'strategy', 'moved');
  END IF;

  -- Both have items, same restaurant: merge by product_id + sorted options
  FOR v_item IN
    SELECT * FROM cart_items WHERE cart_id = v_session_cart.id
  LOOP
    -- Find matching item in user cart (same product_id + same options as sorted JSON)
    SELECT id INTO v_match_id
    FROM cart_items
    WHERE cart_id = v_user_cart.id
      AND product_id = v_item.product_id
      AND (
        options::text = v_item.options::text
      )
    LIMIT 1;

    IF v_match_id IS NOT NULL THEN
      -- Sum quantities
      UPDATE cart_items
      SET quantity = quantity + v_item.quantity, created_at = now()
      WHERE id = v_match_id;
    ELSE
      -- Move item to user cart
      UPDATE cart_items
      SET cart_id = v_user_cart.id
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  -- Clean up remaining session items (those that were merged by quantity)
  DELETE FROM cart_items WHERE cart_id = v_session_cart.id;
  UPDATE carts SET status = 'merged', updated_at = now() WHERE id = v_session_cart.id;

  RETURN jsonb_build_object('merged', true, 'cart_id', v_user_cart.id, 'strategy', 'merged_items');
END;
$$;
