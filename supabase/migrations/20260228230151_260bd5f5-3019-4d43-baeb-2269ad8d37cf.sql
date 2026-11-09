-- Add professional option group configuration columns
ALTER TABLE public.product_option_groups
  ADD COLUMN IF NOT EXISTS min_selections integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selection_type text NOT NULL DEFAULT 'multiple',
  ADD COLUMN IF NOT EXISTS group_price numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.product_option_groups.min_selections IS 'Minimum number of selections required (0 = no minimum)';
COMMENT ON COLUMN public.product_option_groups.free_count IS 'Number of free selections before extras are charged';
COMMENT ON COLUMN public.product_option_groups.selection_type IS 'single or multiple selection type';
COMMENT ON COLUMN public.product_option_groups.group_price IS 'Override price for extras in this group (null = use item price)';