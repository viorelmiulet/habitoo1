-- ACP Stage 5: istoricul interpretărilor AI, legat strict de analiză + versiune + snapshot.
-- Cifrele deterministe rămân în acp_analyses; aici se salvează exclusiv textul AI validat.
CREATE TABLE public.acp_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.acp_analyses(id) ON DELETE CASCADE,
  root_analysis_id uuid,
  analysis_version integer NOT NULL DEFAULT 1,
  snapshot_at timestamptz,
  status text NOT NULL DEFAULT 'ok',
  provider text,
  model text,
  prompt_version text NOT NULL DEFAULT 'acp-ai-1',
  schema_version text NOT NULL DEFAULT 'acp-ai-insight-1',
  insight jsonb,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acp_ai_insights_status_chk CHECK (status IN ('ok', 'failed'))
);

CREATE INDEX acp_ai_insights_analysis_idx
  ON public.acp_ai_insights (analysis_id, created_at DESC);
CREATE INDEX acp_ai_insights_root_idx
  ON public.acp_ai_insights (root_analysis_id, analysis_version DESC, created_at DESC);
CREATE INDEX acp_ai_insights_org_idx
  ON public.acp_ai_insights (organization_id, created_at DESC);

GRANT SELECT ON public.acp_ai_insights TO authenticated;
GRANT ALL ON public.acp_ai_insights TO service_role;
ALTER TABLE public.acp_ai_insights ENABLE ROW LEVEL SECURITY;

-- Citirea urmează exact accesul la analiza-părinte (fără recursivitate RLS);
-- scrierea rămâne exclusiv server-side, prin rolul de serviciu.
CREATE POLICY "acp_ai_insights_select" ON public.acp_ai_insights FOR SELECT TO authenticated
  USING (public.can_access_acp_analysis(analysis_id));