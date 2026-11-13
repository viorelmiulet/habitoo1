ALTER TABLE public.ai_credit_costs DROP CONSTRAINT IF EXISTS ai_credit_costs_action_check;
ALTER TABLE public.ai_credit_costs ADD CONSTRAINT ai_credit_costs_action_check CHECK (action IN ('text_fast','text_standard','marketing_image','photo_enhance','photo_video','ai_video_voice','listing_autofill','lead_message_analysis'));
INSERT INTO public.ai_credit_costs(action, credits) VALUES ('lead_message_analysis',1) ON CONFLICT (action) DO NOTHING;

CREATE TABLE public.lead_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  message_id uuid NOT NULL UNIQUE REFERENCES public.portal_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  skip_reason text,
  intent text CHECK (intent IS NULL OR intent IN ('viewing','question','negotiation','other')),
  extracted jsonb,
  proposed_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_id uuid,
  request_created boolean NOT NULL DEFAULT false,
  changes_applied_at timestamptz,
  draft text,
  draft_language text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_ai_insights TO authenticated;
GRANT ALL ON public.lead_ai_insights TO service_role;
CREATE INDEX lead_ai_insights_lead_idx ON public.lead_ai_insights(lead_id, created_at DESC);
CREATE INDEX lead_ai_insights_pending_idx ON public.lead_ai_insights(created_at) WHERE status IN ('pending','processing');
ALTER TABLE public.lead_ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_ai_insights_select ON public.lead_ai_insights FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_ai_insights.lead_id));

CREATE OR REPLACE FUNCTION public.lead_ai_claim(_limit integer DEFAULT 10)
RETURNS SETOF public.lead_ai_insights LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lead_ai_insights SET status = 'failed', updated_at = now()
   WHERE status IN ('pending','processing') AND (attempts >= 3 OR created_at <= now() - interval '2 days')
     AND (locked_until IS NULL OR locked_until < now());
  RETURN QUERY
  UPDATE public.lead_ai_insights i SET status = 'processing', attempts = i.attempts + 1,
         locked_until = now() + interval '5 minutes', updated_at = now()
   WHERE i.id IN (
     SELECT id FROM public.lead_ai_insights
      WHERE (status = 'pending' OR (status = 'processing' AND locked_until < now()))
        AND attempts < 3 AND created_at > now() - interval '2 days'
      ORDER BY created_at LIMIT greatest(1, least(_limit, 20))
      FOR UPDATE SKIP LOCKED)
  RETURNING i.*;
END $$;

CREATE OR REPLACE FUNCTION public.portal_messages_queue_lead_ai()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'in' AND NEW.lead_id IS NOT NULL AND coalesce(btrim(NEW.body), '') <> ''
     AND (TG_OP = 'INSERT' OR OLD.lead_id IS NULL) THEN
    BEGIN
      INSERT INTO public.lead_ai_insights(organization_id, lead_id, message_id)
      VALUES (NEW.organization_id, NEW.lead_id, NEW.id) ON CONFLICT (message_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'lead_ai queue skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER portal_messages_queue_lead_ai AFTER INSERT OR UPDATE OF lead_id ON public.portal_messages
  FOR EACH ROW EXECUTE FUNCTION public.portal_messages_queue_lead_ai();

REVOKE EXECUTE ON FUNCTION public.lead_ai_claim(integer), public.portal_messages_queue_lead_ai() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_claim(integer) TO service_role;