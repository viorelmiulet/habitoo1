ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_profile_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_public_profile_hidden()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_profile_hidden IS DISTINCT FROM OLD.public_profile_hidden
     AND auth.uid() IS NOT NULL AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar SuperAdmin poate ascunde profilul public.' USING ERRCODE = '42501';
  END IF;
  IF NEW.public_profile_hidden AND NOT OLD.public_profile_hidden AND NEW.public_slug IS NOT NULL THEN
    BEGIN
      DELETE FROM public.seo_indexnow_offer_queue q
       USING public.organizations o
       WHERE o.id = NEW.organization_id AND o.public_slug IS NOT NULL
         AND q.url = 'https://www.habitoo.ro/agentii/' || o.public_slug || '/' || NEW.public_slug;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_public_profile_hidden ON public.profiles;
CREATE TRIGGER guard_public_profile_hidden BEFORE UPDATE OF public_profile_hidden ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_public_profile_hidden();

CREATE OR REPLACE FUNCTION public.public_agency_agent_list(_slug text)
 RETURNS TABLE(slug text, full_name text, job_title text, has_avatar boolean, offer_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT pr.public_slug, pr.full_name, nullif(btrim(pr.job_title),''), (pr.avatar_url IS NOT NULL AND pr.avatar_url <> ''),
    (SELECT count(*) FROM public.properties p WHERE p.organization_id = o.id AND p.assigned_to = pr.id AND public.public_offer_listable(p.id))
  FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_slug) AND public.public_partner_eligible(o) AND pr.is_active AND NOT pr.public_profile_hidden
    AND pr.public_slug IS NOT NULL AND nullif(btrim(pr.full_name),'') IS NOT NULL
  ORDER BY lower(pr.full_name), pr.public_slug
$function$;

CREATE OR REPLACE FUNCTION public.public_agent_page(_agency_slug text, _agent_slug text)
 RETURNS TABLE(slug text, full_name text, job_title text, bio text, phone text, has_avatar boolean, is_active boolean, offer_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT pr.public_slug, pr.full_name, nullif(btrim(pr.job_title),''), nullif(btrim(pr.public_bio),''),
    CASE WHEN pr.public_show_phone AND pr.is_active AND public.public_partner_current_access(o) THEN nullif(btrim(pr.phone),'') END,
    (pr.avatar_url IS NOT NULL AND pr.avatar_url <> ''), coalesce(pr.is_active, false),
    (SELECT count(*) FROM public.properties p WHERE p.organization_id = o.id AND p.assigned_to = pr.id AND public.public_offer_listable(p.id))
  FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_agency_slug) AND pr.public_slug = lower(_agent_slug) AND public.public_partner_eligible(o) AND NOT pr.public_profile_hidden
$function$;

CREATE OR REPLACE FUNCTION public.public_agent_avatar_path(_agency_slug text, _agent_slug text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT nullif(pr.avatar_url,'') FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_agency_slug) AND pr.public_slug = lower(_agent_slug) AND public.public_partner_eligible(o) AND NOT pr.public_profile_hidden
$function$;

CREATE OR REPLACE FUNCTION public.public_agency_sitemap()
 RETURNS TABLE(path text, lastmod timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT '/agentii/' || o.public_slug, max(p.updated_at)
  FROM public.organizations o JOIN public.properties p ON p.organization_id = o.id
  WHERE o.public_slug IS NOT NULL AND public.public_partner_eligible(o) AND public.public_partner_current_access(o) AND public.public_offer_listable(p.id)
  GROUP BY o.public_slug
  UNION ALL
  SELECT '/agentii/' || o.public_slug || '/' || pr.public_slug, max(p.updated_at)
  FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id JOIN public.properties p ON p.organization_id = o.id AND p.assigned_to = pr.id
  WHERE o.public_slug IS NOT NULL AND pr.public_slug IS NOT NULL AND pr.is_active AND NOT pr.public_profile_hidden
    AND public.public_partner_eligible(o) AND public.public_partner_current_access(o) AND public.public_offer_listable(p.id)
  GROUP BY o.public_slug, pr.public_slug
  ORDER BY 1
$function$;

CREATE OR REPLACE FUNCTION public.properties_indexnow_profiles()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE org_slug text; agent uuid;
BEGIN
  IF NEW.public_slug IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.publish_status = 'published' OR NEW.publish_status = 'published') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.publish_status IS NOT DISTINCT FROM NEW.publish_status AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at AND OLD.archived_at IS NOT DISTINCT FROM NEW.archived_at
     AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to AND OLD.public_slug IS NOT DISTINCT FROM NEW.public_slug THEN RETURN NEW; END IF;
  BEGIN
    SELECT public_slug INTO org_slug FROM public.organizations WHERE id = NEW.organization_id;
    IF org_slug IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.seo_indexnow_offer_queue(url) VALUES ('https://www.habitoo.ro/agentii/' || org_slug) ON CONFLICT (url) DO UPDATE SET enqueued_at = now();
    FOREACH agent IN ARRAY ARRAY[NEW.assigned_to, CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END] LOOP
      IF agent IS NOT NULL THEN
        INSERT INTO public.seo_indexnow_offer_queue(url)
          SELECT 'https://www.habitoo.ro/agentii/' || org_slug || '/' || pr.public_slug FROM public.profiles pr
           WHERE pr.id = agent AND pr.organization_id = NEW.organization_id AND pr.public_slug IS NOT NULL AND NOT pr.public_profile_hidden
          ON CONFLICT (url) DO UPDATE SET enqueued_at = now();
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $function$;