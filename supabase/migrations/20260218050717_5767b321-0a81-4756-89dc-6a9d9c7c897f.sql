
-- Add new columns to restaurants for filtering
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS minimum_order numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuisine_type text DEFAULT 'Autre',
  ADD COLUMN IF NOT EXISTS is_free_delivery boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_top_rated boolean DEFAULT false;
