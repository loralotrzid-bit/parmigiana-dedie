-- These internal tables are Edge/service-only. Explicit deny policies document
-- the intended browser boundary while service_role continues to bypass RLS.
DO $$
DECLARE
  table_name text;
  internal_tables text[] := ARRAY[
    'cart_items',
    'carts',
    'digital_menu_sessions',
    'edge_request_rate_limits',
    'phone_order_requests',
    'restaurant_order_number_counters',
    'staff_order_requests'
  ];
BEGIN
  FOREACH table_name IN ARRAY internal_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_browser_access ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY deny_browser_access ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      table_name
    );
  END LOOP;
END;
$$;
