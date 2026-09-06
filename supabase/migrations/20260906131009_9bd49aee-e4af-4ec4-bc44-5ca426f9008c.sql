REVOKE ALL ON FUNCTION public.superadmin_delete_organization(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_organization(uuid) TO service_role;