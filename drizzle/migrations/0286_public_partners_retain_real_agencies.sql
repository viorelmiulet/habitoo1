CREATE OR REPLACE FUNCTION public.public_partner_eligible(o public.organizations)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT NOT coalesce(o.is_demo,false) AND NOT coalesce(o.public_hidden_by_admin,false);
$$;
CREATE OR REPLACE FUNCTION public.public_partner_current_access(o public.organizations)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT o.archived_at IS NULL AND o.status IN ('active','trial')
 AND (o.subscription_expires_at IS NULL OR o.subscription_expires_at > now());
$$;
REVOKE ALL ON FUNCTION public.public_partner_eligible(public.organizations) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_partner_current_access(public.organizations) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_partner_eligible(public.organizations), public.public_partner_current_access(public.organizations) TO service_role;
CREATE OR REPLACE FUNCTION public.public_partner_agencies()
RETURNS TABLE(id uuid, name text, has_logo boolean, public_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT o.id,o.name,(o.logo_path IS NOT NULL AND o.logo_path<>''),
 CASE WHEN o.public_profile_enabled AND nullif(btrim(o.public_slug),'') IS NOT NULL THEN o.public_slug ELSE NULL END
 FROM public.organizations o WHERE public.public_partner_eligible(o)
 ORDER BY public.public_partner_current_access(o) DESC, lower(o.name), o.id;
$$;
REVOKE ALL ON FUNCTION public.public_partner_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_partner_agencies() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.public_agency_agents(_org uuid)
RETURNS TABLE(full_name text, job_title text, bio text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT p.full_name,nullif(p.job_title,''),nullif(p.public_bio,''),CASE WHEN p.public_show_phone THEN nullif(p.phone,'') END
 FROM public.profiles p
 WHERE p.organization_id=_org AND p.is_active AND p.public_profile_enabled
 AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=_org AND o.public_profile_enabled AND public.public_partner_eligible(o) AND public.public_partner_current_access(o))
 ORDER BY lower(p.full_name);
$$;
REVOKE ALL ON FUNCTION public.public_agency_agents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_agency_agents(uuid) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.public_agency_city(_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT nullif(btrim(o.city),'') FROM public.organizations o
 WHERE o.public_slug=_slug AND o.public_profile_enabled AND public.public_partner_eligible(o);
$$;
REVOKE ALL ON FUNCTION public.public_agency_city(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_agency_city(text) TO anon, authenticated, service_role;