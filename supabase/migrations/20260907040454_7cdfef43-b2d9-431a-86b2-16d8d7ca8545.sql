CREATE OR REPLACE FUNCTION public.is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (
        role = 'superadmin'
        OR (role = 'agency_admin' AND organization_id = public.current_org())
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.is_org_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated, service_role;