
-- ============================================================
-- PHASE 1: Tighten INSERT policies on order tables
-- The create-order edge function uses service_role (bypasses RLS).
-- These policies prevent unauthorized DIRECT client-side inserts.
-- ============================================================

-- 1a. orders INSERT: only own session or admin
DROP POLICY IF EXISTS "Service insert orders" ON public.orders;
CREATE POLICY "Secure insert orders" ON public.orders
  FOR INSERT
  WITH CHECK (
    guest_session_id = (auth.uid())::text
    OR has_role(auth.uid(), 'restaurant_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 1b. order_items INSERT: only if user owns the parent order or is admin
DROP POLICY IF EXISTS "Service insert order items" ON public.order_items;
CREATE POLICY "Secure insert order items" ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
      AND (
        o.guest_session_id = (auth.uid())::text
        OR (has_role(auth.uid(), 'restaurant_admin'::app_role) AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
  );

-- 1c. order_item_choices INSERT: only if user owns the related order or is admin
DROP POLICY IF EXISTS "Service insert order item choices" ON public.order_item_choices;
CREATE POLICY "Secure insert order item choices" ON public.order_item_choices
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_choices.order_item_id
      AND (
        o.guest_session_id = (auth.uid())::text
        OR (has_role(auth.uid(), 'restaurant_admin'::app_role) AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
  );

-- ============================================================
-- PHASE 2: Restrict restaurant sensitive fields via a secure view
-- Create a public_restaurants view exposing only client-safe fields.
-- The base table remains fully accessible to admins.
-- ============================================================

-- 2a. Create a public view that hides operational/internal fields
CREATE OR REPLACE VIEW public.public_restaurants AS
SELECT
  id, name, slug, description, image_url, logo_url,
  is_open, is_paused, halal_type, rating, avg_prep_time,
  address, cuisine_type, cuisine_categories, minimum_order,
  is_free_delivery, is_top_rated, opening_hours,
  delivery_mode, delivery_flat_fee, delivery_per_km_fee,
  delivery_free_under_km, max_delivery_radius_km,
  accepted_payments, latitude, longitude
FROM public.restaurants;

-- 2b. Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.public_restaurants TO anon, authenticated;

-- ============================================================
-- PHASE 3: Tighten admin_alerts INSERT (currently WITH CHECK: true)
-- Only service_role should insert alerts (triggers/edge functions).
-- Restrict direct inserts to admins only.
-- ============================================================
DROP POLICY IF EXISTS "Service insert alerts" ON public.admin_alerts;
CREATE POLICY "Admin insert alerts" ON public.admin_alerts
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'restaurant_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============================================================
-- PHASE 4: Tighten audit_log INSERT (currently WITH CHECK: true)
-- ============================================================
DROP POLICY IF EXISTS "Service insert audit_log" ON public.audit_log;
CREATE POLICY "Admin insert audit_log" ON public.audit_log
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'restaurant_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
