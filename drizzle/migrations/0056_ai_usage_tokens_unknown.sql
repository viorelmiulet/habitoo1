ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS tokens_unknown boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ai_usage_events_org_created_idx
  ON public.ai_usage_events (organization_id, created_at DESC);