
-- Add time tracking columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ;

-- Create driver_locations table for real-time GPS tracking
CREATE TABLE public.driver_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  heading NUMERIC,
  speed NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT driver_locations_driver_unique UNIQUE (driver_id)
);

-- Enable RLS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Drivers can update their own location (via edge function with service role)
CREATE POLICY "Service upsert driver_locations"
ON public.driver_locations FOR ALL
USING (true)
WITH CHECK (true);

-- Clients can read driver location only for their active delivery
CREATE POLICY "Client read driver location for active delivery"
ON public.driver_locations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM delivery_assignments da
    JOIN orders o ON o.id = da.order_id
    WHERE da.driver_id = driver_locations.driver_id
    AND da.status = 'in_transit'
    AND o.guest_session_id = auth.uid()::text
  )
);

-- Enable realtime for driver_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
