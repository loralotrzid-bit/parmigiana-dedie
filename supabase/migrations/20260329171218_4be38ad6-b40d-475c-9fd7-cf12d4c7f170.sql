ALTER TABLE public.restaurants ADD COLUMN dine_in_enabled boolean NOT NULL DEFAULT true;

DROP VIEW IF EXISTS public.public_restaurants;
CREATE VIEW public.public_restaurants WITH (security_invoker = true) AS
SELECT id, name, slug, description, image_url, logo_url, cuisine_type, cuisine_categories,
       halal_type, is_open, is_paused, rating, avg_prep_time, avg_delivery_time, minimum_order,
       is_free_delivery, is_top_rated, opening_hours, delivery_flat_fee, delivery_per_km_fee,
       delivery_free_under_km, max_delivery_radius_km, latitude, longitude, delivery_mode,
       dine_in_enabled, accepted_payments, address
FROM public.restaurants
WHERE is_visible = true;