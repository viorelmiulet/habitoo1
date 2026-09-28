-- lovable-cron-fallback-reviewed: 1440 runs/day max; armed only on enqueue and unscheduled after drain, so it runs only while status withdrawals are pending
create table public.portal_status_withdraw_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  portal_key text not null,
  reason text not null check (reason in ('status_sold','status_rented','archived')),
  status text not null default 'queued' check (status in ('queued','running','done','failed','manual_required','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  message text,
  requested_by uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index portal_status_withdraw_items_pending_idx
  on public.portal_status_withdraw_items (status, next_attempt_at);
create index portal_status_withdraw_items_property_idx
  on public.portal_status_withdraw_items (property_id, portal_key, created_at desc);

grant select on public.portal_status_withdraw_items to authenticated;
grant all on public.portal_status_withdraw_items to service_role;

alter table public.portal_status_withdraw_items enable row level security;

create policy "status withdraw items readable by org"
  on public.portal_status_withdraw_items for select to authenticated
  using (public.is_superadmin() or organization_id = public.current_org());

create or replace function public.claim_portal_status_withdraw_item(_item_id uuid, _ttl_seconds integer)
returns setof public.portal_status_withdraw_items
language sql
security definer
set search_path = public
as $$
  update public.portal_status_withdraw_items
     set locked_until = now() + make_interval(secs => greatest(_ttl_seconds, 1)),
         status = 'running'
   where id = _item_id
     and status in ('queued','running')
     and (locked_until is null or locked_until < now())
     and (next_attempt_at is null or next_attempt_at <= now())
  returning *;
$$;

create or replace function public.portal_status_withdraw_arm()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if not exists (select 1 from cron.job where jobname = 'portal-status-withdraw-worker') then
    perform cron.schedule('portal-status-withdraw-worker', '* * * * *', 'select public.portal_status_withdraw_tick()');
  end if;
end;
$$;

create or replace function public.portal_status_withdraw_tick()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  _pending integer;
begin
  select count(*) into _pending
    from public.portal_status_withdraw_items
   where status in ('queued','running');

  if _pending = 0 then
    perform cron.unschedule('portal-status-withdraw-worker');
    select count(*) into _pending
      from public.portal_status_withdraw_items
     where status in ('queued','running');
    if _pending > 0 then
      perform public.portal_status_withdraw_arm();
    end if;
    return;
  end if;

  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-status-withdraw',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('portal_status_withdraw')
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.claim_portal_status_withdraw_item(uuid, integer) from public, anon, authenticated;
revoke execute on function public.portal_status_withdraw_arm() from public, anon, authenticated;
revoke execute on function public.portal_status_withdraw_tick() from public, anon, authenticated;
grant execute on function public.claim_portal_status_withdraw_item(uuid, integer) to service_role;
grant execute on function public.portal_status_withdraw_arm() to service_role;
grant execute on function public.portal_status_withdraw_tick() to service_role;
