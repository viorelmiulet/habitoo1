DROP FUNCTION IF EXISTS public.public_agency_by_slug(text);
DROP FUNCTION IF EXISTS public.public_agencies_list();
DROP TRIGGER IF EXISTS t_profile_public_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.guard_profile_public_fields();
DROP TRIGGER IF EXISTS t_org_public_fields ON public.organizations;
DROP FUNCTION IF EXISTS public.guard_org_public_fields();
DROP FUNCTION IF EXISTS public.public_unique_slug(text, text, uuid);
DROP FUNCTION IF EXISTS public.public_slugify(text);

COMMENT ON COLUMN public.profiles.public_profile_enabled IS 'DEPRECATED: no public agent profiles; unused';
COMMENT ON COLUMN public.profiles.public_slug IS 'DEPRECATED: no public agent profiles; unused';
COMMENT ON COLUMN public.profiles.public_bio IS 'DEPRECATED: no public agent profiles; unused';
COMMENT ON COLUMN public.profiles.public_show_phone IS 'DEPRECATED: no public agent profiles; unused';
COMMENT ON COLUMN public.organizations.public_profile_enabled IS 'DEPRECATED: replaced by public_partner_enabled';
COMMENT ON COLUMN public.organizations.public_slug IS 'DEPRECATED: no agency detail pages; unused';
COMMENT ON COLUMN public.organizations.public_description IS 'DEPRECATED: no public description; unused';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_partner_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_org_public_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_superadmin()
     AND NEW.public_hidden_by_admin IS DISTINCT FROM OLD.public_hidden_by_admin THEN
    RAISE EXCEPTION 'Doar superadminul poate ascunde agenția din lista publică.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER t_org_public_fields BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_public_fields();

-- Singura citire publică: nume și calea logo-ului, nimic altceva.
CREATE OR REPLACE FUNCTION public.public_partner_agencies()
RETURNS TABLE (name text, logo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.name, o.logo_path
  FROM public.organizations o
  WHERE o.public_partner_enabled AND NOT o.public_hidden_by_admin
    AND o.archived_at IS NULL AND o.status IN ('active','trial')
  ORDER BY o.name;
$$;
REVOKE ALL ON FUNCTION public.public_partner_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_partner_agencies() TO anon, authenticated, service_role;