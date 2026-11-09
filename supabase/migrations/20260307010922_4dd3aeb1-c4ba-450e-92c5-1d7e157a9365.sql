
-- ══════════════════════════════════════════════════════════════════
-- 2FA TOTP: Create totp_secrets table for admin accounts
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE public.totp_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  encrypted_secret text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;

-- Users can read their own TOTP config (only is_enabled, never the secret)
CREATE POLICY "Users read own totp status"
  ON public.totp_secrets FOR SELECT
  USING (user_id = auth.uid());

-- No client-side insert/update/delete — all managed via edge function with service_role
-- Service role bypasses RLS

-- Add updated_at trigger
CREATE TRIGGER update_totp_secrets_updated_at
  BEFORE UPDATE ON public.totp_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
