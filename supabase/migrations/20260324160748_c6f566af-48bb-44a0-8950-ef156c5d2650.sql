
CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_reply text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Clients can insert their own tickets
CREATE POLICY "Users insert own tickets"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Clients can read their own tickets
CREATE POLICY "Users read own tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can read all tickets
CREATE POLICY "Super admin read all tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can update tickets (reply, close)
CREATE POLICY "Super admin update tickets"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can delete tickets
CREATE POLICY "Super admin delete tickets"
  ON public.support_tickets FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
