
-- Add order_source column to track QR vs direct orders
ALTER TABLE public.orders ADD COLUMN order_source text NOT NULL DEFAULT 'direct';

-- Add eta_confidence column to track estimated time reliability
ALTER TABLE public.orders ADD COLUMN eta_confidence text NOT NULL DEFAULT 'medium';
