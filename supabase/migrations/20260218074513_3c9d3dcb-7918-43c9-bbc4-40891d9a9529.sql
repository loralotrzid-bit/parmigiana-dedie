
-- Add payment columns to orders
ALTER TABLE public.orders ADD COLUMN payment_method text DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN cash_details jsonb;

-- Create product option groups
CREATE TABLE public.product_option_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  max_selections integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read option groups" ON public.product_option_groups FOR SELECT USING (true);

CREATE POLICY "Admin insert option groups" ON public.product_option_groups FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = product_option_groups.product_id AND (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND c.restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

CREATE POLICY "Admin update option groups" ON public.product_option_groups FOR UPDATE USING (
  EXISTS (SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = product_option_groups.product_id AND (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND c.restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

CREATE POLICY "Admin delete option groups" ON public.product_option_groups FOR DELETE USING (
  EXISTS (SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = product_option_groups.product_id AND (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND c.restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

-- Add option_group_id to product_options
ALTER TABLE public.product_options ADD COLUMN option_group_id uuid REFERENCES public.product_option_groups(id) ON DELETE CASCADE;

-- Add admin CRUD policies for product_options (currently missing INSERT/UPDATE/DELETE)
CREATE POLICY "Admin insert product_options" ON public.product_options FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = product_options.product_id AND (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND c.restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

CREATE POLICY "Admin update product_options" ON public.product_options FOR UPDATE USING (
  EXISTS (SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = product_options.product_id AND (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND c.restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

CREATE POLICY "Admin delete product_options" ON public.product_options FOR DELETE USING (
  EXISTS (SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = product_options.product_id AND (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND c.restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

-- Storage bucket for restaurant images
INSERT INTO storage.buckets (id, name, public) VALUES ('restaurant-images', 'restaurant-images', true);

CREATE POLICY "Public read restaurant images" ON storage.objects FOR SELECT USING (bucket_id = 'restaurant-images');

CREATE POLICY "Admin upload restaurant images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'restaurant-images' AND (has_role(auth.uid(), 'restaurant_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "Admin update restaurant images" ON storage.objects FOR UPDATE USING (
  bucket_id = 'restaurant-images' AND (has_role(auth.uid(), 'restaurant_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "Admin delete restaurant images" ON storage.objects FOR DELETE USING (
  bucket_id = 'restaurant-images' AND (has_role(auth.uid(), 'restaurant_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);
