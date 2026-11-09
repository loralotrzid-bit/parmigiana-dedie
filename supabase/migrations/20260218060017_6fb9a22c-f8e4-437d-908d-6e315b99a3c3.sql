
-- 1. Add table_number to orders for QR table tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number integer DEFAULT NULL;

-- 2. Add is_paused to restaurants for rush mode
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- 3. Create audit_log table for tracking admin changes
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Super admin can see all audit logs
CREATE POLICY "Super admin read audit_log"
  ON public.audit_log FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'));

-- Restaurant admin can see own audit logs
CREATE POLICY "Admin read own audit_log"
  ON public.audit_log FOR SELECT
  USING (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()));

-- Anyone authenticated can insert (the edge function / service role will do it)
CREATE POLICY "Service insert audit_log"
  ON public.audit_log FOR INSERT
  WITH CHECK (true);

-- Enable realtime on audit_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
