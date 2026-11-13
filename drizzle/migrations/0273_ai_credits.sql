-- AI3: AI on by default per agency, monthly AI credits per plan.
ALTER TABLE public.organizations ALTER COLUMN ai_enabled SET DEFAULT true;
UPDATE public.organizations o SET ai_enabled = true
 WHERE o.ai_enabled = false
   AND coalesce((SELECT a.action FROM public.audit_logs a WHERE a.organization_id = o.id AND a.action IN ('organization.ai_enabled','organization.ai_disabled') ORDER BY a.created_at DESC LIMIT 1), '') <> 'organization.ai_disabled';

CREATE OR REPLACE FUNCTION public.guard_org_ai_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_superadmin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.ai_enabled := true;
    ELSIF NEW.ai_enabled IS DISTINCT FROM OLD.ai_enabled THEN
      RAISE EXCEPTION 'Doar administratorul platformei poate activa sau dezactiva funcțiile AI.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.organizations ADD COLUMN ai_bonus_credits integer NOT NULL DEFAULT 0 CHECK (ai_bonus_credits >= 0);
COMMENT ON COLUMN public.organizations.ai_media_image_limit IS 'DEPRECATED: replaced by AI credits (ai_credit_ledger)';
COMMENT ON COLUMN public.organizations.ai_media_enhance_limit IS 'DEPRECATED: replaced by AI credits (ai_credit_ledger)';
COMMENT ON COLUMN public.organizations.ai_media_video_limit IS 'DEPRECATED: replaced by AI credits (ai_credit_ledger)';

CREATE OR REPLACE FUNCTION public.guard_ai_credit_bonus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.ai_bonus_credits IS DISTINCT FROM OLD.ai_bonus_credits AND NOT public.is_superadmin() AND coalesce(auth.role(),'') <> 'service_role' THEN
  RAISE EXCEPTION 'Doar SuperAdmin poate schimba creditele AI bonus.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_ai_credit_bonus BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_ai_credit_bonus();

