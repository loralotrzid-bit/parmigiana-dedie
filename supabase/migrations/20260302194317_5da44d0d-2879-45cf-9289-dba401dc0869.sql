
-- Add menu formula fields to products
ALTER TABLE public.products
  ADD COLUMN menu_supplement numeric DEFAULT NULL,
  ADD COLUMN menu_label text DEFAULT NULL;

-- Add is_menu_only flag to option groups (only shown when menu is selected)
ALTER TABLE public.product_option_groups
  ADD COLUMN is_menu_only boolean NOT NULL DEFAULT false;
