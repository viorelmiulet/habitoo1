-- lovable-cron-fallback-reviewed: OLX offers no advert-status webhook; armed only while olx_direct listings are pending, unscheduled after drain.
CREATE OR REPLACE FUNCTION public.olx_direct_status_arm()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron' AS $$
begin
  if not exists (select 1 from cron.job where jobname = 'olx-direct-status') then
    perform cron.schedule('olx-direct-status', '*/3 * * * *', 'select public.olx_direct_status_tick()');
  end if;
end; $$;

CREATE OR REPLACE FUNCTION public.olx_direct_status_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron' AS $$
declare _pending integer;
begin
  select count(*) into _pending from public.portal_listings
   where portal = 'olx_direct' and status = 'pending' and external_id is not null;
  if _pending = 0 then
    perform cron.unschedule('olx-direct-status');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/olx-status',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-nonce', public.cron_nonce_issue('olx_status')),
    body := '{}'::jsonb);
end; $$;

REVOKE ALL ON FUNCTION public.olx_direct_status_arm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.olx_direct_status_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.olx_direct_status_arm() TO service_role;
GRANT EXECUTE ON FUNCTION public.olx_direct_status_tick() TO service_role;