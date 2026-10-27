CREATE TABLE public.social_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source ~ '^[a-z0-9_.-]{1,50}$'),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  url text,
  group_name text,
  posted_at timestamptz,
  text text CHECK (text IS NULL OR length(text) <= 5000),
  author_name text,
  publisher_type text CHECK (publisher_type IS NULL OR publisher_type IN ('particular','neclar','agentie')),
  transaction_type text CHECK (transaction_type IS NULL OR transaction_type IN ('cumparare','inchiriere')),
  property_type text,
  rooms integer,
  budget_min numeric,
  budget_max numeric,
  currency text,
  county text,
  city text,
  zone text,
  zones text[] NOT NULL DEFAULT '{}',
  phone text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
COMMENT ON TABLE public.social_requests IS 'Client search requests from public social posts (personal data, 30-day retention).';
CREATE INDEX social_requests_recent_idx ON public.social_requests (coalesce(posted_at, first_seen_at) DESC);

GRANT SELECT ON public.social_requests TO authenticated;
GRANT ALL ON public.social_requests TO service_role;
ALTER TABLE public.social_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read recent social requests" ON public.social_requests FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND coalesce(posted_at, first_seen_at) >= now() - interval '30 days');

CREATE OR REPLACE FUNCTION public.social_requests_normalize() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE z text; out_zones text[] := '{}'; g record; canonical_name text;
BEGIN
  IF coalesce(array_length(NEW.zones,1),0) = 0 AND nullif(btrim(NEW.zone),'') IS NOT NULL THEN
    NEW.zones := ARRAY(SELECT btrim(x) FROM regexp_split_to_table(NEW.zone, '\s*[,;/]\s*') x WHERE btrim(x) <> '');
  END IF;
  SELECT n.city, n.county INTO g FROM public.normalize_listing_geography(NEW.city, NEW.county, NEW.zones[1], NULL) n;
  NEW.city := g.city; NEW.county := g.county;
  IF NEW.city IS NOT NULL THEN
    SELECT min(public.listing_place_label(l.name)) INTO canonical_name FROM public.ro_localities l
      WHERE l.active AND public.ro_normalize_name(public.listing_place_label(l.name)) = public.ro_normalize_name(NEW.city)
      HAVING count(DISTINCT public.listing_place_label(l.name)) = 1;
    NEW.city := coalesce(canonical_name, NEW.city);
  END IF;
  FOREACH z IN ARRAY coalesce(NEW.zones,'{}') LOOP
    SELECT n.zone INTO canonical_name FROM public.normalize_listing_geography(NEW.city, NEW.county, z, NULL) n;
    IF coalesce(canonical_name, z) IS NOT NULL AND NOT coalesce(canonical_name, z) = ANY(out_zones) THEN out_zones := out_zones || coalesce(canonical_name, z); END IF;
  END LOOP;
  NEW.zones := out_zones;
  NEW.zone := nullif(array_to_string(out_zones, ', '), '');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER social_requests_normalize BEFORE INSERT OR UPDATE ON public.social_requests FOR EACH ROW EXECUTE FUNCTION public.social_requests_normalize();

CREATE OR REPLACE FUNCTION public.search_social_requests_places(_choices jsonb) RETURNS SETOF public.social_requests LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT r.* FROM public.social_requests r WHERE
    public.search_place_matches(r.county, r.city, NULL, NULL, _choices)
    OR EXISTS (SELECT 1 FROM unnest(r.zones) z WHERE public.search_place_matches(r.county, r.city, z, NULL, _choices))
$$;
REVOKE ALL ON FUNCTION public.search_social_requests_places(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_social_requests_places(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_old_social_requests() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; BEGIN
  DELETE FROM public.social_requests WHERE coalesce(posted_at, first_seen_at) < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purge_old_social_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_social_requests() TO service_role;

SELECT cron.schedule('purge-old-social-requests', '41 1 * * *', 'select public.purge_old_social_requests()');