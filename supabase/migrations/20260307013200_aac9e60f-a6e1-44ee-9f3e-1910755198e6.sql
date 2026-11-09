
-- Create driver_sessions table for QR-based daily access
CREATE TABLE public.driver_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL -- admin user who generated the QR
);

-- Enable RLS
ALTER TABLE public.driver_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage sessions
CREATE POLICY "Admin manage driver sessions" ON public.driver_sessions
  FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Index for fast token lookup
CREATE INDEX idx_driver_sessions_token ON public.driver_sessions(session_token);
-- Index for cleanup of expired sessions
CREATE INDEX idx_driver_sessions_expires ON public.driver_sessions(expires_at);