CREATE TABLE public.ai_credit_plans (
  plan text PRIMARY KEY CHECK (plan IN ('basic','pro','unlimited')),
  monthly_credits integer NOT NULL CHECK (monthly_credits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.ai_credit_plans TO authenticated;
GRANT ALL ON public.ai_credit_plans TO service_role;
ALTER TABLE public.ai_credit_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_credit_plans_read ON public.ai_credit_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_credit_plans_superadmin_insert ON public.ai_credit_plans FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
CREATE POLICY ai_credit_plans_superadmin_update ON public.ai_credit_plans FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
INSERT INTO public.ai_credit_plans(plan, monthly_credits) VALUES ('basic',300),('pro',1500),('unlimited',6000) ON CONFLICT (plan) DO NOTHING;

CREATE TABLE public.ai_credit_costs (
  action text PRIMARY KEY CHECK (action IN ('text_fast','text_standard','marketing_image','photo_enhance','photo_video','ai_video_voice')),
  credits integer NOT NULL CHECK (credits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.ai_credit_costs TO authenticated;
GRANT ALL ON public.ai_credit_costs TO service_role;
ALTER TABLE public.ai_credit_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_credit_costs_read ON public.ai_credit_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_credit_costs_superadmin_insert ON public.ai_credit_costs FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
CREATE POLICY ai_credit_costs_superadmin_update ON public.ai_credit_costs FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
INSERT INTO public.ai_credit_costs(action, credits) VALUES ('text_fast',1),('text_standard',2),('marketing_image',10),('photo_enhance',10),('photo_video',40),('ai_video_voice',5) ON CONFLICT (action) DO NOTHING;

CREATE TABLE public.ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  credits integer NOT NULL CHECK (credits >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','consumed','refunded')),
  month_start date NOT NULL,
  ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX ai_credit_ledger_org_month_idx ON public.ai_credit_ledger(organization_id, month_start);
CREATE UNIQUE INDEX ai_credit_ledger_ref_idx ON public.ai_credit_ledger(ref) WHERE ref IS NOT NULL;
GRANT SELECT ON public.ai_credit_ledger TO authenticated;
GRANT ALL ON public.ai_credit_ledger TO service_role;
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_credit_ledger_read ON public.ai_credit_ledger FOR SELECT TO authenticated USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE OR REPLACE FUNCTION public.ai_credit_month(p_at timestamptz DEFAULT now()) RETURNS date LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT date_trunc('month', p_at AT TIME ZONE 'Europe/Bucharest')::date
$$;

CREATE OR REPLACE FUNCTION public.ai_credit_limit(p_org uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT p.monthly_credits FROM public.ai_credit_plans p WHERE p.plan = coalesce(o.plan,'basic')), 0) + o.ai_bonus_credits
 FROM public.organizations o WHERE o.id = p_org
$$;

-- Active consumption: consumed rows plus reservations still in flight (stale ones expire after 2 hours).
CREATE OR REPLACE FUNCTION public.ai_credit_used(p_org uuid, p_month date) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(sum(credits),0)::int FROM public.ai_credit_ledger
 WHERE organization_id = p_org AND month_start = p_month
   AND (status = 'consumed' OR (status = 'reserved' AND created_at > now() - interval '2 hours'))
$$;

CREATE OR REPLACE FUNCTION public.ai_credit_reserve(p_org uuid, p_user uuid, p_action text, p_ref text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_cost integer; v_limit integer; v_used integer; v_month date := public.ai_credit_month(now()); v_id uuid;
BEGIN
 SELECT status::text INTO v_status FROM public.organizations WHERE id = p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agenția nu există.'; END IF;
 IF v_status IN ('suspended','cancelled') THEN RAISE EXCEPTION 'Agenția nu este activă.' USING ERRCODE='42501'; END IF;
 SELECT credits INTO v_cost FROM public.ai_credit_costs WHERE action = p_action;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acțiune AI necunoscută.'; END IF;
 v_limit := public.ai_credit_limit(p_org);
 v_used := public.ai_credit_used(p_org, v_month);
 IF v_cost > 0 AND v_used + v_cost > v_limit THEN
  RAISE EXCEPTION 'ai_credits_exhausted:%:%:%', v_used, v_limit, to_char((v_month + interval '1 month')::date,'YYYY-MM-DD') USING ERRCODE='P0001';
 END IF;
 INSERT INTO public.ai_credit_ledger(organization_id,user_id,action,credits,month_start,ref) VALUES (p_org,p_user,p_action,v_cost,v_month,p_ref) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_settle(p_id uuid, p_success boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.ai_credit_ledger SET status = CASE WHEN p_success THEN 'consumed' ELSE 'refunded' END, settled_at = now()
 WHERE id = p_id AND status = 'reserved'
$$;

CREATE OR REPLACE FUNCTION public.ai_credit_settle_ref(p_ref text, p_success boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.ai_credit_ledger SET status = CASE WHEN p_success THEN 'consumed' ELSE 'refunded' END, settled_at = now()
 WHERE ref = p_ref AND status = 'reserved'
$$;

CREATE OR REPLACE FUNCTION public.ai_credit_usage(p_org uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid := coalesce(p_org, public.current_org()); v_month date := public.ai_credit_month(now()); o public.organizations; v_by jsonb;
BEGIN
 IF v_org IS NULL THEN RAISE EXCEPTION 'Contul tău nu este legat de o agenție.' USING ERRCODE='42501'; END IF;
 IF coalesce(auth.role(),'') <> 'service_role' AND NOT public.is_superadmin() AND v_org IS DISTINCT FROM public.current_org() THEN
  RAISE EXCEPTION 'Nu ai acces la creditele acestei agenții.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO o FROM public.organizations WHERE id = v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agenția nu există.'; END IF;
 SELECT coalesce(jsonb_object_agg(action, total), '{}'::jsonb) INTO v_by FROM (
  SELECT action, sum(credits)::int total FROM public.ai_credit_ledger
  WHERE organization_id = v_org AND month_start = v_month
    AND (status = 'consumed' OR (status = 'reserved' AND created_at > now() - interval '2 hours'))
  GROUP BY action) s;
 RETURN jsonb_build_object(
  'used', public.ai_credit_used(v_org, v_month),
  'limit', public.ai_credit_limit(v_org),
  'plan', coalesce(o.plan,'basic'),
  'bonus', o.ai_bonus_credits,
  'monthStart', to_char(v_month,'YYYY-MM-DD'),
  'resetOn', to_char((v_month + interval '1 month')::date,'YYYY-MM-DD'),
  'byAction', v_by);
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_usage_all() RETURNS TABLE(organization_id uuid, organization_name text, plan text, bonus integer, used integer, credit_limit integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_superadmin() AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Doar SuperAdmin.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.id, o.name::text, coalesce(o.plan,'basic')::text, o.ai_bonus_credits, public.ai_credit_used(o.id, public.ai_credit_month(now())), public.ai_credit_limit(o.id)
 FROM public.organizations o ORDER BY o.name;
END $$;

REVOKE ALL ON FUNCTION public.ai_credit_reserve(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_settle(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_settle_ref(text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_usage_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_credit_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_credit_reserve(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_credit_settle(uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_credit_settle_ref(text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_credit_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_credit_usage_all() TO authenticated, service_role;

-- Studio AI: credits replace the per-kind monthly limits; immutability guards are kept.
CREATE OR REPLACE FUNCTION public.guard_ai_media_monthly_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status IN ('running','succeeded') THEN RAISE EXCEPTION 'Arhivează rezultatul pentru a păstra consumul lunar.'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Datele de consum ale generării nu pot fi schimbate.' USING ERRCODE='42501'; END IF;
  IF OLD.status='succeeded' AND NEW.status <> 'succeeded' THEN RAISE EXCEPTION 'Consumul unei generări finalizate nu poate fi anulat.'; END IF;
  IF OLD.status='failed' AND NEW.status <> 'failed' THEN RAISE EXCEPTION 'Pornește o generare nouă.'; END IF;
  RETURN NEW;
 END IF;
 NEW.created_at := now();
 IF NEW.status <> 'running' THEN RAISE EXCEPTION 'O generare nouă trebuie rezervată înainte de pornire.'; END IF;
 PERFORM public.ai_credit_reserve(NEW.organization_id, NEW.created_by, NEW.kind, 'media:' || NEW.id::text);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_settle_on_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.status = 'running' AND NEW.status IN ('succeeded','failed') THEN
  PERFORM public.ai_credit_settle_ref(TG_ARGV[0] || NEW.id::text, NEW.status = 'succeeded');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_media_credit_settle AFTER UPDATE OF status ON public.ai_media_generations FOR EACH ROW EXECUTE FUNCTION public.ai_credit_settle_on_status('media:');
CREATE TRIGGER video_narration_credit_settle AFTER UPDATE OF status ON public.video_narrations FOR EACH ROW EXECUTE FUNCTION public.ai_credit_settle_on_status('voice:');

-- Voice: features are on unless explicitly switched off; credits reserved with the narration.
CREATE OR REPLACE FUNCTION public.reserve_video_narration(p_org uuid,p_property uuid,p_user uuid,p_key uuid,p_text text,p_voice text,p_duration numeric,p_model text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_usage uuid; v_day timestamptz;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=p_org AND ai_enabled=true FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.organization_ai_features WHERE organization_id=p_org AND feature_key='ai_video_voice' AND enabled=false) THEN RAISE EXCEPTION 'Voce AI în video nu este activată pentru agenția ta.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND organization_id=p_org) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property AND organization_id=p_org AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Proprietatea nu este disponibilă.'; END IF;
 SELECT id INTO v_id FROM public.video_narrations WHERE request_key=p_key AND organization_id=p_org AND created_by=p_user;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 IF p_duration<6 OR p_duration>60 OR btrim(p_text)='' OR length(p_text)>4000 OR cardinality(regexp_split_to_array(btrim(p_text),'\s+'))>floor(p_duration*2.3) THEN RAISE EXCEPTION 'Textul depășește limita pentru durata clipului.'; END IF;
 v_day := date_trunc('day',now() AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest';
 IF (SELECT count(*) FROM public.video_narrations WHERE organization_id=p_org AND created_at>=v_day)>=20 THEN RAISE EXCEPTION 'Agenția a atins limita de 20 de generări de voce pe zi.'; END IF;
 INSERT INTO public.ai_usage_events(organization_id,user_id,provider,model,capability,success,tokens_unknown) VALUES(p_org,p_user,'gemini',p_model,'ai_video_voice',false,true) RETURNING id INTO v_usage;
 INSERT INTO public.video_narrations(organization_id,property_id,created_by,request_key,text,voice,duration_sec,model,usage_event_id) VALUES(p_org,p_property,p_user,p_key,p_text,p_voice,p_duration,p_model,v_usage) RETURNING id INTO v_id;
 PERFORM public.ai_credit_reserve(p_org, p_user, 'ai_video_voice', 'voice:' || v_id::text);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text) TO service_role;