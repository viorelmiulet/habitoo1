-- Motivul retragerii: "user" (retragere cerută de agent) vs "agency_deactivated"
-- (dezactivarea conexiunii La Cheie). Doar cele din a doua categorie se
-- retrimit automat la reactivare.
alter table public.portal_publications add column if not exists withdraw_reason text;
alter table public.portal_listings add column if not exists withdraw_reason text;

-- Jobul durabil de retrimitere a portofoliului La Cheie după reactivare.
create table public.lacheie_resend_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  write_rate integer not null default 60,
  cancel_requested boolean not null default false,
  last_error text,
  started_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Un singur job activ pe agenție.
create unique index lacheie_resend_jobs_active_per_org
  on public.lacheie_resend_jobs (organization_id)
  where status in ('queued', 'running');

create table public.lacheie_resend_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.lacheie_resend_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  external_id text,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error text,
  attempts integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, property_id)
);

create index lacheie_resend_items_job_status_idx
  on public.lacheie_resend_items (job_id, status);

grant select on public.lacheie_resend_jobs to authenticated;
grant all on public.lacheie_resend_jobs to service_role;
grant select on public.lacheie_resend_items to authenticated;
grant all on public.lacheie_resend_items to service_role;

alter table public.lacheie_resend_jobs enable row level security;
alter table public.lacheie_resend_items enable row level security;

create policy "superadmin manages lacheie resend jobs"
  on public.lacheie_resend_jobs for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy "agency admins read own lacheie resend jobs"
  on public.lacheie_resend_jobs for select to authenticated
  using (organization_id = public.current_org() and public.is_org_admin());

create policy "superadmin manages lacheie resend items"
  on public.lacheie_resend_items for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy "agency admins read own lacheie resend items"
  on public.lacheie_resend_items for select to authenticated
  using (organization_id = public.current_org() and public.is_org_admin());

create trigger lacheie_resend_jobs_touch
  before update on public.lacheie_resend_jobs
  for each row execute function public.touch_updated_at();