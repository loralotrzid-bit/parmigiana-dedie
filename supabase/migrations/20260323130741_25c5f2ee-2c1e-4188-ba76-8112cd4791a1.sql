
-- Backend-driven cart tables
CREATE TABLE public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  restaurant_id uuid REFERENCES public.restaurants(id),
  order_type text NOT NULL DEFAULT 'takeaway',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_owner_check CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  unit_price numeric NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_carts_user_id ON public.carts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_carts_session_id ON public.carts(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_cart_items_cart_id ON public.cart_items(cart_id);

-- Enable RLS (no policies = only service_role can access)
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger for carts
CREATE TRIGGER update_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
