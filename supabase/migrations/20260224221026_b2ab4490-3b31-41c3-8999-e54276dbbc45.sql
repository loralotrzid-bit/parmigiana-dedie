
-- Add is_featured to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Add accepted_payments to restaurants (default: cash + card_delivery + wero)
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS accepted_payments text[] NOT NULL DEFAULT ARRAY['cash','card_delivery','wero']::text[];

-- Add default_driver_id to restaurants
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS default_driver_id uuid DEFAULT NULL;
