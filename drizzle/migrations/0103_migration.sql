-- Activare automată ClickImob pentru agențiile NOI (orice cale de creare: înregistrare,
-- Superadmin, invitație — toate inserează în public.organizations). Reproduce exact
-- scrierea din applyPortalActivationForOrg (activated + allow_live, status ready pentru
-- portalurile fără credențiale); indexul ClickImob citește conexiunile activate.
-- Idempotent (nu suprascrie o conexiune existentă) și nu blochează crearea agenției.
CREATE OR REPLACE FUNCTION public.auto_activate_clickimob_on_org_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted uuid;
BEGIN
  BEGIN
    INSERT INTO public.portal_connections (organization_id, portal, activated, settings, status)
    VALUES (NEW.id, 'clickimob', true, jsonb_build_object('allow_live', true), 'ready')
    ON CONFLICT (organization_id, portal) DO NOTHING
    RETURNING id INTO _inserted;

    IF _inserted IS NOT NULL THEN
      INSERT INTO public.audit_logs (organization_id, action, entity, entity_id, new_values)
      VALUES (NEW.id, 'portal.activated_for_org', 'portal_connections', _inserted,
        jsonb_build_object('portal', 'clickimob', 'activated', true, 'allow_live', true,
          'source', 'auto_on_create'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_activate_clickimob_on_org_create failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_activate_clickimob_on_org_create() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_org_auto_clickimob ON public.organizations;
CREATE TRIGGER t_org_auto_clickimob
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.auto_activate_clickimob_on_org_create();