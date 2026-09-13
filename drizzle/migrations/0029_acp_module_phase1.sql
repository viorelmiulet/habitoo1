-- ACP (Analiză Comparativă de Piață), etapa 1: infrastructura de date.
-- Pool comun de oferte de piață (market_*) + analizele per agenție (acp_*).

-- 1. Oferte de piață externe/importate (NU intră în public.properties).
CREATE TABLE public.market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_listing_id text,
  url text,
  property_type text,
  transaction_type text,
  city text,
  county text,
  district text,
  neighborhood text,
  address text,
  latitude numeric,
  longitude numeric,
  rooms numeric,
  bathrooms numeric,
  usable_area numeric,
  total_area numeric,
  floor integer,
  total_floors integer,
  construction_year integer,
  price numeric,
  currency text,
  price_per_sqm numeric,
  condition text,
  furnished boolean,
  parking boolean,
  balcony boolean,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX market_listings_source_uidx
  ON public.market_listings (source, source_listing_id)
  WHERE source_listing_id IS NOT NULL;
CREATE INDEX market_listings_source_idx ON public.market_listings (source);
CREATE INDEX market_listings_city_idx ON public.market_listings (city);
CREATE INDEX market_listings_district_idx ON public.market_listings (district);
CREATE INDEX market_listings_neighborhood_idx ON public.market_listings (neighborhood);
CREATE INDEX market_listings_property_type_idx ON public.market_listings (property_type);
CREATE INDEX market_listings_transaction_type_idx ON public.market_listings (transaction_type);
CREATE INDEX market_listings_rooms_idx ON public.market_listings (rooms);
CREATE INDEX market_listings_usable_area_idx ON public.market_listings (usable_area);
CREATE INDEX market_listings_price_idx ON public.market_listings (price);
CREATE INDEX market_listings_price_per_sqm_idx ON public.market_listings (price_per_sqm);
CREATE INDEX market_listings_status_idx ON public.market_listings (status);
CREATE INDEX market_listings_last_seen_idx ON public.market_listings (last_seen_at DESC);

-- Pool comun: citire pentru utilizatorii autentificați, scriere doar service_role
-- (importurile vor rula server-side, niciodată din browser).
GRANT SELECT ON public.market_listings TO authenticated;
GRANT ALL ON public.market_listings TO service_role;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_listings_select" ON public.market_listings FOR SELECT TO authenticated
  USING (true);

-- 2. Sursele în care apare aceeași ofertă.
CREATE TABLE public.market_listing_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_listing_id text,
  url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_listing_sources_listing_idx ON public.market_listing_sources (market_listing_id);
CREATE INDEX market_listing_sources_source_idx ON public.market_listing_sources (source, source_listing_id);

GRANT SELECT ON public.market_listing_sources TO authenticated;
GRANT ALL ON public.market_listing_sources TO service_role;
ALTER TABLE public.market_listing_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_listing_sources_select" ON public.market_listing_sources FOR SELECT TO authenticated
  USING (true);

-- 3. Entitatea reală de piață (bază pentru deduplicare).
CREATE TABLE public.market_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_address text,
  normalized_city text,
  normalized_neighborhood text,
  usable_area numeric,
  rooms numeric,
  floor integer,
  latitude numeric,
  longitude numeric,
  canonical_market_listing_id uuid REFERENCES public.market_listings(id) ON DELETE SET NULL,
  identity_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_entities_identity_hash_idx ON public.market_entities (identity_hash);
CREATE INDEX market_entities_city_idx ON public.market_entities (normalized_city);
CREATE INDEX market_entities_neighborhood_idx ON public.market_entities (normalized_neighborhood);
CREATE INDEX market_entities_geo_idx ON public.market_entities (latitude, longitude);

GRANT SELECT ON public.market_entities TO authenticated;
GRANT ALL ON public.market_entities TO service_role;
ALTER TABLE public.market_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_entities_select" ON public.market_entities FOR SELECT TO authenticated
  USING (true);

-- 4. Istoricul modificărilor unei oferte.
CREATE TABLE public.market_listing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  price numeric,
  currency text,
  price_per_sqm numeric,
  status text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_listing_snapshots_listing_idx
  ON public.market_listing_snapshots (market_listing_id, captured_at DESC);

GRANT SELECT ON public.market_listing_snapshots TO authenticated;
GRANT ALL ON public.market_listing_snapshots TO service_role;
ALTER TABLE public.market_listing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_listing_snapshots_select" ON public.market_listing_snapshots FOR SELECT TO authenticated
  USING (true);

-- 5. Analiza ACP (date proprii agenției).
CREATE TABLE public.acp_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  target_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparables_count integer NOT NULL DEFAULT 0,
  confidence_score numeric,
  estimated_min numeric,
  estimated_value numeric,
  estimated_max numeric,
  recommended_listing_price numeric,
  average_price_per_sqm numeric,
  median_price_per_sqm numeric,
  analysis_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary text,
  ai_model text,
  ai_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acp_analyses_org_idx ON public.acp_analyses (organization_id, created_at DESC);
