
-- Step 1: Add column
ALTER TABLE public.restaurants ADD COLUMN scheduling_mode text NOT NULL DEFAULT 'all';

-- Step 2: Drop view
DROP VIEW IF EXISTS public.public_restaurants;

-- Step 3: Recreate view
CREATE VIEW public.public_restaurants AS
SELECT id, name, slug, description, image_url, logo_url,
       cuisine_type, cuisine_categories, halal_type,
       is_open, is_paused, rating, avg_prep_time, avg_delivery_time,
       minimum_order, is_free_delivery, is_top_rated, opening_hours,
       delivery_flat_fee, delivery_per_km_fee, delivery_free_under_km,
       max_delivery_radius_km, latitude, longitude, delivery_mode,
       dine_in_enabled, accepted_payments, address, scheduling_mode
FROM public.restaurants
WHERE is_visible = true;

GRANT SELECT ON public.public_restaurants TO anon, authenticated;
