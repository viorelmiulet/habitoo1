-- RLS policies call these helpers as the signed-in role; without EXECUTE every query fails with
-- "permission denied for function current_org". They are read-only and scoped to auth.uid().
GRANT EXECUTE ON FUNCTION public.current_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;