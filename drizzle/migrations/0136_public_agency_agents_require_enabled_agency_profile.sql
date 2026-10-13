CREATE OR REPLACE FUNCTION public.public_agency_agents(_org uuid)
RETURNS TABLE(full_name text, job_title text, bio text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.full_name, nullif(p.job_title, ''), nullif(p.public_bio, ''),
         CASE WHEN p.public_show_phone THEN nullif(p.phone, '') END
  FROM public.profiles p
  WHERE p.organization_id = _org
    AND p.is_active
    AND p.public_profile_enabled
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = _org AND o.public_profile_enabled AND public.public_partner_eligible(o)
    )
  ORDER BY lower(p.full_name);
$$;
REVOKE ALL ON FUNCTION public.public_agency_agents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_agency_agents(uuid) TO anon, authenticated, service_role;