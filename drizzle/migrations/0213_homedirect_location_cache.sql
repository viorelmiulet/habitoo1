CREATE TABLE public.homedirect_location_cache (
  cache_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('location','districts')),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.homedirect_location_cache TO authenticated;
GRANT ALL ON public.homedirect_location_cache TO service_role;
ALTER TABLE public.homedirect_location_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homedirect_location_cache_read" ON public.homedirect_location_cache FOR SELECT TO authenticated USING (true);