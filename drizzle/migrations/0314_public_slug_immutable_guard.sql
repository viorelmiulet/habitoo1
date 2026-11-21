CREATE OR REPLACE FUNCTION public.guard_public_slug_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.public_slug IS NOT NULL AND NEW.public_slug IS DISTINCT FROM OLD.public_slug
     AND current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Adresa profilului public nu poate fi modificată.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS a_guard_public_slug_immutable ON public.organizations;
CREATE TRIGGER a_guard_public_slug_immutable BEFORE UPDATE OF public_slug ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_public_slug_immutable();
DROP TRIGGER IF EXISTS a_guard_public_slug_immutable ON public.profiles;
CREATE TRIGGER a_guard_public_slug_immutable BEFORE UPDATE OF public_slug ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_public_slug_immutable();