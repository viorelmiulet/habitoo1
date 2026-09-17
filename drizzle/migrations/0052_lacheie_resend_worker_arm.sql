-- lovable-cron-fallback-reviewed: 1440 runs/day; per-minute pacing matches La Cheie's 60 writes/min limit, armed only while a resend job is queued and unscheduled on drain
CREATE OR REPLACE FUNCTION public.lacheie_resend_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  _pending integer;
BEGIN
  SELECT count(*) INTO _pending
    FROM public.lacheie_resend_jobs
   WHERE status IN ('queued', 'running');

  IF _pending = 0 THEN
    PERFORM cron.unschedule('lacheie-resend-worker');
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/lacheie-resend',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('lacheie_resend')
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lacheie_resend_arm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lacheie-resend-worker') THEN
    PERFORM cron.schedule('lacheie-resend-worker', '* * * * *', 'select public.lacheie_resend_tick()');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lacheie_resend_arm() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lacheie_resend_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lacheie_resend_arm() TO service_role;
GRANT EXECUTE ON FUNCTION public.lacheie_resend_tick() TO service_role;