ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS pre_delete_status public.property_status;

ALTER TABLE public.portal_status_withdraw_items DROP CONSTRAINT portal_status_withdraw_items_reason_check;
ALTER TABLE public.portal_status_withdraw_items ADD CONSTRAINT portal_status_withdraw_items_reason_check
  CHECK (reason = ANY (ARRAY['status_sold','status_rented','archived','deleted']));

-- Garda ștergerii soft: doar superadminul sau RPC-urile dedicate ating deleted_at / anunțurile șterse.
CREATE OR REPLACE FUNCTION public.guard_property_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  IF coalesce(current_setting('habitoo.property_soft_delete', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.pre_delete_status IS DISTINCT FROM OLD.pre_delete_status THEN
    RAISE EXCEPTION 'Ștergerea și restabilirea anunțurilor se fac doar prin acțiunile dedicate.' USING ERRCODE = '42501';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Anunțul este șters și nu mai poate fi modificat.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS properties_guard_soft_delete ON public.properties;
CREATE TRIGGER properties_guard_soft_delete BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_soft_delete();

CREATE OR REPLACE FUNCTION public.delete_property(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Neautentificat.' USING ERRCODE = '42501'; END IF;
  SELECT id, organization_id, assigned_to, status, deleted_at, reference INTO p
    FROM public.properties WHERE id = _id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Anunțul nu a fost găsit.' USING ERRCODE = 'P0002'; END IF;
  IF p.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Anunțul este deja șters.'; END IF;
  IF NOT (
    public.is_superadmin()
    OR (p.organization_id = public.current_org() AND (
          EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uid AND r.role = 'agency_admin' AND r.organization_id = p.organization_id)
          OR p.assigned_to = uid))
  ) THEN
    RAISE EXCEPTION 'Nu ai dreptul să ștergi acest anunț.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('habitoo.property_soft_delete', 'on', true);
  UPDATE public.properties SET deleted_at = now(), deleted_by = uid, pre_delete_status = p.status WHERE id = _id;
  PERFORM set_config('habitoo.property_soft_delete', 'off', true);
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values)
  VALUES (p.organization_id, uid, 'property.deleted', 'property', _id,
          jsonb_build_object('status', p.status, 'reference', p.reference), jsonb_build_object('deleted', true));
  RETURN p.organization_id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_property(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar administratorul platformei poate restabili anunțuri.' USING ERRCODE = '42501';
  END IF;
  SELECT id, organization_id, deleted_at, pre_delete_status, status, reference INTO p
    FROM public.properties WHERE id = _id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Anunțul nu a fost găsit.' USING ERRCODE = 'P0002'; END IF;
  IF p.deleted_at IS NULL THEN RAISE EXCEPTION 'Anunțul nu este șters.'; END IF;
  PERFORM set_config('habitoo.property_soft_delete', 'on', true);
  UPDATE public.properties
     SET deleted_at = NULL, deleted_by = NULL,
         status = coalesce(p.pre_delete_status, p.status), pre_delete_status = NULL
   WHERE id = _id;
  PERFORM set_config('habitoo.property_soft_delete', 'off', true);
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values)
  VALUES (p.organization_id, uid, 'property.restored', 'property', _id,
          jsonb_build_object('deleted', true, 'reference', p.reference),
          jsonb_build_object('status', coalesce(p.pre_delete_status, p.status)));
  RETURN p.organization_id;
END $$;

REVOKE ALL ON FUNCTION public.delete_property(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_property(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_property(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_property(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_property_soft_delete() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS properties_sel ON public.properties;
CREATE POLICY properties_sel ON public.properties FOR SELECT USING (
  public.is_superadmin()
  OR (deleted_at IS NULL AND organization_id = public.current_org()
      AND (public.is_org_admin() OR assigned_to = auth.uid()))
);
DROP POLICY IF EXISTS properties_upd ON public.properties;
CREATE POLICY properties_upd ON public.properties FOR UPDATE USING (
  organization_id = public.current_org() AND deleted_at IS NULL
);
DROP POLICY IF EXISTS properties_del ON public.properties;
CREATE POLICY properties_del ON public.properties FOR DELETE USING (public.is_superadmin());