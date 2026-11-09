
-- Add is_active flag to user_roles
ALTER TABLE public.user_roles ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Update has_role to check is_active
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
  )
$$;

-- Allow super_admin to read all user_roles
CREATE POLICY "Super admin read all roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to update user_roles (toggle is_active)
CREATE POLICY "Super admin update roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to delete user_roles
CREATE POLICY "Super admin delete roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to read all profiles
CREATE POLICY "Super admin read all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to update all profiles
CREATE POLICY "Super admin update all profiles"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));
