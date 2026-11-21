CREATE OR REPLACE FUNCTION public.org_public_slug_for(_id uuid, _name text, _city text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE base text; s text;
BEGIN
  base := coalesce(nullif(left(public.offer_slug_part(_name), 80), ''), 'agentie');
  s := base;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE public_slug = s AND id <> _id) THEN
    IF public.offer_slug_part(_city) <> '' THEN s := base || '-' || public.offer_slug_part(_city); END IF;
    IF EXISTS (SELECT 1 FROM public.organizations WHERE public_slug = s AND id <> _id) THEN s := base || '-' || left(replace(_id::text,'-',''), 6); END IF;
  END IF;
  RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.profile_public_slug_for(_id uuid, _org uuid, _name text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE base text; s text; n int := 1;
BEGIN
  base := coalesce(nullif(left(public.offer_slug_part(_name), 80), ''), 'agent');
  s := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE public_slug = s AND organization_id IS NOT DISTINCT FROM _org AND id <> _id) LOOP
    n := n + 1;
    IF n > 50 THEN RETURN base || '-' || left(replace(_id::text,'-',''), 6); END IF;
    s := base || '-' || n;
  END LOOP;
  RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.organizations_public_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.public_slug IS NOT NULL THEN NEW.public_slug := OLD.public_slug; RETURN NEW; END IF;
  NEW.public_slug := public.org_public_slug_for(NEW.id, NEW.name, NEW.city);
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.profiles_public_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.public_slug IS NOT NULL THEN
    NEW.public_slug := OLD.public_slug;
    IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_slug = OLD.public_slug AND organization_id IS NOT DISTINCT FROM NEW.organization_id AND id <> NEW.id)
    THEN RETURN NEW; END IF;
  END IF;
  NEW.public_slug := public.profile_public_slug_for(NEW.id, NEW.organization_id, NEW.full_name);
  RETURN NEW;
END; $$;

DROP INDEX IF EXISTS public.profiles_public_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_public_slug_key ON public.profiles(organization_id, public_slug) WHERE public_slug IS NOT NULL;

ALTER TABLE public.organizations DISABLE TRIGGER USER;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name, city FROM public.organizations WHERE public_slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.organizations SET public_slug = public.org_public_slug_for(r.id, r.name, r.city) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.organizations ENABLE TRIGGER USER;
ALTER TABLE public.profiles DISABLE TRIGGER USER;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, organization_id, full_name FROM public.profiles WHERE public_slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.profiles SET public_slug = public.profile_public_slug_for(r.id, r.organization_id, r.full_name) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.profiles ENABLE TRIGGER USER;

CREATE TRIGGER organizations_public_slug BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.organizations_public_slug();
CREATE TRIGGER profiles_public_slug BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_public_slug();

CREATE OR REPLACE FUNCTION public.public_offer_listable(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.properties p JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = _id AND p.public_slug IS NOT NULL AND p.publish_status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
      AND p.status IN ('active','reserved','negotiation') AND NOT coalesce(o.public_hidden_by_admin, false)
      AND NOT EXISTS (SELECT 1 FROM public.properties c JOIN public.organizations co ON co.id = c.organization_id
        WHERE c.id = p.cloned_from_property_id AND c.public_slug IS NOT NULL AND c.publish_status = 'published' AND c.deleted_at IS NULL
          AND c.archived_at IS NULL AND c.status IN ('active','reserved','negotiation') AND NOT coalesce(co.public_hidden_by_admin, false)))
$$;

