ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_seeded_at timestamptz,
  ADD COLUMN IF NOT EXISTS demo_seed_version text;

CREATE INDEX IF NOT EXISTS organizations_is_demo_idx ON public.organizations (is_demo) WHERE is_demo;

-- Only a superadmin may flip the demo flag (agency admins can update their own org otherwise).
CREATE OR REPLACE FUNCTION public.guard_org_demo_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Marcajul DEMO/QA poate fi modificat doar de un superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_org_demo_flag ON public.organizations;
CREATE TRIGGER t_org_demo_flag
  BEFORE UPDATE OF is_demo ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_demo_flag();

-- Reset: wipe operational data of a DEMO org (keeps org, profiles, roles). Refuses non-demo orgs.
CREATE OR REPLACE FUNCTION public.qa_reset_demo_organization(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_demo boolean;
  _counts jsonb := '{}'::jsonb;
  _n bigint;
BEGIN
  SELECT is_demo INTO _is_demo FROM public.organizations WHERE id = _org;
  IF _is_demo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Organizația % nu este marcată DEMO/QA – resetarea este refuzată.', _org USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.activities WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('activities', _n);
  DELETE FROM public.lead_events WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('lead_events', _n);
  DELETE FROM public.leads WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('leads', _n);
  DELETE FROM public.property_favorites WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('property_favorites', _n);
  DELETE FROM public.property_images WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('property_images', _n);
  DELETE FROM public.documents WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('documents', _n);
  DELETE FROM public.saved_views WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('saved_views', _n);
  DELETE FROM public.goals WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('goals', _n);
  DELETE FROM public.notifications WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('notifications', _n);
  DELETE FROM public.requests WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('requests', _n);
  DELETE FROM public.properties WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('properties', _n);
  DELETE FROM public.contacts WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('contacts', _n);
  DELETE FROM public.audit_logs WHERE organization_id = _org; GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('audit_logs', _n);

  UPDATE public.organizations SET demo_seeded_at = NULL, demo_seed_version = NULL WHERE id = _org;
  RETURN _counts;
END;
$$;

REVOKE ALL ON FUNCTION public.qa_reset_demo_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_reset_demo_organization(uuid) TO service_role;

-- Purge: delete the DEMO org entirely (cascades to every org-scoped table). Refuses non-demo orgs.
CREATE OR REPLACE FUNCTION public.qa_purge_demo_organization(_org uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_demo boolean;
  _user_ids uuid[];
BEGIN
  SELECT is_demo INTO _is_demo FROM public.organizations WHERE id = _org;
  IF _is_demo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Organizația % nu este marcată DEMO/QA – ștergerea este refuzată.', _org USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO _user_ids FROM public.profiles WHERE organization_id = _org;
  -- Never remove a superadmin account through the QA purge.
  DELETE FROM public.user_roles WHERE organization_id = _org AND role <> 'superadmin';
  DELETE FROM public.profiles WHERE organization_id = _org
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = profiles.id AND r.role = 'superadmin');
  DELETE FROM public.organizations WHERE id = _org;
  RETURN _user_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.qa_purge_demo_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_purge_demo_organization(uuid) TO service_role;