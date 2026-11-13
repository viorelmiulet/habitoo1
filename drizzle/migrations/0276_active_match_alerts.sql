ALTER TABLE public.ai_credit_costs DROP CONSTRAINT IF EXISTS ai_credit_costs_action_check;
ALTER TABLE public.ai_credit_costs ADD CONSTRAINT ai_credit_costs_action_check CHECK (action IN ('text_fast','text_standard','marketing_image','photo_enhance','photo_video','ai_video_voice','listing_autofill','lead_message_analysis','match_message'));
INSERT INTO public.ai_credit_costs(action, credits) VALUES ('match_message',1) ON CONFLICT (action) DO NOTHING;

CREATE TABLE public.active_match_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_score integer NOT NULL DEFAULT 75 CHECK (min_score BETWEEN 50 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.active_match_settings TO authenticated;
GRANT ALL ON public.active_match_settings TO service_role;
ALTER TABLE public.active_match_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_match_settings_select ON public.active_match_settings FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE POLICY active_match_settings_insert ON public.active_match_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY active_match_settings_update ON public.active_match_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());

CREATE TABLE public.active_match_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger text NOT NULL CHECK (trigger IN ('published','price_drop','request_created')),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.active_match_queue TO service_role;
ALTER TABLE public.active_match_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX active_match_queue_pending_idx ON public.active_match_queue(created_at) WHERE status IN ('pending','processing');

CREATE TABLE public.active_match_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  agent_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  score integer NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  misses jsonb NOT NULL DEFAULT '[]'::jsonb,
  trigger text NOT NULL CHECK (trigger IN ('published','price_drop','request_created')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','sent','ignored')),
  notified_at timestamptz,
  price_drop_notified_at timestamptz,
  draft text,
  draft_is_ai boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, property_id)
);
GRANT SELECT ON public.active_match_alerts TO authenticated;
GRANT ALL ON public.active_match_alerts TO service_role;
CREATE INDEX active_match_alerts_agent_idx ON public.active_match_alerts(organization_id, agent_id, created_at DESC);
ALTER TABLE public.active_match_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_match_alerts_select ON public.active_match_alerts FOR SELECT TO authenticated
  USING (organization_id = public.current_org() AND (agent_id = auth.uid() OR public.is_org_admin()));

CREATE OR REPLACE FUNCTION public.active_match_claim(_limit integer DEFAULT 10)
RETURNS SETOF public.active_match_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.active_match_queue SET status = 'failed', updated_at = now()
   WHERE status IN ('pending','processing') AND (attempts >= 3 OR created_at <= now() - interval '2 days')
     AND (locked_until IS NULL OR locked_until < now());
  RETURN QUERY
  UPDATE public.active_match_queue q SET status = 'processing', attempts = q.attempts + 1,
         locked_until = now() + interval '5 minutes', updated_at = now()
   WHERE q.id IN (
     SELECT id FROM public.active_match_queue
      WHERE (status = 'pending' OR (status = 'processing' AND locked_until < now()))
        AND attempts < 3 AND created_at > now() - interval '2 days'
      ORDER BY created_at LIMIT greatest(1, least(_limit, 20))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END $$;

CREATE OR REPLACE FUNCTION public.properties_queue_active_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  live_now boolean := NEW.status = 'active' AND NEW.publish_status = 'published' AND NEW.deleted_at IS NULL AND NEW.archived_at IS NULL;
  live_before boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    live_before := OLD.status = 'active' AND OLD.publish_status = 'published' AND OLD.deleted_at IS NULL AND OLD.archived_at IS NULL;
  END IF;
  BEGIN
    IF live_now AND NOT live_before THEN
      INSERT INTO public.active_match_queue(organization_id, trigger, property_id) VALUES (NEW.organization_id, 'published', NEW.id);
    ELSIF live_now AND live_before AND OLD.price IS NOT NULL AND NEW.price IS NOT NULL AND OLD.price > 0
          AND NEW.price <= OLD.price * 0.97 THEN
      INSERT INTO public.active_match_queue(organization_id, trigger, property_id) VALUES (NEW.organization_id, 'price_drop', NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'active_match queue skipped: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER properties_queue_active_match AFTER INSERT OR UPDATE OF status, publish_status, price, deleted_at, archived_at ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.properties_queue_active_match();

CREATE OR REPLACE FUNCTION public.requests_queue_active_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('new','active','working') THEN
    BEGIN
      INSERT INTO public.active_match_queue(organization_id, trigger, request_id) VALUES (NEW.organization_id, 'request_created', NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'active_match queue skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER requests_queue_active_match AFTER INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.requests_queue_active_match();

REVOKE EXECUTE ON FUNCTION public.active_match_claim(integer), public.properties_queue_active_match(), public.requests_queue_active_match() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.active_match_claim(integer) TO service_role;