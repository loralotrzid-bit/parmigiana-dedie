
-- Table for data deletion requests
CREATE TABLE public.data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own deletion requests
CREATE POLICY "Users insert own deletion request"
  ON public.data_deletion_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own deletion requests
CREATE POLICY "Users read own deletion requests"
  ON public.data_deletion_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can read all
CREATE POLICY "Super admin read all deletion requests"
  ON public.data_deletion_requests FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can update (mark as processed)
CREATE POLICY "Super admin update deletion requests"
  ON public.data_deletion_requests FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Restaurant admins can read deletion requests
CREATE POLICY "Admin read deletion requests"
  ON public.data_deletion_requests FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'restaurant_admin'::app_role));
