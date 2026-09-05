-- Normalization helper (immutable, usable in generated columns and indexes)
CREATE OR REPLACE FUNCTION public.ro_normalize_name(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          coalesce(_v, ''),
          'ĂÂÎȘŞȚŢăâîșşțţÁÀÄÉÈËÍÏÓÖÚÜÇáàäéèëíïóöúüç',
          'AAISSTTaaisstt AAAEEEIIOOUUCaaaeeeiioouuc'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
    ' '
  );
$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Counties
CREATE TABLE public.ro_counties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  siruta_code integer NOT NULL UNIQUE,
  county_code integer NOT NULL UNIQUE,
  name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (public.ro_normalize_name(name)) STORED,
  region_code integer,
  nuts_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ro_counties TO authenticated;
GRANT ALL ON public.ro_counties TO service_role;
ALTER TABLE public.ro_counties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ro_counties_read" ON public.ro_counties FOR SELECT TO authenticated USING (true);

-- UATs (municipii, orase, comune, municipiul Bucuresti)
CREATE TABLE public.ro_uats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  siruta_code integer NOT NULL UNIQUE,
  name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (public.ro_normalize_name(name)) STORED,
  type text NOT NULL,
  type_code integer NOT NULL,
  medium text,
  county_id uuid NOT NULL REFERENCES public.ro_counties(id) ON DELETE CASCADE,
  county_siruta_code integer NOT NULL,
  parent_siruta_code integer,
  postal_code text,
  latitude double precision,
  longitude double precision,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ro_uats_county_id_idx ON public.ro_uats (county_id);
CREATE INDEX ro_uats_normalized_name_idx ON public.ro_uats (normalized_name text_pattern_ops);
CREATE INDEX ro_uats_normalized_name_trgm_idx ON public.ro_uats USING gin (normalized_name gin_trgm_ops);
GRANT SELECT ON public.ro_uats TO authenticated;
GRANT ALL ON public.ro_uats TO service_role;
ALTER TABLE public.ro_uats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ro_uats_read" ON public.ro_uats FOR SELECT TO authenticated USING (true);

-- Localities (localitati componente, sate, sectoare)
CREATE TABLE public.ro_localities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  siruta_code integer NOT NULL UNIQUE,
  name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (public.ro_normalize_name(name)) STORED,
  type text NOT NULL,
  type_code integer NOT NULL,
  medium text,
  uat_id uuid NOT NULL REFERENCES public.ro_uats(id) ON DELETE CASCADE,
  uat_siruta_code integer NOT NULL,
  parent_siruta_code integer NOT NULL,
  county_id uuid NOT NULL REFERENCES public.ro_counties(id) ON DELETE CASCADE,
  county_siruta_code integer NOT NULL,
  postal_code text,
  latitude double precision,
  longitude double precision,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ro_localities_county_id_idx ON public.ro_localities (county_id);
CREATE INDEX ro_localities_uat_id_idx ON public.ro_localities (uat_id);
CREATE INDEX ro_localities_normalized_name_idx ON public.ro_localities (normalized_name text_pattern_ops);
CREATE INDEX ro_localities_normalized_name_trgm_idx ON public.ro_localities USING gin (normalized_name gin_trgm_ops);
CREATE INDEX ro_localities_county_normalized_idx ON public.ro_localities (county_id, normalized_name text_pattern_ops);
GRANT SELECT ON public.ro_localities TO authenticated;
GRANT ALL ON public.ro_localities TO service_role;
ALTER TABLE public.ro_localities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ro_localities_read" ON public.ro_localities FOR SELECT TO authenticated USING (true);

-- Import metadata
CREATE TABLE public.ro_nomenclature_meta (
  id text NOT NULL PRIMARY KEY,
  version text NOT NULL,
  source_url text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  counties_count integer NOT NULL DEFAULT 0,
  uats_count integer NOT NULL DEFAULT 0,
  localities_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ro_nomenclature_meta TO authenticated;
GRANT ALL ON public.ro_nomenclature_meta TO service_role;
ALTER TABLE public.ro_nomenclature_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ro_nomenclature_meta_read" ON public.ro_nomenclature_meta FOR SELECT TO authenticated USING (true);

CREATE TRIGGER t_ro_counties BEFORE UPDATE ON public.ro_counties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_ro_uats BEFORE UPDATE ON public.ro_uats FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_ro_localities BEFORE UPDATE ON public.ro_localities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_ro_nomenclature_meta BEFORE UPDATE ON public.ro_nomenclature_meta FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Properties: official SIRUTA identifiers (existing text fields kept as-is)
ALTER TABLE public.properties
  ADD COLUMN county_siruta_code integer REFERENCES public.ro_counties(siruta_code) ON DELETE SET NULL,
  ADD COLUMN uat_siruta_code integer REFERENCES public.ro_uats(siruta_code) ON DELETE SET NULL,
  ADD COLUMN locality_siruta_code integer REFERENCES public.ro_localities(siruta_code) ON DELETE SET NULL;

CREATE INDEX properties_locality_siruta_code_idx ON public.properties (locality_siruta_code);
CREATE INDEX properties_county_siruta_code_idx ON public.properties (county_siruta_code);