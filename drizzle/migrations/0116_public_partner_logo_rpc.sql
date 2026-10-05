DROP FUNCTION IF EXISTS public.public_partner_agencies();
CREATE FUNCTION public.public_partner_agencies()
RETURNS TABLE (id uuid, name text, has_logo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, (o.logo_path IS NOT NULL AND o.logo_path <> '')
  FROM public.organizations o
  WHERE o.public_partner_enabled AND NOT o.public_hidden_by_admin
    AND o.archived_at IS NULL AND o.status IN ('active','trial')
  ORDER BY lower(o.name);
$$;
REVOKE ALL ON FUNCTION public.public_partner_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_partner_agencies() TO anon, authenticated, service_role;

-- Calea internă a logo-ului, doar pentru serverul care servește imaginea.
CREATE FUNCTION public.public_partner_logo_path(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(o.logo_path, '') FROM public.organizations o
  WHERE o.id = _id AND o.public_partner_enabled AND NOT o.public_hidden_by_admin
    AND o.archived_at IS NULL AND o.status IN ('active','trial');
$$;
REVOKE ALL ON FUNCTION public.public_partner_logo_path(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_partner_logo_path(uuid) TO service_role;