-- Stage 11A: fundația AI Habitoo (Mastra + Gemini).
-- Motiv: conversațiile AI, mesajele și evenimentele de utilizare nu au unde să
-- fie stocate în schema existentă. Migrare pur aditivă.

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Conversație Habitoo AI',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_user_idx
  ON public.ai_conversations (organization_id, user_id, updated_at DESC);

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  provider text,
  model text,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_chk CHECK (role IN ('user', 'assistant'))
);

CREATE INDEX ai_messages_conversation_idx
  ON public.ai_messages (conversation_id, created_at);
CREATE INDEX ai_messages_org_idx
  ON public.ai_messages (organization_id, created_at DESC);

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  capability text NOT NULL DEFAULT 'chat',
  input_tokens integer,
  output_tokens integer,
  latency_ms integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  tool_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_events_org_idx
  ON public.ai_usage_events (organization_id, created_at DESC);
CREATE INDEX ai_usage_events_user_idx
  ON public.ai_usage_events (user_id, created_at DESC);

GRANT SELECT ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
GRANT SELECT ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_select" ON public.ai_conversations FOR SELECT TO authenticated
  USING (organization_id = public.current_org() AND user_id = auth.uid());

CREATE POLICY "ai_messages_select" ON public.ai_messages FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org()
    AND EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.organization_id = public.current_org()
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_usage_events_select" ON public.ai_usage_events FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org()
    AND (user_id = auth.uid() OR public.is_org_admin())
  );
