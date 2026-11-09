
-- Fix SECURITY DEFINER view warning: recreate with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_restaurants;
CREATE VIEW public.public_restaurants
WITH (security_invoker = true)
AS
SELECT
  id, name, slug, description, image_url, logo_url,
  is_open, is_paused, halal_type, rating, avg_prep_time,
  address, cuisine_type, cuisine_categories, minimum_order,
  is_free_delivery, is_top_rated, opening_hours,
  delivery_mode, delivery_flat_fee, delivery_per_km_fee,
  delivery_free_under_km, max_delivery_radius_km,
  accepted_payments, latitude, longitude
FROM public.restaurants;

GRANT SELECT ON public.public_restaurants TO anon, authenticated;
