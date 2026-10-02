CREATE OR REPLACE FUNCTION public.guard_property_reassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF new.assigned_to IS NOT DISTINCT FROM old.assigned_to THEN RETURN new; END IF;
  -- service role / cron workers (fără sesiune de utilizator)
  IF uid IS NULL THEN RETURN new; END IF;
  IF public.is_superadmin(uid) THEN RETURN new; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uid
             AND r.organization_id = old.organization_id AND r.role = 'agency_admin') THEN
    RETURN new;
  END IF;
  -- utilizatorul își preia singur un anunț neasignat
  IF old.assigned_to IS NULL AND new.assigned_to = uid THEN RETURN new; END IF;
  RAISE EXCEPTION 'Doar managerul agenției poate schimba agentul responsabil.' USING ERRCODE = '42501';
END; $$;

DROP TRIGGER IF EXISTS properties_guard_reassign ON public.properties;
CREATE TRIGGER properties_guard_reassign BEFORE UPDATE OF assigned_to ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_reassign();