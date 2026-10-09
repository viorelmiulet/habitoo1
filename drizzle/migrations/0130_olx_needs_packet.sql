-- lovable-cron-fallback-reviewed: OLX has no status/packet webhook; every 3 min only while adverts are in moderation, hourly only while adverts wait for a packet, unscheduled when none.
ALTER TABLE public.portal_listings DROP CONSTRAINT IF EXISTS portal_listings_status_check;
ALTER TABLE public.portal_listings ADD CONSTRAINT portal_listings_status_check
  CHECK (status = ANY (ARRAY['pending','published','updated','withdrawn','error','needs_packet']));

CREATE OR REPLACE FUNCTION public.olx_direct_status_arm()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron' AS $$
declare _pending int; _packet int; _want text; _have text;
begin
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'needs_packet')
    into _pending, _packet
    from public.portal_listings
   where portal = 'olx_direct' and external_id is not null and status in ('pending','needs_packet');
  _want := case when _pending > 0 then '*/3 * * * *' when _packet > 0 then '0 * * * *' else null end;
  select schedule into _have from cron.job where jobname = 'olx-direct-status';
  if _want is null then
    if _have is not null then perform cron.unschedule('olx-direct-status'); end if;
    return;
  end if;
  if _have is distinct from _want then
    if _have is not null then perform cron.unschedule('olx-direct-status'); end if;
    perform cron.schedule('olx-direct-status', _want, 'select public.olx_direct_status_tick()');
  end if;
end; $$;

CREATE OR REPLACE FUNCTION public.olx_direct_status_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron' AS $$
begin
  if not exists (select 1 from public.portal_listings
     where portal = 'olx_direct' and external_id is not null and status in ('pending','needs_packet')) then
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