-- lovable-cron-fallback-reviewed: VDI lead worker runs every 5 minutes only while a VDI connection has a key or VDI lead events await retry; it unschedules itself otherwise.
ALTER TABLE public.portal_webhook_events ADD COLUMN IF NOT EXISTS external_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS portal_webhook_events_external_key
  ON public.portal_webhook_events (portal, external_event_id) WHERE external_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vdi_leads_arm()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
begin
  if not exists (select 1 from cron.job where jobname = 'vdi-leads-worker') then
    perform cron.schedule('vdi-leads-worker', '*/5 * * * *', 'select public.vdi_leads_tick()');
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.vdi_leads_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
declare _pending integer; _keyed integer;
begin
  select count(*) into _pending from public.portal_webhook_events
   where portal = 'vdi' and processed = false and signature_valid = true and attempts < 5;
  select count(*) into _keyed from public.portal_connections
   where portal = 'vdi' and activated = true and portal_credentials_encrypted is not null;
  if _pending = 0 and _keyed = 0 then
    perform cron.unschedule('vdi-leads-worker');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/vdi-leads',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('vdi_leads')),
    body := '{}'::jsonb
  );
end;
$$;

REVOKE ALL ON FUNCTION public.vdi_leads_arm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vdi_leads_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vdi_leads_arm() TO service_role;