CREATE INDEX acp_analyses_property_idx ON public.acp_analyses (property_id);
CREATE INDEX acp_analyses_status_idx ON public.acp_analyses (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acp_analyses TO authenticated;
GRANT ALL ON public.acp_analyses TO service_role;
ALTER TABLE public.acp_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acp_analyses_select" ON public.acp_analyses FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (organization_id = public.current_org() AND (created_by = auth.uid() OR public.is_org_admin()))
  );
CREATE POLICY "acp_analyses_insert" ON public.acp_analyses FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org() AND created_by = auth.uid());
CREATE POLICY "acp_analyses_update" ON public.acp_analyses FOR UPDATE TO authenticated
  USING (organization_id = public.current_org() AND (created_by = auth.uid() OR public.is_org_admin()))
  WITH CHECK (organization_id = public.current_org());
CREATE POLICY "acp_analyses_delete" ON public.acp_analyses FOR DELETE TO authenticated
  USING (organization_id = public.current_org() AND (created_by = auth.uid() OR public.is_org_admin()));

-- Acces la o analiză (folosit de tabelele copil, evită recursivitatea RLS).
CREATE OR REPLACE FUNCTION public.can_access_acp_analysis(_analysis_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.acp_analyses a
    WHERE a.id = _analysis_id
      AND (
        public.is_superadmin()
        OR (a.organization_id = public.current_org()
            AND (a.created_by = auth.uid() OR public.is_org_admin()))
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_acp_analysis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_acp_analysis(uuid) TO authenticated, service_role;

-- 6. Comparabilele selectate de motorul determinist.
CREATE TABLE public.acp_comparables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.acp_analyses(id) ON DELETE CASCADE,
  market_listing_id uuid REFERENCES public.market_listings(id) ON DELETE SET NULL,
  similarity_score numeric,
  distance_score numeric,
  area_score numeric,
  rooms_score numeric,
  location_score numeric,
  floor_score numeric,
  year_score numeric,
  condition_score numeric,
  features_score numeric,
  adjustment_amount numeric,
  adjusted_price numeric,
  adjusted_price_per_sqm numeric,
  is_selected boolean NOT NULL DEFAULT false,
  is_outlier boolean NOT NULL DEFAULT false,
  selection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acp_comparables_analysis_idx ON public.acp_comparables (analysis_id);
CREATE INDEX acp_comparables_listing_idx ON public.acp_comparables (market_listing_id);
CREATE INDEX acp_comparables_similarity_idx ON public.acp_comparables (similarity_score DESC);
CREATE INDEX acp_comparables_selected_idx ON public.acp_comparables (is_selected);
CREATE INDEX acp_comparables_outlier_idx ON public.acp_comparables (is_outlier);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acp_comparables TO authenticated;
GRANT ALL ON public.acp_comparables TO service_role;
ALTER TABLE public.acp_comparables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acp_comparables_select" ON public.acp_comparables FOR SELECT TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_comparables_insert" ON public.acp_comparables FOR INSERT TO authenticated
  WITH CHECK (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_comparables_update" ON public.acp_comparables FOR UPDATE TO authenticated
  USING (public.can_access_acp_analysis(analysis_id))
  WITH CHECK (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_comparables_delete" ON public.acp_comparables FOR DELETE TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));

-- 7. Sursele folosite într-o analiză.
CREATE TABLE public.acp_analysis_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.acp_analyses(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  items_found integer NOT NULL DEFAULT 0,
  items_used integer NOT NULL DEFAULT 0,
  items_excluded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acp_analysis_sources_analysis_idx ON public.acp_analysis_sources (analysis_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acp_analysis_sources TO authenticated;
GRANT ALL ON public.acp_analysis_sources TO service_role;
ALTER TABLE public.acp_analysis_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acp_analysis_sources_select" ON public.acp_analysis_sources FOR SELECT TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_analysis_sources_insert" ON public.acp_analysis_sources FOR INSERT TO authenticated
  WITH CHECK (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_analysis_sources_update" ON public.acp_analysis_sources FOR UPDATE TO authenticated
  USING (public.can_access_acp_analysis(analysis_id))
  WITH CHECK (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_analysis_sources_delete" ON public.acp_analysis_sources FOR DELETE TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));

-- 8. Rapoartele generate.
CREATE TABLE public.acp_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.acp_analyses(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_path text,
  generated_by uuid,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acp_reports_analysis_version_uniq UNIQUE (analysis_id, version)
);
CREATE INDEX acp_reports_analysis_version_idx ON public.acp_reports (analysis_id, version DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acp_reports TO authenticated;
GRANT ALL ON public.acp_reports TO service_role;
ALTER TABLE public.acp_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acp_reports_select" ON public.acp_reports FOR SELECT TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_reports_insert" ON public.acp_reports FOR INSERT TO authenticated
  WITH CHECK (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_reports_update" ON public.acp_reports FOR UPDATE TO authenticated
  USING (public.can_access_acp_analysis(analysis_id))
  WITH CHECK (public.can_access_acp_analysis(analysis_id));
CREATE POLICY "acp_reports_delete" ON public.acp_reports FOR DELETE TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));

-- Actualizare automată a coloanelor updated_at (funcția există deja în proiect).
CREATE TRIGGER market_listings_touch BEFORE UPDATE ON public.market_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER market_entities_touch BEFORE UPDATE ON public.market_entities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER acp_analyses_touch BEFORE UPDATE ON public.acp_analyses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();