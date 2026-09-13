-- ACP faza 2: motorul determinist de analiză. Doar coloane noi (aditiv).

ALTER TABLE public.acp_analyses
  ADD COLUMN IF NOT EXISTS comparables_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_min numeric,
  ADD COLUMN IF NOT EXISTS price_max numeric,
  ADD COLUMN IF NOT EXISTS price_average numeric,
  ADD COLUMN IF NOT EXISTS price_median numeric,
  ADD COLUMN IF NOT EXISTS price_p25 numeric,
  ADD COLUMN IF NOT EXISTS price_p75 numeric,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.acp_comparables
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'own_properties',
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS other_score numeric,
  ADD COLUMN IF NOT EXISTS component_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS adjustment_percent numeric,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS manual_override text,
  ADD COLUMN IF NOT EXISTS outlier_reason text,
  ADD COLUMN IF NOT EXISTS image_path text;

CREATE INDEX IF NOT EXISTS acp_comparables_analysis_score_idx
  ON public.acp_comparables (analysis_id, similarity_score DESC);
CREATE INDEX IF NOT EXISTS acp_comparables_source_property_idx
  ON public.acp_comparables (source_property_id);