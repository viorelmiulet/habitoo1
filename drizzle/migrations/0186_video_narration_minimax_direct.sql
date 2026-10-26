ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS extra_info jsonb;
ALTER TABLE public.video_narrations DROP CONSTRAINT video_narrations_voice_check;
ALTER TABLE public.video_narrations ADD CONSTRAINT video_narrations_voice_check CHECK (voice IN ('female','male','female_youth','male_youth'));
CREATE OR REPLACE FUNCTION public.reserve_video_narration(p_org uuid,p_property uuid,p_user uuid,p_key uuid,p_text text,p_voice text,p_duration numeric,p_model text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 INSERT INTO public.ai_usage_events(organization_id,user_id,provider,model,capability,success,tokens_unknown) VALUES(p_org,p_user,CASE WHEN p_model='speech-2.8-turbo' THEN 'minimax' ELSE 'replicate' END,p_model,'ai_video_voice',false,true) RETURNING id INTO v_usage;
 INSERT INTO public.video_narrations(organization_id,property_id,created_by,request_key,text,voice,duration_sec,model,usage_event_id) VALUES(p_org,p_property,p_user,p_key,p_text,p_voice,p_duration,p_model,v_usage) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text) TO service_role;