CREATE OR REPLACE FUNCTION public.public_agency_page(_slug text)
RETURNS TABLE(id uuid, name text, slug text, description text, has_logo boolean, city text, phone text, email text, website text, current_access boolean, offer_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.name, o.public_slug, nullif(btrim(o.public_description),''), (o.logo_path IS NOT NULL AND o.logo_path <> ''), nullif(btrim(o.city),''),
    CASE WHEN public.public_partner_current_access(o) THEN coalesce(nullif(btrim(o.material_phone),''), nullif(btrim(o.phone),'')) END,
    CASE WHEN public.public_partner_current_access(o) THEN coalesce(nullif(btrim(o.material_email),''), nullif(btrim(o.email),'')) END,
    CASE WHEN public.public_partner_current_access(o) THEN nullif(btrim(o.material_website),'') END,
    public.public_partner_current_access(o),
    (SELECT count(*) FROM public.properties p WHERE p.organization_id = o.id AND public.public_offer_listable(p.id))
  FROM public.organizations o WHERE o.public_slug = lower(_slug) AND public.public_partner_eligible(o)
$$;

CREATE OR REPLACE FUNCTION public.public_agency_agent_list(_slug text)
RETURNS TABLE(slug text, full_name text, job_title text, has_avatar boolean, offer_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT pr.public_slug, pr.full_name, nullif(btrim(pr.job_title),''), (pr.avatar_url IS NOT NULL AND pr.avatar_url <> ''),
    (SELECT count(*) FROM public.properties p WHERE p.organization_id = o.id AND p.assigned_to = pr.id AND public.public_offer_listable(p.id))
  FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_slug) AND public.public_partner_eligible(o) AND pr.is_active AND pr.public_slug IS NOT NULL AND nullif(btrim(pr.full_name),'') IS NOT NULL
  ORDER BY lower(pr.full_name), pr.public_slug
$$;

CREATE OR REPLACE FUNCTION public.public_agent_page(_agency_slug text, _agent_slug text)
RETURNS TABLE(slug text, full_name text, job_title text, bio text, phone text, has_avatar boolean, is_active boolean, offer_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT pr.public_slug, pr.full_name, nullif(btrim(pr.job_title),''), nullif(btrim(pr.public_bio),''),
    CASE WHEN pr.public_show_phone AND pr.is_active AND public.public_partner_current_access(o) THEN nullif(btrim(pr.phone),'') END,
    (pr.avatar_url IS NOT NULL AND pr.avatar_url <> ''), coalesce(pr.is_active, false),
    (SELECT count(*) FROM public.properties p WHERE p.organization_id = o.id AND p.assigned_to = pr.id AND public.public_offer_listable(p.id))
  FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_agency_slug) AND pr.public_slug = lower(_agent_slug) AND public.public_partner_eligible(o)
$$;

CREATE OR REPLACE FUNCTION public.public_agent_avatar_path(_agency_slug text, _agent_slug text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT nullif(pr.avatar_url,'') FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id
  WHERE o.public_slug = lower(_agency_slug) AND pr.public_slug = lower(_agent_slug) AND public.public_partner_eligible(o)
$$;

CREATE OR REPLACE FUNCTION public.public_agency_offers(_agency_slug text, _agent_slug text DEFAULT NULL, _offset integer DEFAULT 0, _limit integer DEFAULT 24)
RETURNS TABLE(slug text, title text, price numeric, currency text, transaction_kind text, property_type text, rooms integer, surface numeric, city text, district text, image_id uuid, updated_at timestamptz, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.public_slug, p.title, p.price, p.currency, p.transaction_kind::text, p.property_type::text, p.rooms, p.surface, p.city, p.district,
    (SELECT i.id FROM public.property_images i WHERE i.property_id = p.id AND i.include_in_publish AND NOT coalesce(i.is_confidential,false)
      ORDER BY i.is_primary DESC NULLS LAST, i.position NULLS LAST LIMIT 1),
    p.updated_at, count(*) OVER ()
  FROM public.organizations o JOIN public.properties p ON p.organization_id = o.id
  WHERE o.public_slug = lower(_agency_slug) AND public.public_partner_eligible(o) AND public.public_offer_listable(p.id)
    AND (_agent_slug IS NULL OR p.assigned_to = (SELECT pr.id FROM public.profiles pr WHERE pr.organization_id = o.id AND pr.public_slug = lower(_agent_slug)))
  ORDER BY p.updated_at DESC, p.id
  OFFSET greatest(_offset,0) LIMIT least(greatest(_limit,0),48)
$$;

CREATE OR REPLACE FUNCTION public.public_agency_sitemap()
RETURNS TABLE(path text, lastmod timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT '/agentii/' || o.public_slug, max(p.updated_at)
  FROM public.organizations o JOIN public.properties p ON p.organization_id = o.id
  WHERE o.public_slug IS NOT NULL AND public.public_partner_eligible(o) AND public.public_partner_current_access(o) AND public.public_offer_listable(p.id)
  GROUP BY o.public_slug
  UNION ALL
  SELECT '/agentii/' || o.public_slug || '/' || pr.public_slug, max(p.updated_at)
  FROM public.organizations o JOIN public.profiles pr ON pr.organization_id = o.id JOIN public.properties p ON p.organization_id = o.id AND p.assigned_to = pr.id
  WHERE o.public_slug IS NOT NULL AND pr.public_slug IS NOT NULL AND pr.is_active AND public.public_partner_eligible(o) AND public.public_partner_current_access(o) AND public.public_offer_listable(p.id)
  GROUP BY o.public_slug, pr.public_slug
  ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.public_partner_agencies()
RETURNS TABLE(id uuid, name text, has_logo boolean, public_slug text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT o.id,o.name,(o.logo_path IS NOT NULL AND o.logo_path<>''), nullif(btrim(o.public_slug),'')
 FROM public.organizations o WHERE public.public_partner_eligible(o)
 ORDER BY public.public_partner_current_access(o) DESC, lower(o.name), o.id;
$$;

REVOKE ALL ON FUNCTION public.public_offer_listable(uuid), public.public_agency_page(text), public.public_agency_agent_list(text), public.public_agent_page(text,text),
  public.public_agent_avatar_path(text,text), public.public_agency_offers(text,text,integer,integer), public.public_agency_sitemap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_offer_listable(uuid), public.public_agency_page(text), public.public_agency_agent_list(text), public.public_agent_page(text,text),
  public.public_agency_offers(text,text,integer,integer), public.public_agency_sitemap() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_agent_avatar_path(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.org_public_slug_for(uuid,text,text), public.profile_public_slug_for(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.properties_indexnow_profiles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
          SELECT 'https://www.habitoo.ro/agentii/' || org_slug || '/' || pr.public_slug FROM public.profiles pr WHERE pr.id = agent AND pr.organization_id = NEW.organization_id AND pr.public_slug IS NOT NULL
          ON CONFLICT (url) DO UPDATE SET enqueued_at = now();
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$;
CREATE TRIGGER properties_indexnow_profiles AFTER INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.properties_indexnow_profiles();