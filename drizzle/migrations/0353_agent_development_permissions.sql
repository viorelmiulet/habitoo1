CREATE TABLE public.agent_development_permissions (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_create boolean NOT NULL DEFAULT false,
  allowed_portals text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX agent_development_permissions_user_idx ON public.agent_development_permissions (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_development_permissions TO authenticated;
GRANT ALL ON public.agent_development_permissions TO service_role;
ALTER TABLE public.agent_development_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_development_permissions_read ON public.agent_development_permissions FOR SELECT TO authenticated
  USING ((select public.is_superadmin()) OR organization_id = (select public.current_org()));
CREATE POLICY agent_development_permissions_insert ON public.agent_development_permissions FOR INSERT TO authenticated
  WITH CHECK ((select public.is_superadmin()) OR (organization_id = (select public.current_org()) AND (select public.has_role((select auth.uid()),'agency_admin'))));
CREATE POLICY agent_development_permissions_update ON public.agent_development_permissions FOR UPDATE TO authenticated
  USING ((select public.is_superadmin()) OR (organization_id = (select public.current_org()) AND (select public.has_role((select auth.uid()),'agency_admin'))))
  WITH CHECK ((select public.is_superadmin()) OR (organization_id = (select public.current_org()) AND (select public.has_role((select auth.uid()),'agency_admin'))));
CREATE POLICY agent_development_permissions_delete ON public.agent_development_permissions FOR DELETE TO authenticated
  USING ((select public.is_superadmin()) OR (organization_id = (select public.current_org()) AND (select public.has_role((select auth.uid()),'agency_admin'))));

CREATE FUNCTION public.agent_development_permissions_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Agentul nu aparține agenției';
  END IF;
  NEW.allowed_portals := coalesce((SELECT array_agg(DISTINCT p ORDER BY p) FROM unnest(NEW.allowed_portals) p WHERE btrim(p) <> ''), '{}');
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER agent_development_permissions_guard BEFORE INSERT OR UPDATE ON public.agent_development_permissions
  FOR EACH ROW EXECUTE FUNCTION public.agent_development_permissions_guard();

CREATE FUNCTION public.agent_development_permissions_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END, auth.uid(),
    'development_permissions.' || lower(TG_OP), 'agent_development_permissions',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('can_create', OLD.can_create, 'allowed_portals', to_jsonb(OLD.allowed_portals)) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('can_create', NEW.can_create, 'allowed_portals', to_jsonb(NEW.allowed_portals)) END,
    auth.uid());
  RETURN NULL;
END $$;
CREATE TRIGGER agent_development_permissions_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_development_permissions
  FOR EACH ROW EXECUTE FUNCTION public.agent_development_permissions_audit();

CREATE FUNCTION public.agent_can_create_development(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agent_development_permissions WHERE organization_id = _org AND user_id = auth.uid() AND can_create)
$$;
REVOKE EXECUTE ON FUNCTION public.agent_can_create_development(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_can_create_development(uuid) TO authenticated, service_role;

DROP POLICY developments_insert ON public.developments;
CREATE POLICY developments_insert ON public.developments FOR INSERT TO authenticated WITH CHECK(public.is_superadmin() OR (organization_id=public.current_org() AND (public.has_role(auth.uid(),'agency_admin') OR (assigned_to=auth.uid() AND public.agent_can_create_development(organization_id)))));

CREATE FUNCTION public.development_selection_permission_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.enabled AND (TG_OP = 'INSERT' OR NOT OLD.enabled) AND auth.uid() IS NOT NULL
     AND NOT public.is_superadmin() AND NOT public.has_role(auth.uid(),'agency_admin')
     AND NOT EXISTS (SELECT 1 FROM public.agent_development_permissions p JOIN public.developments d ON d.organization_id = p.organization_id
                     WHERE d.id = NEW.development_id AND p.user_id = auth.uid() AND NEW.portal_key = ANY(p.allowed_portals)) THEN
    RAISE EXCEPTION '%: Nepermis de administrator', NEW.portal_key;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER development_selection_permission_guard BEFORE INSERT OR UPDATE ON public.development_portal_selections
  FOR EACH ROW EXECUTE FUNCTION public.development_selection_permission_guard();