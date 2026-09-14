-- Stage 13: modelul de date pentru Prospecting Agent.
-- Motiv: prospectele externe, căutările, rulările și deciziile umane nu au
-- unde să fie stocate; ACP rămâne neatins. Migrare pur aditivă, RLS strict.

CREATE TABLE public.prospecting_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'feed',
  provider_key text NOT NULL,
  base_url text,
  enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospecting_sources_type_chk
    CHECK (source_type IN ('portal', 'website', 'feed', 'manual'))
);

CREATE INDEX prospecting_sources_org_idx ON public.prospecting_sources (organization_id, enabled);

CREATE TABLE public.prospecting_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  transaction_type text,
  property_type text,
  county text,
  city text,
  zone text,
  price_min numeric,
  price_max numeric,
  rooms_min integer,
  rooms_max integer,
  surface_min numeric,
  surface_max numeric,
  keywords text[] NOT NULL DEFAULT '{}',
  source_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  workflow_run_id uuid REFERENCES public.ai_workflow_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospecting_searches_status_chk
    CHECK (status IN ('draft', 'running', 'suspended', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX prospecting_searches_org_idx
  ON public.prospecting_searches (organization_id, created_at DESC);

CREATE TABLE public.prospecting_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES public.prospecting_searches(id) ON DELETE CASCADE,
  workflow_run_id uuid REFERENCES public.ai_workflow_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  items_found integer NOT NULL DEFAULT 0,
  items_normalized integer NOT NULL DEFAULT 0,
  duplicates_found integer NOT NULL DEFAULT 0,
  candidates_found integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospecting_runs_status_chk
    CHECK (status IN ('running', 'suspended', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX prospecting_runs_org_idx ON public.prospecting_runs (organization_id, created_at DESC);
CREATE INDEX prospecting_runs_search_idx ON public.prospecting_runs (search_id, created_at DESC);

CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.prospecting_sources(id) ON DELETE SET NULL,
  search_id uuid REFERENCES public.prospecting_searches(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.prospecting_runs(id) ON DELETE SET NULL,
  external_id text,
  source_url text,
  canonical_url text,
  title text NOT NULL,
  description text,
  seller_name text,
  seller_phone text,
  seller_type text NOT NULL DEFAULT 'unknown',
  seller_confidence numeric,
  transaction_type text,
  property_type text,
  county text,
  city text,
  zone text,
  address text,
  price numeric,
  currency text,
  rooms integer,
  surface_useful numeric,
  surface_built numeric,
  floor integer,
  total_floors integer,
  year_built integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  normalized_hash text NOT NULL,
  duplicate_group_id uuid,
  duplicate_of_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  opportunity_score integer NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  relevance_score integer NOT NULL DEFAULT 0,
  extraction_confidence numeric,
  status text NOT NULL DEFAULT 'new',
  imported_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  imported_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospects_seller_type_chk
    CHECK (seller_type IN ('unknown', 'private', 'agency', 'developer')),
  CONSTRAINT prospects_status_chk
    CHECK (status IN ('new', 'reviewed', 'approved', 'imported', 'rejected', 'duplicate', 'expired', 'error'))
);

CREATE UNIQUE INDEX prospects_org_source_external_uidx
  ON public.prospects (organization_id, source_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX prospects_org_normalized_uidx
  ON public.prospects (organization_id, normalized_hash);
CREATE INDEX prospects_org_status_idx
  ON public.prospects (organization_id, status, opportunity_score DESC);
CREATE INDEX prospects_run_idx ON public.prospects (run_id);
CREATE INDEX prospects_group_idx ON public.prospects (organization_id, duplicate_group_id);

CREATE TABLE public.prospect_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_reviews_decision_chk
    CHECK (decision IN ('approved', 'rejected', 'imported', 'linked'))
);

CREATE INDEX prospect_reviews_prospect_idx ON public.prospect_reviews (prospect_id, created_at DESC);

GRANT SELECT ON public.prospecting_sources TO authenticated;
GRANT ALL ON public.prospecting_sources TO service_role;
GRANT SELECT ON public.prospecting_searches TO authenticated;
GRANT ALL ON public.prospecting_searches TO service_role;
GRANT SELECT ON public.prospecting_runs TO authenticated;
GRANT ALL ON public.prospecting_runs TO service_role;
GRANT SELECT ON public.prospects TO authenticated;
GRANT ALL ON public.prospects TO service_role;
GRANT SELECT ON public.prospect_reviews TO authenticated;
GRANT ALL ON public.prospect_reviews TO service_role;

ALTER TABLE public.prospecting_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_reviews ENABLE ROW LEVEL SECURITY;

-- Scrierea rămâne exclusiv server-side (rol de serviciu). Citirea este limitată
-- la agenția curentă; sursele globale (organization_id NULL) sunt vizibile tuturor.
CREATE POLICY "prospecting_sources_select" ON public.prospecting_sources FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = public.current_org());

CREATE POLICY "prospecting_searches_select" ON public.prospecting_searches FOR SELECT TO authenticated
  USING (organization_id = public.current_org());

CREATE POLICY "prospecting_runs_select" ON public.prospecting_runs FOR SELECT TO authenticated
  USING (organization_id = public.current_org());

CREATE POLICY "prospects_select" ON public.prospects FOR SELECT TO authenticated
  USING (organization_id = public.current_org());

CREATE POLICY "prospect_reviews_select" ON public.prospect_reviews FOR SELECT TO authenticated
  USING (organization_id = public.current_org());