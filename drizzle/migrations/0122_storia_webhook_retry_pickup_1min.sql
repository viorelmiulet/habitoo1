-- lovable-cron-fallback-reviewed: same armed-on-demand Storia retry worker; unscheduled after the queue drains.
CREATE OR REPLACE FUNCTION public.storia_webhook_retry_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
declare _pending integer; _due integer;
begin
  select count(*) into _pending from public.portal_webhook_events
   where portal = 'storia' and processed = false and signature_valid = true and attempts < 5;
  if _pending = 0 then
    perform cron.unschedule('storia-webhook-retry-worker');
    return;
  end if;
  select count(*) into _due from public.portal_webhook_events
   where portal = 'storia' and processed = false and signature_valid = true and attempts < 5
     and (
       (next_attempt_at is null and received_at <= now() - interval '1 minute')
       or next_attempt_at <= now()
     );
  if _due = 0 then return; end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/storia-webhook-retry',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('storia_webhook_retry')),
    body := '{}'::jsonb
  );
end;
$$;
REVOKE ALL ON FUNCTION public.storia_webhook_retry_tick() FROM PUBLIC, anon, authenticated;

-- Evenimentele rămase neprocesate trebuie preluate acum.
SELECT public.storia_webhook_retry_arm();