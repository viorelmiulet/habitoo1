CREATE OR REPLACE FUNCTION public.guard_property_reassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF new.assigned_to IS NOT DISTINCT FROM old.assigned_to THEN RETURN new; END IF;
  IF uid IS NULL THEN RETURN new; END IF;
  IF public.is_superadmin() THEN RETURN new; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uid
             AND r.organization_id = old.organization_id AND r.role = 'agency_admin') THEN
    RETURN new;
  END IF;
  IF old.assigned_to IS NULL AND new.assigned_to = uid THEN RETURN new; END IF;
  RAISE EXCEPTION 'Doar managerul agenției poate schimba agentul responsabil.' USING ERRCODE = '42501';
END; $$;