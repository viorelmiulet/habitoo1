-- Read-only database assertions; no users, features or property data are modified.
DO $$
DECLARE definition text;
BEGIN
  IF has_table_privilege('authenticated','public.video_narrations','INSERT') THEN
    RAISE EXCEPTION 'FAIL: direct inserts could bypass the daily quota';
  END IF;
  IF has_function_privilege('authenticated','public.reserve_video_narration(uuid,uuid,uuid,uuid,text,text,numeric,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: reservation must be service-only after authorization';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id='video-narration') THEN
    RAISE EXCEPTION 'FAIL: narration bucket must be private';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='video_narrations' AND qual LIKE '%current_org()%') THEN
    RAISE EXCEPTION 'FAIL: narration rows need organization RLS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='video_narration_audio_read' AND qual LIKE '%current_org()%') THEN
    RAISE EXCEPTION 'FAIL: audio needs organization RLS';
  END IF;
  SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE proname='reserve_video_narration';
  IF definition NOT LIKE '%FOR UPDATE%' OR definition NOT LIKE '%>=20%' OR definition NOT LIKE '%Europe/Bucharest%' THEN
    RAISE EXCEPTION 'FAIL: quota must be atomic and 20 per local calendar day';
  END IF;
END $$;