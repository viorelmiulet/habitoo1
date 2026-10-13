CREATE OR REPLACE FUNCTION public.public_partner_agencies()
RETURNS TABLE(id uuid, name text, has_logo boolean, public_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, (o.logo_path IS NOT NULL AND o.logo_path <> ''),
    CASE WHEN o.public_profile_enabled AND nullif(btrim(o.public_slug), '') IS NOT NULL THEN o.public_slug ELSE NULL END
  FROM public.organizations o
  WHERE public.public_partner_eligible(o)
  ORDER BY lower(o.name);
$$;
REVOKE ALL ON FUNCTION public.public_partner_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_partner_agencies() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_partner_logo_path(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(o.logo_path, '') FROM public.organizations o
  WHERE o.id = _id AND public.public_partner_eligible(o);
$$;
REVOKE ALL ON FUNCTION public.public_partner_logo_path(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_partner_logo_path(uuid) TO service_role;