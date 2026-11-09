-- Add delivery coordinates to orders to avoid re-geocoding
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_lat numeric DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_lng numeric DEFAULT NULL;