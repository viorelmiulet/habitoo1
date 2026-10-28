CREATE TABLE public.imopedia_regions (
  id integer PRIMARY KEY,
  name text NOT NULL,
  name_normalized text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.imopedia_areas (
  id integer PRIMARY KEY,
  area text NOT NULL,
  area_normalized text NOT NULL,
  region_id integer NOT NULL,
  parent_id integer,
  depth integer NOT NULL,
  usable_in_api boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imopedia_areas_region_name_idx ON public.imopedia_areas (region_id, area_normalized);
CREATE INDEX imopedia_areas_parent_idx ON public.imopedia_areas (parent_id);
GRANT SELECT ON public.imopedia_regions, public.imopedia_areas TO authenticated;
GRANT ALL ON public.imopedia_regions, public.imopedia_areas TO service_role;
ALTER TABLE public.imopedia_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imopedia_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imopedia_regions read" ON public.imopedia_regions FOR SELECT TO authenticated USING (true);
CREATE POLICY "imopedia_areas read" ON public.imopedia_areas FOR SELECT TO authenticated USING (true);