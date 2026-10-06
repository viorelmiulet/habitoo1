-- lovable-cron-fallback-reviewed: armed only when a Storia webhook fails, unscheduled after the retry queue drains; backoff needs minute granularity.
ALTER TABLE public.portal_webhook_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

UPDATE public.portal_webhook_events SET attempts = 5 WHERE processed = false;

CREATE INDEX IF NOT EXISTS portal_webhook_events_retry_idx
  ON public.portal_webhook_events (portal, next_attempt_at)
  WHERE processed = false;

ALTER TABLE public.portal_listings
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

CREATE OR REPLACE FUNCTION public.storia_webhook_retry_arm()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
begin
  if not exists (select 1 from cron.job where jobname = 'storia-webhook-retry-worker') then
    perform cron.schedule('storia-webhook-retry-worker', '* * * * *', 'select public.storia_webhook_retry_tick()');
  end if;
end;
$$;

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
     and coalesce(next_attempt_at, received_at + interval '2 minutes') <= now();
  if _due = 0 then return; end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/storia-webhook-retry',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('storia_webhook_retry')),
    body := '{}'::jsonb
  );
end;
$$;

REVOKE ALL ON FUNCTION public.storia_webhook_retry_arm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storia_webhook_retry_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storia_webhook_retry_arm() TO service_role;

DO $$
begin
  if not exists (select 1 from cron.job where jobname = 'purge-expired-portal-messages') then
    perform cron.schedule('purge-expired-portal-messages', '17 3 * * *', 'select public.purge_expired_portal_messages()');
  end if;
end $$;