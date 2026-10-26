ALTER TABLE public.listings DROP CONSTRAINT listings_source_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_source_check CHECK (source IN ('storia', 'imobiliare', 'olx', 'romimo', 'imoradar', 'anuntul', 'facebook'));

CREATE OR REPLACE FUNCTION public.public_llms_statistics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'owner_sources', (SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', n) ORDER BY source), '[]'::jsonb) FROM (SELECT source, count(*) AS n FROM public.listings WHERE is_owner = true AND source <> 'facebook' GROUP BY source) AS counts),
    'market_active', (SELECT count(*) FROM public.market_listings WHERE status = 'active' AND source <> 'facebook')
  );
$$;
REVOKE ALL ON FUNCTION public.public_llms_statistics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_llms_statistics() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.public_llms_statistics() IS 'Public aggregate counts only, excluding Facebook. Owner listings are retained rows under the existing 60-day purge; no listing rows, contacts or CRM data exposed.';