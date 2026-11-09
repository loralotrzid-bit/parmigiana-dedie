
-- ══════════════════════════════════════════════════════════════════
-- Phase 4 Security Hardening: Fix overly permissive RLS policies
-- ══════════════════════════════════════════════════════════════════

-- 1. FIX loyalty_progress: "Service upsert loyalty" allows ANY user to INSERT/UPDATE/DELETE
--    Service role bypasses RLS, so we can safely restrict these to super_admin only.
DROP POLICY IF EXISTS "Service upsert loyalty" ON public.loyalty_progress;

-- Allow only the user themselves to update their own loyalty (or service role via edge functions)
CREATE POLICY "Users update own loyalty"
  ON public.loyalty_progress FOR UPDATE
  USING (user_id = (auth.uid())::text)
  WITH CHECK (user_id = (auth.uid())::text);

-- Allow insert only for own user_id
CREATE POLICY "Users insert own loyalty"
  ON public.loyalty_progress FOR INSERT
  WITH CHECK (user_id = (auth.uid())::text);

-- No delete allowed from client
-- (service_role from edge functions bypasses RLS)

-- 2. FIX eta_learning: INSERT/UPDATE open to any authenticated user
DROP POLICY IF EXISTS "Service insert eta_learning" ON public.eta_learning;
DROP POLICY IF EXISTS "Service update eta_learning" ON public.eta_learning;

-- Only super_admin can insert/update from client (service_role bypasses for cron)
CREATE POLICY "Super admin insert eta_learning"
  ON public.eta_learning FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin update eta_learning"
  ON public.eta_learning FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. FIX chat_messages: Remove redundant open policies (restrictive "true" is harmless but confusing)
-- The "Insert chat for own order" and "Read chat for own order" already enforce ownership
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Anyone can read chat messages" ON public.chat_messages;
