-- Advisor clean-up for the dedicated Parmigiana project.
-- Preserve all policy roles/commands/predicates while evaluating auth.uid()
-- once per statement instead of once per row.

DO $migration$
DECLARE
  p record;
  v_roles text;
  v_command text;
  v_using text;
  v_check text;
  v_sql text;
BEGIN
  FOR p IN
    SELECT pol.oid,
           pol.polname,
           cls.relname AS table_name,
           pol.polrelid,
           pol.polcmd,
           pol.polpermissive,
           pol.polroles,
           pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND (
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ 'auth[.]uid[(][)]'
        OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'auth[.]uid[(][)]'
      )
    ORDER BY cls.relname, pol.polname
  LOOP
    SELECT string_agg(
             CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END,
             ', ' ORDER BY role_oid
           )
      INTO v_roles
    FROM unnest(p.polroles) AS role_oid
    LEFT JOIN pg_roles r ON r.oid = role_oid;

    v_command := CASE p.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      ELSE 'ALL'
    END;

    v_using := CASE WHEN p.using_expression IS NULL THEN NULL
      ELSE regexp_replace(p.using_expression, 'auth[.]uid[(][)]', '(select auth.uid())', 'g')
    END;
    v_check := CASE WHEN p.check_expression IS NULL THEN NULL
      ELSE regexp_replace(p.check_expression, 'auth[.]uid[(][)]', '(select auth.uid())', 'g')
    END;

    EXECUTE format('DROP POLICY %I ON public.%I', p.polname, p.table_name);
    v_sql := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
      p.polname,
      p.table_name,
      CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      v_command,
      v_roles
    );
    IF v_using IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$migration$;

-- Cover all 18 foreign keys reported by the performance advisor.
CREATE INDEX IF NOT EXISTS idx_admin_alerts_order_id ON public.admin_alerts (order_id);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_restaurant_id ON public.admin_alerts (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant_id ON public.audit_log (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_carts_restaurant_id ON public.carts (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_order_id ON public.chat_messages (order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver_id ON public.delivery_assignments (driver_id);
CREATE INDEX IF NOT EXISTS idx_digital_menu_sessions_order_id ON public.digital_menu_sessions (order_id);
CREATE INDEX IF NOT EXISTS idx_digital_menu_sessions_restaurant_id ON public.digital_menu_sessions (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_restaurant_id ON public.driver_sessions (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_phone_order_requests_order_id ON public.phone_order_requests (order_id);
CREATE INDEX IF NOT EXISTS idx_phone_order_requests_restaurant_id ON public.phone_order_requests (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_phone_order_requests_staff_user_id ON public.phone_order_requests (staff_user_id);
CREATE INDEX IF NOT EXISTS idx_product_option_groups_linked_category_id ON public.product_option_groups (linked_category_id);
CREATE INDEX IF NOT EXISTS idx_product_option_groups_product_id ON public.product_option_groups (product_id);
CREATE INDEX IF NOT EXISTS idx_product_options_option_group_id ON public.product_options (option_group_id);
CREATE INDEX IF NOT EXISTS idx_profiles_restaurant_id ON public.profiles (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_service_calls_acknowledged_by ON public.table_service_calls (acknowledged_by);
