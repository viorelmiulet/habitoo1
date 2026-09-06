REVOKE ALL ON FUNCTION public.bootstrap_agency(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_agency(text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.approve_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_organization(uuid) TO authenticated, service_role;
