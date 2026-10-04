ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS collaboration_auto_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS collaboration_opted_out boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.properties.collaboration_opted_out IS 'Explicit agent decision to disable collaboration; auto-activation never overrides it.';

CREATE OR REPLACE FUNCTION public.guard_org_collab_auto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.collaboration_auto_enabled IS DISTINCT FROM OLD.collaboration_auto_enabled
     AND auth.uid() IS NOT NULL
     AND NOT public.is_org_admin(NEW.id) THEN
    RAISE EXCEPTION 'Doar administratorul agenției poate schimba activarea automată a colaborării.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_guard_org_collab_auto ON public.organizations;
CREATE TRIGGER t_guard_org_collab_auto BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_collab_auto();

CREATE OR REPLACE FUNCTION public.properties_auto_collaboration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NEW.collaboration IS TRUE OR NEW.collaboration_opted_out IS TRUE THEN RETURN NEW; END IF;
  SELECT collaboration_enabled, collaboration_auto_enabled, collab_default_commission_percent
    INTO o FROM public.organizations WHERE id = NEW.organization_id;
  IF o IS NULL OR o.collaboration_enabled IS NOT TRUE OR o.collaboration_auto_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  NEW.collaboration := true;
  NEW.collab_commission_percent := COALESCE(NEW.collab_commission_percent, o.collab_default_commission_percent, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_properties_auto_collaboration ON public.properties;
CREATE TRIGGER t_properties_auto_collaboration BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.properties_auto_collaboration();

CREATE OR REPLACE FUNCTION public.properties_auto_collaboration_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.collaboration IS TRUE THEN
    INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
    VALUES (NEW.organization_id, COALESCE(auth.uid(), NEW.created_by), 'collaboration.auto_enabled', 'properties', NEW.id,
      jsonb_build_object('source','property_created','count',1,'commission_percent',NEW.collab_commission_percent));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_properties_auto_collaboration_audit ON public.properties;
CREATE TRIGGER t_properties_auto_collaboration_audit AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.properties_auto_collaboration_audit();

CREATE OR REPLACE FUNCTION public.collaboration_auto_activate(_org uuid, _actor uuid, _source text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; o record;
BEGIN
  SELECT collaboration_enabled, collab_default_commission_percent INTO o FROM public.organizations WHERE id = _org;
  IF o IS NULL OR o.collaboration_enabled IS NOT TRUE THEN RETURN 0; END IF;
  UPDATE public.properties SET collaboration = true,
    collab_commission_percent = COALESCE(collab_commission_percent, o.collab_default_commission_percent, 0)
  WHERE organization_id = _org AND status = 'active' AND deleted_at IS NULL
    AND collaboration = false AND collaboration_opted_out = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
    VALUES (_org, _actor, 'collaboration.auto_enabled', 'organizations', _org,
      jsonb_build_object('source', _source, 'count', n));
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.collaboration_auto_activate(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collaboration_auto_activate(uuid, uuid, text) TO service_role;

SELECT public.collaboration_auto_activate(id, NULL, 'migration') FROM public.organizations WHERE collaboration_enabled = true;