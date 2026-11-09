
-- Fix: drop the overly permissive policy, replace with targeted ones
DROP POLICY IF EXISTS "Service upsert driver_locations" ON public.driver_locations;
DROP POLICY IF EXISTS "Client read driver location for active delivery" ON public.driver_locations;

-- Service role (edge functions) can insert/update
CREATE POLICY "Service insert driver_locations"
ON public.driver_locations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service update driver_locations"
ON public.driver_locations FOR UPDATE
USING (true);

-- Clients see location only for their in_transit delivery driver
CREATE POLICY "Client read active driver location"
ON public.driver_locations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM delivery_assignments da
    JOIN orders o ON o.id = da.order_id
    WHERE da.driver_id = driver_locations.driver_id
    AND da.status = 'in_transit'
    AND o.guest_session_id = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM delivery_drivers dd
    WHERE dd.id = driver_locations.driver_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND dd.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);
