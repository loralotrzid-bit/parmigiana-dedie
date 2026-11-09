
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS company_name text DEFAULT null,
  ADD COLUMN IF NOT EXISTS vat_number text DEFAULT null,
  ADD COLUMN IF NOT EXISTS company_address text DEFAULT null,
  ADD COLUMN IF NOT EXISTS company_email text DEFAULT null,
  ADD COLUMN IF NOT EXISTS company_phone text DEFAULT null;
