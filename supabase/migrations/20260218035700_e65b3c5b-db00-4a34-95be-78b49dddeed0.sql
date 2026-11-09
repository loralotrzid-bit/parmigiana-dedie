
-- 1. App role enum
CREATE TYPE public.app_role AS ENUM ('user', 'restaurant_admin', 'super_admin');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Profiles table (links admin users to their restaurant)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  restaurant_id uuid REFERENCES public.restaurants(id),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Security definer: get user's restaurant_id
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 6. RLS for user_roles (users read own roles only)
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 7. RLS for profiles (users read own profile)
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- 8. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 9. Replace permissive RLS on orders
-- ============================================
DROP POLICY IF EXISTS "Guests can read their own orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update order status" ON public.orders;
DROP POLICY IF EXISTS "Service role can insert orders" ON public.orders;

-- SELECT: guest sees own orders OR admin sees restaurant orders OR super_admin sees all
CREATE POLICY "Read own or admin orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    guest_session_id = auth.uid()::text
    OR (public.has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- INSERT: via edge function (service_role bypasses RLS), keep permissive for safety
CREATE POLICY "Service insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- UPDATE: only restaurant admin for their restaurant or super_admin
CREATE POLICY "Admin update order status"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- ============================================
-- 10. Replace permissive RLS on order_items
-- ============================================
DROP POLICY IF EXISTS "Guests can read order items" ON public.order_items;
DROP POLICY IF EXISTS "Service role can insert order items" ON public.order_items;

CREATE POLICY "Read order items via order access"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND (
          orders.guest_session_id = auth.uid()::text
          OR (public.has_role(auth.uid(), 'restaurant_admin') AND orders.restaurant_id = public.get_user_restaurant_id(auth.uid()))
          OR public.has_role(auth.uid(), 'super_admin')
        )
    )
  );

CREATE POLICY "Service insert order items"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 11. Replace permissive RLS on order_item_choices
-- ============================================
DROP POLICY IF EXISTS "Guests can read order item choices" ON public.order_item_choices;
DROP POLICY IF EXISTS "Service role can insert order item choices" ON public.order_item_choices;

CREATE POLICY "Read order item choices via order access"
  ON public.order_item_choices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items
      JOIN public.orders ON orders.id = order_items.order_id
      WHERE order_items.id = order_item_choices.order_item_id
        AND (
          orders.guest_session_id = auth.uid()::text
          OR (public.has_role(auth.uid(), 'restaurant_admin') AND orders.restaurant_id = public.get_user_restaurant_id(auth.uid()))
          OR public.has_role(auth.uid(), 'super_admin')
        )
    )
  );

CREATE POLICY "Service insert order item choices"
  ON public.order_item_choices FOR INSERT
  WITH CHECK (true);
