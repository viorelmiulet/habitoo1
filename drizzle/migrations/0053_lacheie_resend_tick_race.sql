-- lovable-cron-fallback-reviewed: worker armed only while a resend job is queued, unscheduled on drain
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

    -- Re-check after unscheduling: a job inserted in between must not be orphaned.
    SELECT count(*) INTO _pending
      FROM public.lacheie_resend_jobs
     WHERE status IN ('queued', 'running');
    IF _pending > 0 THEN
      PERFORM public.lacheie_resend_arm();
    END IF;
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

REVOKE ALL ON FUNCTION public.lacheie_resend_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lacheie_resend_tick() TO service_role;