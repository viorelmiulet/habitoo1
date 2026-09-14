-- ACP Stage 7: calibrare versionată pe date reale + setări per agenție.
-- Migrare strict aditivă: nu atinge tabelele, snapshot-urile sau rapoartele existente.

CREATE TABLE IF NOT EXISTS public.acp_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'insufficient_data',
  factor numeric NOT NULL DEFAULT 1,
  applied boolean NOT NULL DEFAULT false,
  median_ratio numeric,
  median_absolute_deviation numeric,
  bias_percent numeric,
  sample_size integer NOT NULL DEFAULT 0,
  observations_received integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  min_sample_size integer NOT NULL DEFAULT 12,
  algorithm_version text NOT NULL DEFAULT 'acp-calibration-1',
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS acp_calibrations_org_version_uidx
  ON public.acp_calibrations (organization_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS acp_calibrations_active_uidx
  ON public.acp_calibrations (organization_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS acp_calibrations_org_created_idx
  ON public.acp_calibrations (organization_id, created_at DESC);

GRANT SELECT ON public.acp_calibrations TO authenticated;
GRANT ALL ON public.acp_calibrations TO service_role;
ALTER TABLE public.acp_calibrations ENABLE ROW LEVEL SECURITY;

-- Citire doar în propria agenție; scrierea se face exclusiv server-side (service_role).
DROP POLICY IF EXISTS "acp_calibrations_select" ON public.acp_calibrations;
CREATE POLICY "acp_calibrations_select" ON public.acp_calibrations FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

-- Setări per agenție: calibrarea avansată este dezactivată implicit.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS acp_calibration_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acp_calibration_min_sample_size integer NOT NULL DEFAULT 12;
