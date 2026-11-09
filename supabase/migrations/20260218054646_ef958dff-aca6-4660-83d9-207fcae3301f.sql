
-- 1. Admin alerts table
CREATE TABLE public.admin_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL DEFAULT 'prep_time_anomaly',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin read all alerts" ON public.admin_alerts
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin update alerts" ON public.admin_alerts
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service insert alerts" ON public.admin_alerts
  FOR INSERT WITH CHECK (true);

-- 2. Add stock column to products (NULL = unlimited)
ALTER TABLE public.products ADD COLUMN stock INTEGER DEFAULT NULL;

-- 3. Add delivery_order to delivery_assignments for tour ordering
ALTER TABLE public.delivery_assignments ADD COLUMN delivery_order INTEGER NOT NULL DEFAULT 1;

-- 4. Add delivery_address to orders
ALTER TABLE public.orders ADD COLUMN delivery_address TEXT DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN client_phone TEXT DEFAULT NULL;

-- 5. Update next_order_number to reset at 5am daily
CREATE OR REPLACE FUNCTION public.next_order_number(p_restaurant_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  last_num INTEGER;
  last_created TIMESTAMPTZ;
  reset_time TIMESTAMPTZ;
BEGIN
  -- Calculate today's 5am reset boundary
  reset_time := date_trunc('day', now()) + interval '5 hours';
  IF now() < reset_time THEN
    reset_time := reset_time - interval '1 day';
  END IF;

  SELECT order_number, created_at INTO last_num, last_created
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Reset if no orders, counter >= 100, or last order was before today's reset
  IF last_num IS NULL OR last_num >= 100 OR last_created < reset_time THEN
    RETURN 1;
  ELSE
    RETURN last_num + 1;
  END IF;
END;
$function$;

-- 6. Trigger: decrement stock on order item insert
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.products
  SET stock = GREATEST(0, stock - NEW.quantity),
      is_available = CASE WHEN (stock - NEW.quantity) <= 0 THEN false ELSE is_available END
  WHERE id = NEW.product_id AND stock IS NOT NULL;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_product_stock();

-- 7. Trigger: generate prep_time alert if order marked ready too late
CREATE OR REPLACE FUNCTION public.check_prep_time_anomaly()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  avg_time INTEGER;
  actual_minutes INTEGER;
BEGIN
  IF NEW.status = 'ready' AND OLD.status = 'preparing' THEN
    SELECT avg_prep_time INTO avg_time FROM public.restaurants WHERE id = NEW.restaurant_id;
    IF avg_time IS NULL THEN avg_time := 20; END IF;
    
    actual_minutes := EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 60;
    
    -- Alert if actual time > 2x average
    IF actual_minutes > (avg_time * 2) THEN
      INSERT INTO public.admin_alerts (restaurant_id, order_id, alert_type, message, metadata)
      VALUES (
        NEW.restaurant_id,
        NEW.id,
        'prep_time_anomaly',
        'Temps de préparation anormal détecté',
        jsonb_build_object(
          'expected_minutes', avg_time,
          'actual_minutes', actual_minutes,
          'order_number', NEW.order_number
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_check_prep_time
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_prep_time_anomaly();

-- 8. Enable realtime for admin_alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;
