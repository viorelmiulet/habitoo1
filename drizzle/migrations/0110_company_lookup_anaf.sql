CREATE TABLE IF NOT EXISTS public.company_lookup_cache (
  cui text PRIMARY KEY,
  result jsonb,
  found boolean NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.company_lookup_cache TO service_role;
ALTER TABLE public.company_lookup_cache ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.company_lookup_cache IS 'Cache 24h pentru căutările publice ANAF după CUI (doar date publice ale firmei). Accesat doar de server.';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS registered_address text,
  ADD COLUMN IF NOT EXISTS company_status text,
  ADD COLUMN IF NOT EXISTS company_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_sync_attempted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_cui_unique
  ON public.organizations ((regexp_replace(upper(cui), '[^0-9]', '', 'g')))
  WHERE cui IS NOT NULL AND btrim(cui) <> '';