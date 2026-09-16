-- Nomenclatorul de locații Imobiliare.ro (date de referință, comune tuturor agențiilor)
CREATE TABLE IF NOT EXISTS public.imobiliare_locations (
  id bigint PRIMARY KEY,
  parent_id bigint,
  depth smallint NOT NULL,
  name text NOT NULL,
  name_normalized text NOT NULL,
  county_name text,
  city_name text,
  county_normalized text,
  city_normalized text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.imobiliare_locations TO authenticated;
GRANT ALL ON public.imobiliare_locations TO service_role;

ALTER TABLE public.imobiliare_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Imobiliare locations readable by authenticated" ON public.imobiliare_locations;
CREATE POLICY "Imobiliare locations readable by authenticated"
ON public.imobiliare_locations FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS imobiliare_locations_depth_idx ON public.imobiliare_locations (depth);
CREATE INDEX IF NOT EXISTS imobiliare_locations_parent_idx ON public.imobiliare_locations (parent_id);
CREATE INDEX IF NOT EXISTS imobiliare_locations_city_norm_idx ON public.imobiliare_locations (city_normalized, depth);
CREATE INDEX IF NOT EXISTS imobiliare_locations_name_norm_idx ON public.imobiliare_locations (name_normalized);

-- Corespondența agent Habitoo → agent Imobiliare.ro (id numeric din sistemul lor)
CREATE TABLE IF NOT EXISTS public.imobiliare_agents (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  external_agent_id text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, profile_id)
);

GRANT SELECT ON public.imobiliare_agents TO authenticated;
GRANT ALL ON public.imobiliare_agents TO service_role;

ALTER TABLE public.imobiliare_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Imobiliare agents readable in own org" ON public.imobiliare_agents;
CREATE POLICY "Imobiliare agents readable in own org"
ON public.imobiliare_agents FOR SELECT TO authenticated
USING (organization_id = public.current_org() OR public.is_superadmin());