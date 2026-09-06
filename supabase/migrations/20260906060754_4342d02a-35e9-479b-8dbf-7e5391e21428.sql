CREATE TABLE public.portal_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','ready','active','error')),
  enabled boolean NOT NULL DEFAULT false,
  endpoint_url text,
  external_agency_id text,
  credential_prefix text,
  credential_hash text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX portal_integrations_org_portal_key ON public.portal_integrations (organization_id, portal_key);

GRANT SELECT (id, organization_id, portal_key, status, enabled, endpoint_url, external_agency_id, credential_prefix, config, last_sync_at, last_error, last_error_at, created_at, updated_at, created_by, updated_by) ON public.portal_integrations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.portal_integrations TO authenticated;
GRANT ALL ON public.portal_integrations TO service_role;
ALTER TABLE public.portal_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_integrations_select ON public.portal_integrations FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE POLICY portal_integrations_insert ON public.portal_integrations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY portal_integrations_update ON public.portal_integrations FOR UPDATE TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY portal_integrations_delete ON public.portal_integrations FOR DELETE TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE TRIGGER portal_integrations_touch BEFORE UPDATE ON public.portal_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.portal_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','synced','error','disabled')),
  external_ref text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX portal_publications_unique ON public.portal_publications (organization_id, property_id, portal_key);
CREATE INDEX portal_publications_portal_idx ON public.portal_publications (organization_id, portal_key, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_publications TO authenticated;
GRANT ALL ON public.portal_publications TO service_role;
ALTER TABLE public.portal_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_publications_select ON public.portal_publications FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE POLICY portal_publications_insert ON public.portal_publications FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY portal_publications_update ON public.portal_publications FOR UPDATE TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY portal_publications_delete ON public.portal_publications FOR DELETE TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE TRIGGER portal_publications_touch BEFORE UPDATE ON public.portal_publications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();