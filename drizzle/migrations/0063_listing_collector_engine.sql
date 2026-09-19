-- lovable-cron-fallback-reviewed: 1440 runs/day; armed only while a superadmin keeps a source enabled and unschedules itself as soon as none is enabled, so it idles at zero runs
--
-- Listing collector — engine only. No source adapters, no portal network calls here.
-- Phone numbers are NEVER stored: only a keyed hash lands in
-- collector_seller_fingerprints. Images are referenced by URL only.

create table public.collector_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  base_url text not null,
  enabled boolean not null default false,
  robots_checked_at timestamptz,
  robots_body text,
  crawl_delay_ms integer not null default 5000 check (crawl_delay_ms >= 1000),
  max_pages_per_run integer not null default 20 check (max_pages_per_run between 1 and 500),
  notes text,
  locked_until timestamptz,
  last_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collector_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null references public.collector_sources(key) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','done','stopped','failed')),
  stop_reason text,
  pages_fetched integer not null default 0,
  items_found integer not null default 0,
  items_new integer not null default 0,
  items_updated integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_by uuid
);

create index collector_runs_source_idx on public.collector_runs (source, started_at desc);

create table public.collector_items (
  id uuid primary key default gen_random_uuid(),
  source text not null references public.collector_sources(key) on delete cascade,
  source_item_id text,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  normalized jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','gone')),
  listing_hash text not null,
  etag text,
  last_modified text,
  seller_fingerprint text,
  constraint collector_items_source_url_key unique (source, url)
);

create index collector_items_hash_idx on public.collector_items (source, listing_hash);
create index collector_items_seen_idx on public.collector_items (source, last_seen_at desc);

create table public.collector_seller_fingerprints (
  fingerprint text not null,
  source text not null references public.collector_sources(key) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  items_count integer not null default 0,
  inferred_type text not null default 'unknown'
    check (inferred_type in ('owner','agency','unknown')),
  signals jsonb not null default '{}'::jsonb,
  primary key (source, fingerprint)
);

-- Raw collector data is superadmin-only; service_role does the writing.
grant select on public.collector_sources to authenticated;
grant select on public.collector_runs to authenticated;
grant select on public.collector_items to authenticated;
grant select on public.collector_seller_fingerprints to authenticated;
grant all on public.collector_sources to service_role;
grant all on public.collector_runs to service_role;
grant all on public.collector_items to service_role;
grant all on public.collector_seller_fingerprints to service_role;

alter table public.collector_sources enable row level security;
alter table public.collector_runs enable row level security;
alter table public.collector_items enable row level security;
alter table public.collector_seller_fingerprints enable row level security;

create policy "collector sources readable by superadmin"
  on public.collector_sources for select to authenticated using (public.is_superadmin());
create policy "collector runs readable by superadmin"
  on public.collector_runs for select to authenticated using (public.is_superadmin());
create policy "collector items readable by superadmin"
  on public.collector_items for select to authenticated using (public.is_superadmin());
create policy "collector fingerprints readable by superadmin"
  on public.collector_seller_fingerprints for select to authenticated using (public.is_superadmin());

create trigger collector_sources_touch
  before update on public.collector_sources
  for each row execute function public.touch_updated_at();

create or replace function public.claim_collector_source(_key text, _ttl_seconds integer)
returns setof public.collector_sources
language sql
security definer
set search_path = public
as $$
  update public.collector_sources
     set locked_until = now() + make_interval(secs => greatest(_ttl_seconds, 1))
   where key = _key
     and enabled = true
     and (locked_until is null or locked_until < now())
  returning *;
$$;

create or replace function public.release_collector_source(_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.collector_sources set locked_until = null where key = _key;
$$;

revoke all on function public.claim_collector_source(text, integer) from public;
revoke all on function public.release_collector_source(text) from public;
grant execute on function public.claim_collector_source(text, integer) to service_role;
grant execute on function public.release_collector_source(text) to service_role;

create or replace function public.collector_arm()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if not exists (select 1 from cron.job where jobname = 'listing-collector-worker') then
    perform cron.schedule('listing-collector-worker', '* * * * *', 'select public.collector_tick()');
  end if;
end;
$$;

create or replace function public.collector_tick()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  _enabled integer;
begin
  select count(*) into _enabled from public.collector_sources where enabled = true;

  -- Nimic nu rulează automat până când un superadmin activează o sursă.
  if _enabled = 0 then
    perform cron.unschedule('listing-collector-worker');
    select count(*) into _enabled from public.collector_sources where enabled = true;
    if _enabled > 0 then
      perform public.collector_arm();
    end if;
    return;
  end if;

  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/listing-collector',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('listing_collector')
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.collector_arm() from public;
revoke all on function public.collector_tick() from public;
grant execute on function public.collector_arm() to service_role;
grant execute on function public.collector_tick() to service_role;