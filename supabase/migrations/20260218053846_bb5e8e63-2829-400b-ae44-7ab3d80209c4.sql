
-- 1. Table delivery_drivers
CREATE TABLE public.delivery_drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  driver_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  internal_rating NUMERIC DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, driver_code)
);

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read own drivers" ON public.delivery_drivers
  FOR SELECT USING (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admin insert own drivers" ON public.delivery_drivers
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admin update own drivers" ON public.delivery_drivers
  FOR UPDATE USING (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admin delete own drivers" ON public.delivery_drivers
  FOR DELETE USING (
    (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER update_delivery_drivers_updated_at
  BEFORE UPDATE ON public.delivery_drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Table delivery_assignments
CREATE TABLE public.delivery_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','picked_up','in_transit','delivered','cancelled')),
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read assignments" ON public.delivery_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = delivery_assignments.order_id
      AND (
        (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin')
        OR o.guest_session_id = auth.uid()::text
      )
    )
  );

CREATE POLICY "Admin insert assignments" ON public.delivery_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = delivery_assignments.order_id
      AND (
        (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin')
      )
    )
  );

CREATE POLICY "Admin update assignments" ON public.delivery_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = delivery_assignments.order_id
      AND (
        (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin')
      )
    )
  );

CREATE TRIGGER update_delivery_assignments_updated_at
  BEFORE UPDATE ON public.delivery_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Table chat_messages
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client','restaurant','driver')),
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read chat for own order" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = chat_messages.order_id
      AND (
        o.guest_session_id = auth.uid()::text
        OR (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin')
      )
    )
  );

CREATE POLICY "Insert chat for own order" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = chat_messages.order_id
      AND (
        o.guest_session_id = auth.uid()::text
        OR (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin')
      )
    )
  );

-- 4. Add delivery_code to orders
ALTER TABLE public.orders ADD COLUMN delivery_code TEXT DEFAULT NULL;

-- 5. Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_assignments;
