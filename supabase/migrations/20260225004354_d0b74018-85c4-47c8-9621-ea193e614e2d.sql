-- Drop the existing restrictive INSERT/UPDATE policies that block driver writes
DROP POLICY IF EXISTS "Service insert driver_locations" ON public.driver_locations;
DROP POLICY IF EXISTS "Service update driver_locations" ON public.driver_locations;

-- Create PERMISSIVE policies that allow writing to driver_locations
-- Only for valid driver_ids that exist in delivery_drivers
CREATE POLICY "Allow insert driver location"
ON public.driver_locations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.id = driver_locations.driver_id AND dd.is_active = true
  )
);

CREATE POLICY "Allow update driver location"
ON public.driver_locations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.id = driver_locations.driver_id AND dd.is_active = true
  )
);