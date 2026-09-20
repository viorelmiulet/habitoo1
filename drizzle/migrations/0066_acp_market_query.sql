-- ACP — interogare live a surselor partenere pentru comparabile.
-- Nimic din răspunsul unei surse nu se stochează în afara analizei salvate:
-- tabelul de mai jos ține doar configurația surselor și contoarele de rezultat.
-- Nicio sursă nu este activată la livrare; adaptoarele se adaugă pe rând.

create table public.market_query_sources (
  key text primary key,
  label text not null,
  base_url text not null,
  enabled boolean not null default false,
  timeout_ms integer not null default 4000 check (timeout_ms between 500 and 20000),
  radius_km numeric(6, 2) not null default 5 check (radius_km > 0),
  price_band_percent integer not null default 40 check (price_band_percent between 5 and 200),
  notes text,
  answered_count integer not null default 0,
  empty_count integer not null default 0,
  timeout_count integer not null default 0,
  error_count integer not null default 0,
  last_outcome text,
  last_query_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.market_query_sources to authenticated;
grant all on public.market_query_sources to service_role;

alter table public.market_query_sources enable row level security;

create policy "market query sources readable by superadmin"
  on public.market_query_sources for select to authenticated using (public.is_superadmin());

create trigger market_query_sources_touch
  before update on public.market_query_sources
  for each row execute function public.touch_updated_at();

-- Dovada per sursă a unei analize salvate: cine a răspuns și cu ce rezultat.
alter table public.acp_analysis_sources
  add column if not exists outcome text,
  add column if not exists outcome_detail text;
