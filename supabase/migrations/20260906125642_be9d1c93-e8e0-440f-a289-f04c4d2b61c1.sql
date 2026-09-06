REVOKE EXECUTE ON FUNCTION public.org_access_blocked() FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_access_blocked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_access_blocked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_access_blocked() TO service_role;