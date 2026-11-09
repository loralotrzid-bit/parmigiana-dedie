
-- Allow restaurant_admin to INSERT categories for their own restaurant
CREATE POLICY "Admin insert categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);

-- Allow restaurant_admin to UPDATE categories for their own restaurant
CREATE POLICY "Admin update categories"
ON public.categories
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);

-- Allow restaurant_admin to DELETE categories for their own restaurant
CREATE POLICY "Admin delete categories"
ON public.categories
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);

-- Allow restaurant_admin to INSERT products in their restaurant's categories
CREATE POLICY "Admin insert products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND c.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);

-- Allow restaurant_admin to UPDATE products in their restaurant's categories
CREATE POLICY "Admin update products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND c.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);

-- Allow restaurant_admin to DELETE products in their restaurant's categories
CREATE POLICY "Admin delete products"
ON public.products
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND c.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);
