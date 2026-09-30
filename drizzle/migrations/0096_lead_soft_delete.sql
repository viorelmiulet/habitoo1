ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS pre_delete_stage public.lead_stage;

CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON public.leads (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_lead_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  IF coalesce(current_setting('habitoo.lead_soft_delete', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.pre_delete_stage IS DISTINCT FROM OLD.pre_delete_stage THEN
    RAISE EXCEPTION 'Ștergerea și restabilirea lead-urilor se fac doar prin acțiunile dedicate.' USING ERRCODE = '42501';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Lead-ul este șters și nu mai poate fi modificat.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_lead_soft_delete_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL OR NEW.pre_delete_stage IS NOT NULL THEN
    RAISE EXCEPTION 'Ștergerea lead-urilor se face doar prin acțiunea dedicată.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_guard_soft_delete ON public.leads;
CREATE TRIGGER leads_guard_soft_delete BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_soft_delete();
DROP TRIGGER IF EXISTS leads_guard_soft_delete_ins ON public.leads;
CREATE TRIGGER leads_guard_soft_delete_ins BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_soft_delete_insert();

CREATE OR REPLACE FUNCTION public.delete_lead(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Neautentificat.' USING ERRCODE = '42501'; END IF;
  SELECT id, organization_id, assigned_to, created_by, stage, deleted_at, name, contact_id, property_id INTO l
    FROM public.leads WHERE id = _id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Lead-ul nu a fost găsit.' USING ERRCODE = 'P0002'; END IF;
  IF l.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Lead-ul este deja șters.'; END IF;
  IF NOT (
    public.is_superadmin()
    OR (l.organization_id = public.current_org() AND (
          EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uid AND r.role = 'agency_admin' AND r.organization_id = l.organization_id)
          OR l.assigned_to = uid
          OR (l.assigned_to IS NULL AND l.created_by = uid)))
  ) THEN
    RAISE EXCEPTION 'Nu ai dreptul să ștergi acest lead.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('habitoo.lead_soft_delete', 'on', true);
  UPDATE public.leads SET deleted_at = now(), deleted_by = uid, pre_delete_stage = l.stage WHERE id = _id;
  PERFORM set_config('habitoo.lead_soft_delete', 'off', true);
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values)
  VALUES (l.organization_id, uid, 'lead.deleted', 'lead', _id,
          jsonb_build_object('stage', l.stage, 'name', l.name, 'contact_id', l.contact_id, 'property_id', l.property_id),
          jsonb_build_object('deleted', true));
  RETURN l.organization_id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_lead(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar administratorul platformei poate restabili lead-uri.' USING ERRCODE = '42501';
  END IF;
  SELECT id, organization_id, deleted_at, pre_delete_stage, stage, name INTO l
    FROM public.leads WHERE id = _id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Lead-ul nu a fost găsit.' USING ERRCODE = 'P0002'; END IF;
  IF l.deleted_at IS NULL THEN RAISE EXCEPTION 'Lead-ul nu este șters.'; END IF;
  PERFORM set_config('habitoo.lead_soft_delete', 'on', true);
  UPDATE public.leads
     SET deleted_at = NULL, deleted_by = NULL,
         stage = coalesce(l.pre_delete_stage, l.stage), pre_delete_stage = NULL
   WHERE id = _id;
  PERFORM set_config('habitoo.lead_soft_delete', 'off', true);
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values)
  VALUES (l.organization_id, uid, 'lead.restored', 'lead', _id,
          jsonb_build_object('deleted', true, 'name', l.name),
          jsonb_build_object('stage', coalesce(l.pre_delete_stage, l.stage)));
  RETURN l.organization_id;
END $$;

REVOKE ALL ON FUNCTION public.delete_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_lead(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_lead_soft_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_lead_soft_delete_insert() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS leads_sel ON public.leads;
CREATE POLICY leads_sel ON public.leads FOR SELECT USING (
  public.is_superadmin()
  OR (deleted_at IS NULL AND organization_id = public.current_org()
      AND (public.is_org_admin() OR assigned_to = auth.uid() OR (assigned_to IS NULL AND created_by = auth.uid())))
);
DROP POLICY IF EXISTS leads_upd ON public.leads;
CREATE POLICY leads_upd ON public.leads FOR UPDATE USING (
  organization_id = public.current_org() AND deleted_at IS NULL
);
DROP POLICY IF EXISTS leads_del ON public.leads;
CREATE POLICY leads_del ON public.leads FOR DELETE USING (public.is_superadmin());