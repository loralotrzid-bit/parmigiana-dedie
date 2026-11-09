-- These tables are accessed through trusted Edge Functions using service_role.
-- Remove direct SQL grants from browser roles in addition to their default-deny RLS.
REVOKE ALL PRIVILEGES ON TABLE
  public.cart_items,
  public.carts,
  public.digital_menu_sessions,
  public.edge_request_rate_limits,
  public.phone_order_requests,
  public.restaurant_order_number_counters
FROM PUBLIC, anon, authenticated;
