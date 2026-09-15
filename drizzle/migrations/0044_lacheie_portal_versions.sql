-- Versionarea scrierilor către portaluri (X-Source-Version per external_id).
CREATE TABLE public.portal_listing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  -- Versiunea este text zecimal: valorile mari nu trec prin Number.
  source_version text NOT NULL DEFAULT '0',
  accepted_version text,
  conflict boolean NOT NULL DEFAULT false,
  last_operation text,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_listing_versions_unique UNIQUE (organization_id, portal, external_id, environment),
  CONSTRAINT portal_listing_versions_environment_check CHECK (environment IN ('test', 'production')),
  CONSTRAINT portal_listing_versions_version_check CHECK (source_version ~ '^[0-9]{1,32}$')
);

GRANT SELECT ON public.portal_listing_versions TO authenticated;
GRANT ALL ON public.portal_listing_versions TO service_role;

ALTER TABLE public.portal_listing_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_listing_versions_select" ON public.portal_listing_versions
  FOR SELECT TO authenticated
  USING ((organization_id = public.current_org()) OR public.is_superadmin());

CREATE INDEX portal_listing_versions_property_idx
  ON public.portal_listing_versions (organization_id, portal, property_id);

CREATE TRIGGER portal_listing_versions_touch
  BEFORE UPDATE ON public.portal_listing_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Jurnalul portalurilor: metadate suplimentare, fără secrete și fără payload brut.
ALTER TABLE public.portal_operation_logs
  ADD COLUMN environment text,
  ADD COLUMN external_id text,
  ADD COLUMN source_version text,
  ADD COLUMN http_status integer,
  ADD COLUMN duration_ms integer;