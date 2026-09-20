-- Apify — bazin de date de piață (doar ingestie).
-- Colectarea rulează la Apify, pe contul și tokenul clientului. Habitoo doar
-- pornește rularea manual (superadmin), mapează rezultatul și îl scrie în
-- bazinul de piață existent prin `market_listings` + `market_import_runs`.
-- Nicio programare automată: nu există câmp de interval și nu există worker.

create table public.apify_sources (
  key text primary key,
  label text not null,
  actor_id text not null,
  input jsonb not null default '{}'::jsonb,
  field_mapping jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  max_items integer not null default 100 check (max_items between 1 and 10000),
  target text not null default 'market_pool' check (target in ('market_pool', 'prospects')),
  unit_cost_usd numeric(12, 6),
  cost_note text,
  notes text,
  spend_total_usd numeric(14, 4) not null default 0,
  last_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.apify_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.apify_sources (key) on delete cascade,
  apify_run_id text,
  apify_dataset_id text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_received integer not null default 0,
  items_created integer not null default 0,
  items_updated integer not null default 0,
  items_unchanged integer not null default 0,
  items_discarded integer not null default 0,
  discard_reasons jsonb not null default '[]'::jsonb,
  cost_usd numeric(14, 4),
  usage jsonb,
  first_item jsonb,
  market_import_run_id uuid references public.market_import_runs (id) on delete set null,
  triggered_by uuid references auth.users (id) on delete set null,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index apify_runs_source_started_idx on public.apify_runs (source_key, started_at desc);

alter table public.apify_sources
  add constraint apify_sources_last_run_fk
  foreign key (last_run_id) references public.apify_runs (id) on delete set null;

grant select on public.apify_sources to authenticated;
grant all on public.apify_sources to service_role;
grant select on public.apify_runs to authenticated;
grant all on public.apify_runs to service_role;

alter table public.apify_sources enable row level security;
alter table public.apify_runs enable row level security;

create policy "apify sources readable by superadmin"
  on public.apify_sources for select to authenticated using (public.is_superadmin());

create policy "apify runs readable by superadmin"
  on public.apify_runs for select to authenticated using (public.is_superadmin());

create trigger apify_sources_touch
  before update on public.apify_sources
  for each row execute function public.touch_updated_at();