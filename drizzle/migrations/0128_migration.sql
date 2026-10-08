create or replace function public.olx_direct_refresh_tick()
returns void language plpgsql security definer set search_path to 'public','cron' as $$
declare _connected integer;
begin
  select count(*) into _connected from public.portal_connections
   where portal = 'olx_direct' and portal_credentials_encrypted is not null;
  if _connected = 0 then
    perform cron.unschedule('olx-direct-token-refresh');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/olx-token-refresh',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-nonce', public.cron_nonce_issue('olx_token_refresh')),
    body := '{}'::jsonb);
end; $$;

create or replace function public.olx_direct_refresh_arm()
returns void language plpgsql security definer set search_path to 'public','cron' as $$
begin
  if not exists (select 1 from cron.job where jobname = 'olx-direct-token-refresh') then
    perform cron.schedule('olx-direct-token-refresh', '17 3 * * *', 'select public.olx_direct_refresh_tick()');
  end if;
end; $$;

revoke all on function public.olx_direct_refresh_tick() from public, anon, authenticated;
revoke all on function public.olx_direct_refresh_arm() from public, anon, authenticated;