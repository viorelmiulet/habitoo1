CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identificatorul profilului nu poate fi modificat.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Agenția unui utilizator poate fi schimbată doar de un superadmin, prin operațiunea administrativă dedicată.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Statusul activ/inactiv poate fi modificat doar de un administrator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Profilul altcuiva: doar superadminul sau adminul agenției, iar adminul doar pentru agenți.
  IF OLD.id IS DISTINCT FROM auth.uid() AND NOT public.is_superadmin() THEN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Emailul de autentificare poate fi schimbat doar de utilizatorul însuși sau de superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = OLD.id AND r.role IN ('agency_admin', 'superadmin')
    ) THEN
      RAISE EXCEPTION 'Datele altui administrator nu pot fi modificate.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;