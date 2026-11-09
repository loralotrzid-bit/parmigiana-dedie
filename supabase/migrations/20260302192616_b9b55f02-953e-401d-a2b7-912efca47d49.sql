
-- Add linked_category_id to product_option_groups for dynamic category-based options
ALTER TABLE public.product_option_groups
ADD COLUMN linked_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.product_option_groups.linked_category_id IS 'When set, options are dynamically pulled from products in this category instead of from product_options table';
