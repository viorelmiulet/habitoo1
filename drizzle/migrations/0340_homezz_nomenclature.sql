CREATE TABLE public.homezz_cities (
  id integer PRIMARY KEY,
  name text NOT NULL,
  county_code text NOT NULL,
  country_code text NOT NULL DEFAULT 'RO',
  lat double precision,
  lng double precision
);
CREATE INDEX homezz_cities_country_county_idx ON public.homezz_cities (country_code, county_code);
CREATE TABLE public.homezz_areas (
  id integer PRIMARY KEY,
  name text NOT NULL,
  city_id integer NOT NULL REFERENCES public.homezz_cities(id),
  lat double precision,
  lng double precision
);
CREATE INDEX homezz_areas_city_idx ON public.homezz_areas (city_id);
GRANT SELECT ON public.homezz_cities, public.homezz_areas TO authenticated;
GRANT ALL ON public.homezz_cities, public.homezz_areas TO service_role;
ALTER TABLE public.homezz_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homezz_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homezz_cities read" ON public.homezz_cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "homezz_areas read" ON public.homezz_areas FOR SELECT TO authenticated USING (true);