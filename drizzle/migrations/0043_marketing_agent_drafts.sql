CREATE TABLE public.marketing_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  channel TEXT NOT NULL,
  content_type TEXT NOT NULL,
  tone TEXT NOT NULL,
  length TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  short_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta TEXT,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_status TEXT NOT NULL DEFAULT 'valid',
  validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT,
  model TEXT,
  workflow_run_id UUID REFERENCES public.ai_workflow_runs(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_drafts_validation_status_check
    CHECK (validation_status IN ('valid', 'invalid', 'warning')),
  CONSTRAINT marketing_drafts_version_check CHECK (version >= 1),
  CONSTRAINT marketing_drafts_unique_version
    UNIQUE (property_id, channel, content_type, version)
);

CREATE INDEX marketing_drafts_org_property_idx
  ON public.marketing_drafts (organization_id, property_id, created_at DESC);
CREATE INDEX marketing_drafts_run_idx ON public.marketing_drafts (workflow_run_id);

GRANT SELECT ON public.marketing_drafts TO authenticated;
GRANT ALL ON public.marketing_drafts TO service_role;

ALTER TABLE public.marketing_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own agency marketing drafts"
  ON public.marketing_drafts FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE TRIGGER marketing_drafts_touch_updated_at
  BEFORE UPDATE ON public.marketing_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();