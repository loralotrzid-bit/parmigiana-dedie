
-- Fix anonymous access warnings on admin-only tables
-- Change 'public' role policies to 'authenticated' where appropriate

-- ADMIN ALERTS: already fixed above (using TO authenticated)

-- AUDIT LOG: restrict to authenticated
DROP POLICY IF EXISTS "Admin insert audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Admin read own audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Super admin read audit_log" ON public.audit_log;

CREATE POLICY "Admin insert audit_log" ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'restaurant_admin') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin read own audit_log" ON public.audit_log
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()));

CREATE POLICY "Super admin read audit_log" ON public.audit_log
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'));

-- DELIVERY DRIVERS: restrict admin ops to authenticated
DROP POLICY IF EXISTS "Admin delete own drivers" ON public.delivery_drivers;
DROP POLICY IF EXISTS "Admin insert own drivers" ON public.delivery_drivers;
DROP POLICY IF EXISTS "Admin read own drivers" ON public.delivery_drivers;
DROP POLICY IF EXISTS "Admin update own drivers" ON public.delivery_drivers;

CREATE POLICY "Admin delete own drivers" ON public.delivery_drivers
FOR DELETE TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin insert own drivers" ON public.delivery_drivers
FOR INSERT TO authenticated
WITH CHECK ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin read own drivers" ON public.delivery_drivers
FOR SELECT TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin update own drivers" ON public.delivery_drivers
FOR UPDATE TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

-- DELIVERY SETTINGS: restrict admin ops to authenticated
DROP POLICY IF EXISTS "Admin update delivery_settings" ON public.delivery_settings;

CREATE POLICY "Admin manage delivery_settings" ON public.delivery_settings
FOR ALL TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

-- DRIVER SESSIONS: restrict to authenticated
DROP POLICY IF EXISTS "Admin manage driver sessions" ON public.driver_sessions;

CREATE POLICY "Admin manage driver sessions" ON public.driver_sessions
FOR ALL TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

-- ETA LEARNING: restrict to authenticated
DROP POLICY IF EXISTS "Admin read own eta_learning" ON public.eta_learning;
DROP POLICY IF EXISTS "Super admin insert eta_learning" ON public.eta_learning;
DROP POLICY IF EXISTS "Super admin update eta_learning" ON public.eta_learning;

CREATE POLICY "Admin read own eta_learning" ON public.eta_learning
FOR SELECT TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin insert eta_learning" ON public.eta_learning
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin update eta_learning" ON public.eta_learning
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'));

-- LOYALTY: restrict to authenticated
DROP POLICY IF EXISTS "Users insert own loyalty" ON public.loyalty_progress;
DROP POLICY IF EXISTS "Users read own loyalty" ON public.loyalty_progress;

CREATE POLICY "Users insert own loyalty" ON public.loyalty_progress
FOR INSERT TO authenticated
WITH CHECK (user_id = (auth.uid())::text);

CREATE POLICY "Users read own loyalty" ON public.loyalty_progress
FOR SELECT TO authenticated
USING (user_id = (auth.uid())::text);

-- PROMO CODES: restrict admin ops to authenticated
DROP POLICY IF EXISTS "Admin manage promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Authenticated read active promo codes" ON public.promo_codes;

CREATE POLICY "Admin manage promo codes" ON public.promo_codes
FOR ALL TO authenticated
USING ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK ((has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated validate promo codes" ON public.promo_codes
FOR SELECT TO authenticated
USING (is_active = true);

-- USER ROLES: restrict to authenticated
DROP POLICY IF EXISTS "Super admin delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admin read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admin update roles" ON public.user_roles;

CREATE POLICY "Super admin delete roles" ON public.user_roles
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin read all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin update roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'));
