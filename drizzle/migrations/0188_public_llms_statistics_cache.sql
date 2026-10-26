CREATE TABLE public.public_statistics_cache (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  data jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.public_statistics_cache TO service_role;
ALTER TABLE public.public_statistics_cache ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.refresh_public_llms_statistics()
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
  INSERT INTO public.public_statistics_cache (id, data, refreshed_at)
  SELECT true, jsonb_build_object(
    'owner_sources', (SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', n) ORDER BY source), '[]'::jsonb) FROM (SELECT source, count(*) AS n FROM public.listings WHERE is_owner = true AND source <> 'facebook' GROUP BY source) AS counts),
    'market_active', (SELECT count(*) FROM public.market_listings WHERE status = 'active' AND source <> 'facebook')
  ), now()
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, refreshed_at = EXCLUDED.refreshed_at;
$$;
REVOKE ALL ON FUNCTION public.refresh_public_llms_statistics() FROM PUBLIC, anon, authenticated;

SELECT public.refresh_public_llms_statistics();

CREATE OR REPLACE FUNCTION public.public_llms_statistics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT data FROM public.public_statistics_cache WHERE id = true;
$$;

SELECT cron.schedule('public-statistics-hourly', '7 * * * *', $$SELECT public.refresh_public_llms_statistics();$$);