CREATE POLICY "Super admin insert restaurants"
ON public.restaurants
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));