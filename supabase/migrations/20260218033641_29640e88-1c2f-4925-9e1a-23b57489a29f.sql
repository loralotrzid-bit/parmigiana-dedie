
-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  guest_session_id TEXT NOT NULL,
  order_number INTEGER NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'takeaway',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Order items table (snapshots)
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Order item choices table (option snapshots)
CREATE TABLE public.order_item_choices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL,
  price_supplement NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_choices ENABLE ROW LEVEL SECURITY;

-- Public read by guest_session_id for orders
CREATE POLICY "Guests can read their own orders"
  ON public.orders FOR SELECT
  USING (true);

CREATE POLICY "Guests can read order items"
  ON public.order_items FOR SELECT
  USING (true);

CREATE POLICY "Guests can read order item choices"
  ON public.order_item_choices FOR SELECT
  USING (true);

-- Service role insert only (edge function uses service role)
CREATE POLICY "Service role can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can insert order items"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can insert order item choices"
  ON public.order_item_choices FOR INSERT
  WITH CHECK (true);

-- Admin can update order status
CREATE POLICY "Anyone can update order status"
  ON public.orders FOR UPDATE
  USING (true);

-- Function for cyclic order number
CREATE OR REPLACE FUNCTION public.next_order_number(p_restaurant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  last_num INTEGER;
BEGIN
  SELECT order_number INTO last_num
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_num IS NULL OR last_num >= 100 THEN
    RETURN 1;
  ELSE
    RETURN last_num + 1;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
