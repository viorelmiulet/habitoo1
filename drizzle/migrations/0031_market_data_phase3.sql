-- ACP faza 3: import, normalizare, deduplicare și istoric al ofertelor de piață.
-- Doar modificări aditive peste pool-ul comun creat în migrația 0029.

ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS normalized_city text,
  ADD COLUMN IF NOT EXISTS normalized_county text,
  ADD COLUMN IF NOT EXISTS normalized_district text,
  ADD COLUMN IF NOT EXISTS normalized_neighborhood text,
  ADD COLUMN IF NOT EXISTS normalized_address text,
  ADD COLUMN IF NOT EXISTS identity_hash text,
  ADD COLUMN IF NOT EXISTS market_entity_id uuid REFERENCES public.market_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_status text NOT NULL DEFAULT 'unique',
  ADD COLUMN IF NOT EXISTS dedupe_score numeric,
  ADD COLUMN IF NOT EXISTS dedupe_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS initial_price numeric,
  ADD COLUMN IF NOT EXISTS price_changes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_changes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disappeared_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_import_run_id uuid;

CREATE INDEX IF NOT EXISTS market_listings_entity_idx ON public.market_listings (market_entity_id);
CREATE INDEX IF NOT EXISTS market_listings_identity_hash_idx ON public.market_listings (identity_hash);
CREATE INDEX IF NOT EXISTS market_listings_dedupe_status_idx ON public.market_listings (dedupe_status);
CREATE INDEX IF NOT EXISTS market_listings_normalized_city_idx ON public.market_listings (normalized_city);

ALTER TABLE public.market_entities
  ADD COLUMN IF NOT EXISTS normalized_district text,
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS total_floors integer,
  ADD COLUMN IF NOT EXISTS construction_year integer,
  ADD COLUMN IF NOT EXISTS listing_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.market_listing_sources
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_price numeric;

ALTER TABLE public.market_listing_snapshots
  ADD COLUMN IF NOT EXISTS change_type text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS previous_price numeric,
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid;

-- Rulările de import: jurnal tehnic, vizibil doar superadminilor.
CREATE TABLE IF NOT EXISTS public.market_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  format text NOT NULL DEFAULT 'json',
  mode text NOT NULL DEFAULT 'partial',
  status text NOT NULL DEFAULT 'running',
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items_received integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  items_unchanged integer NOT NULL DEFAULT 0,
  items_invalid integer NOT NULL DEFAULT 0,
  items_deactivated integer NOT NULL DEFAULT 0,
  duplicates_detected integer NOT NULL DEFAULT 0,
  ambiguous_matches integer NOT NULL DEFAULT 0,
  price_changes integer NOT NULL DEFAULT 0,
  status_changes integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_import_runs_source_idx ON public.market_import_runs (source, started_at DESC);

GRANT SELECT ON public.market_import_runs TO authenticated;
GRANT ALL ON public.market_import_runs TO service_role;
ALTER TABLE public.market_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_import_runs_select" ON public.market_import_runs FOR SELECT TO authenticated
  USING (public.is_superadmin());

-- Potriviri ambigue de deduplicare, rezolvate manual de superadmin.
CREATE TABLE IF NOT EXISTS public.market_dedupe_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  candidate_entity_id uuid REFERENCES public.market_entities(id) ON DELETE CASCADE,
  score numeric,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS market_dedupe_reviews_pending_uidx
  ON public.market_dedupe_reviews (market_listing_id, candidate_entity_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS market_dedupe_reviews_status_idx ON public.market_dedupe_reviews (status, created_at DESC);

GRANT SELECT ON public.market_dedupe_reviews TO authenticated;
GRANT ALL ON public.market_dedupe_reviews TO service_role;
ALTER TABLE public.market_dedupe_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_dedupe_reviews_select" ON public.market_dedupe_reviews FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE TRIGGER market_import_runs_touch BEFORE UPDATE ON public.market_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();