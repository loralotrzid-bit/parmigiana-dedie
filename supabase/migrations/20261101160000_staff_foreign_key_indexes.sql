-- Cover foreign keys added for permanent staff and in-service order handling.
CREATE INDEX IF NOT EXISTS orders_served_by_idx
  ON public.orders(served_by) WHERE served_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_order_requests_order_id_idx
  ON public.staff_order_requests(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_order_requests_restaurant_id_idx
  ON public.staff_order_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS staff_order_requests_staff_user_id_idx
  ON public.staff_order_requests(staff_user_id);
CREATE INDEX IF NOT EXISTS staff_push_subscriptions_restaurant_id_idx
  ON public.staff_push_subscriptions(restaurant_id);
