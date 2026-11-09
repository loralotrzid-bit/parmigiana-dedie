
-- Fix storage policies: restrict admin actions to authenticated role only
-- and keep public read accessible

-- Drop existing policies
DROP POLICY IF EXISTS "Admin delete restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Public read restaurant images" ON storage.objects;

-- Recreate admin policies restricted to 'authenticated' role only
CREATE POLICY "Admin delete restaurant images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'restaurant-images' AND (has_role(auth.uid(), 'restaurant_admin') OR has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Admin update restaurant images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'restaurant-images' AND (has_role(auth.uid(), 'restaurant_admin') OR has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Admin upload restaurant images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'restaurant-images' AND (has_role(auth.uid(), 'restaurant_admin') OR has_role(auth.uid(), 'super_admin')));

-- Public read: restrict to authenticated only (bucket is public so direct URLs still work)
CREATE POLICY "Public read restaurant images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'restaurant-images');
