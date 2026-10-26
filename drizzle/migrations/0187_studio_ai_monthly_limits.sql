ALTER TABLE public.organizations ADD COLUMN ai_media_image_limit integer NOT NULL DEFAULT 50 CHECK (ai_media_image_limit >= 0), ADD COLUMN ai_media_enhance_limit integer NOT NULL DEFAULT 30 CHECK (ai_media_enhance_limit >= 0), ADD COLUMN ai_media_video_limit integer NOT NULL DEFAULT 10 CHECK (ai_media_video_limit >= 0);
ALTER TABLE public.ai_media_generations ADD COLUMN deleted_at timestamptz;
CREATE INDEX ai_media_monthly_count_idx ON public.ai_media_generations(organization_id, kind, created_at) WHERE status IN ('running','succeeded');
CREATE OR REPLACE FUNCTION public.guard_ai_media_limits_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF (NEW.ai_media_image_limit IS DISTINCT FROM OLD.ai_media_image_limit OR NEW.ai_media_enhance_limit IS DISTINCT FROM OLD.ai_media_enhance_limit OR NEW.ai_media_video_limit IS DISTINCT FROM OLD.ai_media_video_limit) AND NOT public.is_superadmin() AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Doar SuperAdmin poate schimba limitele Studio AI.' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_ai_media_limits_settings BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_ai_media_limits_settings();
CREATE OR REPLACE FUNCTION public.guard_ai_media_monthly_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.organizations; start_month timestamptz; next_month timestamptz; cap integer; used integer; pending integer;
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
 SELECT * INTO o FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agenția nu există.'; END IF;
 start_month := date_trunc('month',now() AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest';
 next_month := (date_trunc('month',now() AT TIME ZONE 'Europe/Bucharest') + interval '1 month') AT TIME ZONE 'Europe/Bucharest';
 cap := CASE NEW.kind WHEN 'marketing_image' THEN o.ai_media_image_limit WHEN 'photo_enhance' THEN o.ai_media_enhance_limit WHEN 'photo_video' THEN o.ai_media_video_limit ELSE 0 END;
 SELECT count(*) FILTER (WHERE status='succeeded'),count(*) FILTER (WHERE status='running') INTO used,pending FROM public.ai_media_generations WHERE organization_id=NEW.organization_id AND kind=NEW.kind AND created_at>=start_month AND created_at<next_month AND status IN ('succeeded','running');
 IF used+pending >= cap THEN RAISE EXCEPTION 'ai_media_limit:%:%:%:%:%', NEW.kind,cap,next_month,used,pending USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_ai_media_monthly_quota BEFORE INSERT OR UPDATE OR DELETE ON public.ai_media_generations FOR EACH ROW EXECUTE FUNCTION public.guard_ai_media_monthly_quota();
CREATE OR REPLACE FUNCTION public.ai_media_monthly_usage() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.current_org(); o public.organizations; start_month timestamptz; next_month timestamptz; counts jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Contul tău nu este legat de o agenție.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.organizations WHERE id=org;
 start_month := date_trunc('month',now() AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest';
 next_month := (date_trunc('month',now() AT TIME ZONE 'Europe/Bucharest')+interval '1 month') AT TIME ZONE 'Europe/Bucharest';
 SELECT coalesce(jsonb_object_agg(kind,n),'{}'::jsonb) INTO counts FROM (SELECT kind,count(*) AS n FROM public.ai_media_generations WHERE organization_id=org AND created_at>=start_month AND created_at<next_month AND status='succeeded' GROUP BY kind) c;
 RETURN jsonb_build_object('used',jsonb_build_object('marketing_image',coalesce(counts->'marketing_image','0'::jsonb),'photo_enhance',coalesce(counts->'photo_enhance','0'::jsonb),'photo_video',coalesce(counts->'photo_video','0'::jsonb)), 'limits',jsonb_build_object('marketing_image',o.ai_media_image_limit,'photo_enhance',o.ai_media_enhance_limit,'photo_video',o.ai_media_video_limit),'resetAt',next_month);
END $$;
REVOKE ALL ON FUNCTION public.ai_media_monthly_usage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_media_monthly_usage() TO authenticated;
REVOKE ALL ON FUNCTION public.guard_ai_media_monthly_quota(),public.guard_ai_media_limits_settings() FROM PUBLIC,anon,authenticated;