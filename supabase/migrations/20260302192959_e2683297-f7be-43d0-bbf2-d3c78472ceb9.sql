
-- Add is_visible_to_client to categories (default true to not break existing behavior)
ALTER TABLE public.categories
ADD COLUMN is_visible_to_client boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.categories.is_visible_to_client IS 'When false, category is hidden from client menu but still usable for linked option groups';
