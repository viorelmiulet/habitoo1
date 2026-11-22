CREATE OR REPLACE FUNCTION public.public_agency_sitemap()
 RETURNS TABLE(path text, lastmod timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT '/agentii/' || o.public_slug, max(p.updated_at)
  FROM public.organizations o JOIN public.properties p ON p.organization_id = o.id
  WHERE o.public_slug IS NOT NULL AND public.public_partner_eligible(o) AND public.public_partner_current_access(o) AND public.public_offer_listable(p.id)
  GROUP BY o.public_slug
  ORDER BY 1
$function$;

CREATE OR REPLACE FUNCTION public.properties_indexnow_profiles()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE org_slug text;
BEGIN
  IF NEW.public_slug IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.publish_status = 'published' OR NEW.publish_status = 'published') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.publish_status IS NOT DISTINCT FROM NEW.publish_status AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at AND OLD.archived_at IS NOT DISTINCT FROM NEW.archived_at
     AND OLD.public_slug IS NOT DISTINCT FROM NEW.public_slug THEN RETURN NEW; END IF;
  BEGIN
    SELECT public_slug INTO org_slug FROM public.organizations WHERE id = NEW.organization_id;
    IF org_slug IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.seo_indexnow_offer_queue(url) VALUES ('https://www.habitoo.ro/agentii/' || org_slug) ON CONFLICT (url) DO UPDATE SET enqueued_at = now();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $function$;

DELETE FROM public.seo_indexnow_offer_queue WHERE url LIKE 'https://www.habitoo.ro/agentii/%/%';

CREATE OR REPLACE FUNCTION public.public_agent_avatar_path(_agency_slug text, _agent_slug text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT nullif(pr.avatar_url,'') FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_agency_slug) AND pr.public_slug = lower(_agent_slug) AND public.public_partner_eligible(o)
    AND pr.is_active AND NOT pr.public_profile_hidden
$function$;

CREATE OR REPLACE FUNCTION public.public_offer_agent(_property_id uuid)
 RETURNS TABLE(agency_slug text, agent_slug text, full_name text, phone text, has_avatar boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.public_slug,
    CASE WHEN pr.id IS NOT NULL THEN pr.public_slug END,
    CASE WHEN pr.id IS NOT NULL THEN pr.full_name END,
    CASE WHEN pr.id IS NOT NULL AND pr.public_show_phone AND public.public_partner_current_access(o) THEN nullif(btrim(pr.phone),'') END,
    coalesce(pr.id IS NOT NULL AND pr.public_slug IS NOT NULL AND pr.avatar_url IS NOT NULL AND pr.avatar_url <> '', false)
  FROM public.properties p JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN public.profiles pr ON pr.id = p.assigned_to AND pr.organization_id = o.id AND pr.is_active
    AND NOT pr.public_profile_hidden AND nullif(btrim(pr.full_name),'') IS NOT NULL
  WHERE p.id = _property_id AND public.public_offer_listable(p.id)
$function$;
GRANT EXECUTE ON FUNCTION public.public_offer_agent(uuid) TO anon, authenticated, service_role;