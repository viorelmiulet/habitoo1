DROP FUNCTION IF EXISTS public.public_partner_agencies();

CREATE OR REPLACE FUNCTION public.public_partner_agencies()
RETURNS TABLE(id uuid, name text, has_logo boolean, public_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, (o.logo_path IS NOT NULL AND o.logo_path <> ''), o.public_slug
  FROM public.organizations o
  WHERE public.public_partner_eligible(o) AND o.public_profile_enabled
  ORDER BY lower(o.name);
$$;

CREATE OR REPLACE FUNCTION public.public_agency_profile(_slug text)
RETURNS TABLE(id uuid, name text, description text, has_logo boolean, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, nullif(o.public_description, ''),
         (o.logo_path IS NOT NULL AND o.logo_path <> ''), o.public_slug
  FROM public.organizations o
  WHERE o.public_slug = _slug
    AND o.public_profile_enabled
    AND public.public_partner_eligible(o);
$$;

CREATE OR REPLACE FUNCTION public.public_agency_agents(_org uuid)
RETURNS TABLE(full_name text, job_title text, bio text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, nullif(p.job_title, ''), nullif(p.public_bio, ''),
         CASE WHEN p.public_show_phone THEN nullif(p.phone, '') END
  FROM public.profiles p
  WHERE p.organization_id = _org
    AND p.is_active
    AND p.public_profile_enabled
  ORDER BY lower(p.full_name);
$$;

CREATE OR REPLACE FUNCTION public.public_partner_logo_path(_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(o.logo_path, '') FROM public.organizations o
  WHERE o.id = _id AND public.public_partner_eligible(o) AND o.public_profile_enabled;
$$;

GRANT EXECUTE ON FUNCTION public.public_partner_agencies() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_agency_profile(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_agency_agents(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_partner_logo_path(uuid) TO anon, authenticated;
