-- Widen the RLS policy so clients can see driver location for assigned/picked_up/in_transit
DROP POLICY IF EXISTS "Client read active driver location" ON public.driver_locations;

CREATE POLICY "Client read active driver location"
ON public.driver_locations
FOR SELECT
USING (
  (EXISTS (
    SELECT 1
    FROM delivery_assignments da
    JOIN orders o ON o.id = da.order_id
    WHERE da.driver_id = driver_locations.driver_id
      AND da.status IN ('assigned', 'picked_up', 'in_transit')
      AND o.guest_session_id = (auth.uid())::text
  ))
  OR
  (EXISTS (
    SELECT 1
    FROM delivery_drivers dd
    WHERE dd.id = driver_locations.driver_id
      AND (
        (has_role(auth.uid(), 'restaurant_admin'::app_role) AND dd.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
  ))
);