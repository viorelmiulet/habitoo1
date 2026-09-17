-- lovable-cron-fallback-reviewed: 1440 runs/day; armed only on enqueue and unscheduled after drain, so it runs only while withdrawals are pending
create table public.portal_slot_withdraw_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal_key text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  total integer not null default 0,
  done integer not null default 0,
  failed integer not null default 0,
  cancel_requested boolean not null default false,
  last_error text,
  reason text not null default 'slot_limit',
  started_by uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index portal_slot_withdraw_jobs_active_idx
  on public.portal_slot_withdraw_jobs (organization_id, status);

create table public.portal_slot_withdraw_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.portal_slot_withdraw_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal_key text not null,
  property_id uuid not null references public.properties(id) on delete cascade,
  position integer not null default 0,
  status text not null default 'queued' check (status in ('queued','done','failed','skipped')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index portal_slot_withdraw_items_job_idx
  on public.portal_slot_withdraw_items (job_id, status, position);

grant select on public.portal_slot_withdraw_jobs to authenticated;
grant select on public.portal_slot_withdraw_items to authenticated;
grant all on public.portal_slot_withdraw_jobs to service_role;
grant all on public.portal_slot_withdraw_items to service_role;

alter table public.portal_slot_withdraw_jobs enable row level security;
alter table public.portal_slot_withdraw_items enable row level security;

create policy "slot withdraw jobs readable by org admins"
  on public.portal_slot_withdraw_jobs for select to authenticated
  using (public.is_superadmin() or (organization_id = public.current_org() and public.is_org_admin()));

create policy "slot withdraw items readable by org admins"
  on public.portal_slot_withdraw_items for select to authenticated
  using (public.is_superadmin() or (organization_id = public.current_org() and public.is_org_admin()));

create or replace function public.claim_portal_slot_withdraw_job(_job_id uuid, _ttl_seconds integer)
returns setof public.portal_slot_withdraw_jobs
language sql
security definer
set search_path = public
as $$
  update public.portal_slot_withdraw_jobs
     set locked_until = now() + make_interval(secs => greatest(_ttl_seconds, 1))
   where id = _job_id
     and status in ('queued','running')
     and (locked_until is null or locked_until < now())
     and (next_attempt_at is null or next_attempt_at <= now())
  returning *;
$$;

create or replace function public.release_portal_slot_withdraw_job(_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.portal_slot_withdraw_jobs set locked_until = null where id = _job_id;
$$;

create or replace function public.portal_slot_withdraw_arm()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if not exists (select 1 from cron.job where jobname = 'portal-slot-withdraw-worker') then
    perform cron.schedule('portal-slot-withdraw-worker', '* * * * *', 'select public.portal_slot_withdraw_tick()');
  end if;
end;
$$;

create or replace function public.portal_slot_withdraw_tick()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  _pending integer;
begin
  select count(*) into _pending
    from public.portal_slot_withdraw_jobs
   where status in ('queued','running');

  if _pending = 0 then
    perform cron.unschedule('portal-slot-withdraw-worker');
    select count(*) into _pending
      from public.portal_slot_withdraw_jobs
     where status in ('queued','running');
    if _pending > 0 then
      perform public.portal_slot_withdraw_arm();
    end if;
    return;
  end if;

  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-slot-withdraw',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('portal_slot_withdraw')
    ),
    body := '{}'::jsonb
  );
end;
$$;
