-- Stage 11: state persistent pentru workflow-urile Mastra + tracing AI.
-- Motiv: suspend/resume și human approval au nevoie de state care supraviețuiește
-- restartului serverului (backendul rulează serverless, fără proces permanent),
-- iar trasabilitatea pas-cu-pas nu are unde să fie stocată. Migrare pur aditivă.

CREATE TABLE public.ai_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  workflow text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  current_step text NOT NULL DEFAULT 'authenticate',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_approval jsonb,
  result jsonb,
  error_message text,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  trace_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_workflow_runs_status_chk
    CHECK (status IN ('running', 'suspended', 'completed', 'failed'))
);

CREATE INDEX ai_workflow_runs_user_idx
  ON public.ai_workflow_runs (organization_id, user_id, created_at DESC);
CREATE INDEX ai_workflow_runs_status_idx
  ON public.ai_workflow_runs (organization_id, status, updated_at DESC);

CREATE TABLE public.ai_trace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  trace_id uuid NOT NULL,
  run_id uuid REFERENCES public.ai_workflow_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  latency_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_trace_events_kind_chk
    CHECK (kind IN ('agent', 'workflow', 'step', 'tool', 'model', 'error'))
);

CREATE INDEX ai_trace_events_trace_idx ON public.ai_trace_events (trace_id, created_at);
CREATE INDEX ai_trace_events_org_idx ON public.ai_trace_events (organization_id, created_at DESC);

GRANT SELECT ON public.ai_workflow_runs TO authenticated;
GRANT ALL ON public.ai_workflow_runs TO service_role;
GRANT SELECT ON public.ai_trace_events TO authenticated;
GRANT ALL ON public.ai_trace_events TO service_role;

ALTER TABLE public.ai_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trace_events ENABLE ROW LEVEL SECURITY;

-- Scrierea rămâne exclusiv server-side (rol de serviciu); citirea este strict
-- limitată la agenția curentă, iar rulările la utilizatorul lor.
CREATE POLICY "ai_workflow_runs_select" ON public.ai_workflow_runs FOR SELECT TO authenticated
  USING (organization_id = public.current_org() AND (user_id = auth.uid() OR public.is_org_admin()));

CREATE POLICY "ai_trace_events_select" ON public.ai_trace_events FOR SELECT TO authenticated
  USING (organization_id = public.current_org() AND (user_id = auth.uid() OR public.is_org_admin()));