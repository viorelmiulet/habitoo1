ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS storia_auto_republish BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.storia_auto_republish IS
  'Republică automat anunțurile expirate pe Storia. Implicit dezactivat; modificabil doar de administratorul agenției (RLS org_update) sau Superadmin.';