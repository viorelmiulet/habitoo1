CREATE TYPE public.outreach_campaign_status AS ENUM ('draft','ready');
CREATE TABLE public.outreach_campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid NOT NULL REFERENCES public.outreach_lists(id) ON DELETE CASCADE, name text NOT NULL, subject text NOT NULL, body_text text NOT NULL, sender_name text NOT NULL DEFAULT 'Habitoo', footer_text text NOT NULL CHECK (length(btrim(footer_text)) > 0), status public.outreach_campaign_status NOT NULL DEFAULT 'draft', created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_campaigns_superadmin ON public.outreach_campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin')) WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE INDEX outreach_campaigns_list ON public.outreach_campaigns(list_id, updated_at DESC);
CREATE FUNCTION public.outreach_campaign_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER outreach_campaigns_touch BEFORE UPDATE ON public.outreach_campaigns FOR EACH ROW EXECUTE FUNCTION public.outreach_campaign_touch();
CREATE FUNCTION public.outreach_test_send_take(_campaign_id uuid, _to text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.outreach_campaigns WHERE id=_campaign_id) THEN RAISE EXCEPTION 'Campaign not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('outreach_test_send:'||auth.uid()::text,0));
 SELECT count(*) INTO c FROM public.audit_logs WHERE action='outreach.test_send' AND actor_id=auth.uid() AND created_at > now() - interval '1 hour';
 IF c >= 10 THEN RETURN false; END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(auth.uid(),'outreach.test_send','outreach_campaigns',_campaign_id,jsonb_build_object('to',lower(btrim(_to))));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.outreach_test_send_take(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_test_send_take(uuid,text) TO authenticated;