CREATE OR REPLACE FUNCTION public.current_org()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.organization_id
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = auth.uid()
    AND o.status NOT IN ('suspended','cancelled')
    AND o.archived_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.org_access_blocked()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN o.archived_at IS NOT NULL THEN 'archived'
    WHEN o.status = 'suspended' THEN 'suspended'
    WHEN o.status = 'cancelled' THEN 'cancelled'
    ELSE NULL
  END
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.org_access_blocked() FROM anon;