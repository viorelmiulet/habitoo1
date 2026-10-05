COMMENT ON COLUMN public.organizations.public_partner_enabled IS 'DEPRECATED: all eligible agencies are listed automatically; unused';

CREATE OR REPLACE FUNCTION public.public_partner_eligible(o public.organizations)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o.archived_at IS NULL AND NOT o.public_hidden_by_admin
    AND (o.status = 'active' OR o.status = 'trial' OR (o.is_trial AND o.status NOT IN ('suspended','cancelled','pending_approval')));
$$;

CREATE OR REPLACE FUNCTION public.public_partner_agencies()
RETURNS TABLE (id uuid, name text, has_logo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, (o.logo_path IS NOT NULL AND o.logo_path <> '')
  FROM public.organizations o
  WHERE public.public_partner_eligible(o)
  ORDER BY lower(o.name);
$$;

CREATE OR REPLACE FUNCTION public.public_partner_logo_path(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(o.logo_path, '') FROM public.organizations o
  WHERE o.id = _id AND public.public_partner_eligible(o);
$$;

REVOKE ALL ON FUNCTION public.public_partner_eligible(public.organizations) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_partner_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_partner_agencies() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.public_partner_logo_path(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_partner_logo_path(uuid) TO service_role;