-- Codul poștal al ofertei: de unde provine și când a fost rezolvat.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS postal_code_source text,
  ADD COLUMN IF NOT EXISTS postal_code_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS postal_code_resolved_from text;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_postal_code_source_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_postal_code_source_check
  CHECK (postal_code_source IS NULL OR postal_code_source IN ('manual', 'geocoded', 'approximate'));

-- Codurile poștale deja existente au fost introduse de om: rămân „manual”.
UPDATE public.properties
   SET postal_code_source = 'manual'
 WHERE postal_code IS NOT NULL
   AND btrim(postal_code) <> ''
   AND postal_code_source IS NULL;

-- Cache după coordonate rotunjite: aceeași clădire nu se geocodează a doua oară.
CREATE TABLE IF NOT EXISTS public.geocode_postal_cache (
  coord_key text PRIMARY KEY,
  postal_code text,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.geocode_postal_cache TO authenticated;
GRANT ALL ON public.geocode_postal_cache TO service_role;
ALTER TABLE public.geocode_postal_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geocode_postal_cache_select ON public.geocode_postal_cache;
CREATE POLICY geocode_postal_cache_select ON public.geocode_postal_cache
  FOR SELECT TO authenticated USING (true);

-- Jurnalul încercărilor: dovada a ce s-a găsit și plafonul zilnic per agenție.
CREATE TABLE IF NOT EXISTS public.postal_code_resolution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  outcome text NOT NULL,
  postal_code text,
  source text,
  used_provider boolean NOT NULL DEFAULT false,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS postal_code_attempts_org_idx
  ON public.postal_code_resolution_attempts (organization_id, created_at DESC);

GRANT SELECT ON public.postal_code_resolution_attempts TO authenticated;
GRANT ALL ON public.postal_code_resolution_attempts TO service_role;
ALTER TABLE public.postal_code_resolution_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS postal_code_attempts_select ON public.postal_code_resolution_attempts;
CREATE POLICY postal_code_attempts_select ON public.postal_code_resolution_attempts
  FOR SELECT TO authenticated
  USING (organization_id = current_org() OR is_superadmin());