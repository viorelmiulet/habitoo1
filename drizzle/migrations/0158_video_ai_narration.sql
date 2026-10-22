CREATE TABLE public.video_narrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), property_id uuid NOT NULL REFERENCES public.properties(id), created_by uuid NOT NULL,
 request_key uuid NOT NULL UNIQUE, text text NOT NULL, voice text NOT NULL CHECK(voice IN ('female','male')), duration_sec numeric NOT NULL CHECK(duration_sec BETWEEN 6 AND 60),
 model text NOT NULL, prediction_id text, storage_path text, status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','succeeded','failed')), error text,
 usage_event_id uuid REFERENCES public.ai_usage_events(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.video_narrations TO authenticated;
GRANT ALL ON public.video_narrations TO service_role;
ALTER TABLE public.video_narrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY video_narrations_read ON public.video_narrations FOR SELECT TO authenticated USING (organization_id=public.current_org() AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id=property_id AND p.organization_id=public.current_org()));
CREATE INDEX video_narrations_daily ON public.video_narrations(organization_id,created_at);
CREATE POLICY video_narration_audio_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='video-narration' AND (storage.foldername(name))[1]=public.current_org()::text AND EXISTS(SELECT 1 FROM public.video_narrations n WHERE n.storage_path=name AND n.organization_id=public.current_org()));
CREATE FUNCTION public.reserve_video_narration(p_org uuid,p_property uuid,p_user uuid,p_key uuid,p_text text,p_voice text,p_duration numeric,p_model text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_usage uuid; v_day timestamptz;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=p_org AND ai_enabled=true FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.organization_ai_features WHERE organization_id=p_org AND feature_key='ai_video_voice' AND enabled=true) THEN RAISE EXCEPTION 'Voce AI în video nu este activată pentru agenția ta.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND organization_id=p_org) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property AND organization_id=p_org AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Proprietatea nu este disponibilă.'; END IF;
 SELECT id INTO v_id FROM public.video_narrations WHERE request_key=p_key AND organization_id=p_org AND created_by=p_user;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 IF p_duration<6 OR p_duration>60 OR btrim(p_text)='' OR length(p_text)>4000 OR cardinality(regexp_split_to_array(btrim(p_text),'\s+'))>floor(p_duration*2.3) THEN RAISE EXCEPTION 'Textul depășește limita pentru durata clipului.'; END IF;
 v_day := date_trunc('day',now() AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest';
 IF (SELECT count(*) FROM public.video_narrations WHERE organization_id=p_org AND created_at>=v_day)>=20 THEN RAISE EXCEPTION 'Agenția a atins limita de 20 de generări de voce pe zi.'; END IF;
 INSERT INTO public.ai_usage_events(organization_id,user_id,provider,model,capability,success,tokens_unknown) VALUES(p_org,p_user,'replicate',p_model,'ai_video_voice',false,true) RETURNING id INTO v_usage;
 INSERT INTO public.video_narrations(organization_id,property_id,created_by,request_key,text,voice,duration_sec,model,usage_event_id) VALUES(p_org,p_property,p_user,p_key,p_text,p_voice,p_duration,p_model,v_usage) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text) TO service_role;