DROP POLICY IF EXISTS "Public read access to listings" ON public.listings;
REVOKE ALL ON public.listings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.listings FROM authenticated;
GRANT SELECT ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read private listings" ON public.listings
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS city text, ADD COLUMN IF NOT EXISTS zone text;
CREATE INDEX IF NOT EXISTS listings_city_idx ON public.listings (lower(city));
CREATE INDEX IF NOT EXISTS listings_zone_idx ON public.listings (lower(zone));
CREATE INDEX IF NOT EXISTS listings_rooms_idx ON public.listings (rooms);