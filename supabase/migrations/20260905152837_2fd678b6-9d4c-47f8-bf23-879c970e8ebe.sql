REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_agency(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_agency(text,text,text) TO authenticated;