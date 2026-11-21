ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS public_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS properties_public_slug_key ON public.properties(public_slug) WHERE public_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.offer_slug_part(_t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT trim(both '-' from regexp_replace(translate(lower(coalesce(_t,'')),'ăâîșşțţĂÂÎȘŞȚŢéèëêáàäöüóòôíìúùûç','aaissttaaissttteeeeaaaoouoooiiuuuc'),'[^a-z0-9]+','-','g'))
$$;

CREATE OR REPLACE FUNCTION public.offer_slug(_type text,_rooms integer,_district text,_city text,_reference text,_disambiguator text DEFAULT NULL) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE t text; prefix text; zone text; city text; tail text; s text;
BEGIN
  t := CASE lower(coalesce(_type,'')) WHEN 'apartment' THEN 'apartament' WHEN 'studio' THEN 'garsoniera' WHEN 'house' THEN 'casa' WHEN 'villa' THEN 'vila'
    WHEN 'land' THEN 'teren' WHEN 'commercial' THEN 'spatiu-comercial' WHEN 'office' THEN 'birou' WHEN 'industrial' THEN 'spatiu-industrial'
    WHEN 'penthouse' THEN 'penthouse' WHEN 'duplex' THEN 'duplex' ELSE public.offer_slug_part(_type) END;
  prefix := t;
  IF _rooms IS NOT NULL AND _rooms > 0 AND t NOT IN ('garsoniera','teren') THEN
    prefix := concat_ws('-', nullif(prefix,''), _rooms::text || CASE WHEN _rooms = 1 THEN '-camera' ELSE '-camere' END);
  END IF;
  zone := public.offer_slug_part(_district); city := public.offer_slug_part(_city);
  IF zone = city THEN zone := ''; END IF;
  tail := concat_ws('-', nullif(public.offer_slug_part(_disambiguator),''), nullif(public.offer_slug_part(_reference),''));
  LOOP
    s := concat_ws('-', nullif(prefix,''), nullif(zone,''), nullif(city,''), nullif(tail,''));
    EXIT WHEN length(s) <= 90;
    IF zone <> '' THEN zone := trim(both '-' from left(zone, greatest(length(zone) - (length(s) - 90), 0)));
    ELSIF city <> '' THEN city := trim(both '-' from left(city, greatest(length(city) - (length(s) - 90), 0)));
    ELSIF prefix <> '' THEN prefix := trim(both '-' from left(prefix, greatest(length(prefix) - (length(s) - 90), 0)));
    ELSE s := right(tail, 90); EXIT; END IF;
  END LOOP;
  RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.properties_public_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text;
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.public_slug := NULL;
  ELSIF OLD.public_slug IS NOT NULL THEN NEW.public_slug := OLD.public_slug; RETURN NEW; END IF;
  IF NEW.publish_status = 'published' THEN
    s := public.offer_slug(NEW.property_type, NEW.rooms, NEW.district, NEW.city, coalesce(NEW.reference, left(NEW.id::text, 8)));
    IF EXISTS (SELECT 1 FROM public.properties WHERE public_slug = s AND id <> NEW.id) THEN
      s := public.offer_slug(NEW.property_type, NEW.rooms, NEW.district, NEW.city, coalesce(NEW.reference, left(NEW.id::text, 8)), left(replace(NEW.id::text,'-',''), 6));
    END IF;
    NEW.public_slug := s;
  END IF;
  RETURN NEW;
END; $$;

ALTER TABLE public.properties DISABLE TRIGGER USER;
UPDATE public.properties p SET public_slug = public.offer_slug(p.property_type, p.rooms, p.district, p.city, coalesce(p.reference, left(p.id::text, 8)),
  CASE WHEN (SELECT count(*) FROM public.properties q WHERE q.reference = p.reference) > 1 THEN left(replace(p.id::text,'-',''), 6) END)
 WHERE p.publish_status = 'published' AND p.public_slug IS NULL;
ALTER TABLE public.properties ENABLE TRIGGER USER;

CREATE TRIGGER properties_public_slug BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.properties_public_slug();

CREATE OR REPLACE FUNCTION public.public_offer_sitemap(_offset integer DEFAULT 0, _limit integer DEFAULT 45000)
RETURNS TABLE(slug text, lastmod timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.public_slug, p.updated_at FROM public.properties p JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.public_slug IS NOT NULL AND p.publish_status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
    AND p.status IN ('active','reserved','negotiation') AND NOT coalesce(o.public_hidden_by_admin, false)
    AND NOT EXISTS (SELECT 1 FROM public.properties c JOIN public.organizations co ON co.id = c.organization_id
      WHERE c.id = p.cloned_from_property_id AND c.public_slug IS NOT NULL AND c.publish_status = 'published' AND c.deleted_at IS NULL
        AND c.archived_at IS NULL AND c.status IN ('active','reserved','negotiation') AND NOT coalesce(co.public_hidden_by_admin, false))
  ORDER BY p.public_slug OFFSET greatest(_offset,0) LIMIT least(greatest(_limit,0),45000)
$$;
CREATE OR REPLACE FUNCTION public.public_offer_sitemap_count() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*) FROM public.properties p JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.public_slug IS NOT NULL AND p.publish_status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
    AND p.status IN ('active','reserved','negotiation') AND NOT coalesce(o.public_hidden_by_admin, false)
    AND NOT EXISTS (SELECT 1 FROM public.properties c JOIN public.organizations co ON co.id = c.organization_id
      WHERE c.id = p.cloned_from_property_id AND c.public_slug IS NOT NULL AND c.publish_status = 'published' AND c.deleted_at IS NULL
        AND c.archived_at IS NULL AND c.status IN ('active','reserved','negotiation') AND NOT coalesce(co.public_hidden_by_admin, false))
$$;
REVOKE ALL ON FUNCTION public.public_offer_sitemap(integer,integer), public.public_offer_sitemap_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_offer_sitemap(integer,integer), public.public_offer_sitemap_count() TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.seo_indexnow_offer_queue (url text PRIMARY KEY, enqueued_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.seo_indexnow_offer_queue TO service_role;
ALTER TABLE public.seo_indexnow_offer_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seo_indexnow_offer_queue FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.properties_indexnow_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.public_slug IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR OLD.publish_status = 'published' OR NEW.publish_status = 'published' THEN
    BEGIN
      INSERT INTO public.seo_indexnow_offer_queue(url) VALUES ('https://www.habitoo.ro/oferta/' || NEW.public_slug)
        ON CONFLICT (url) DO UPDATE SET enqueued_at = now();
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER properties_indexnow_enqueue AFTER INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.properties_indexnow_enqueue();