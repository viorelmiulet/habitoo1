-- Apify: destinația devine o mulțime (bazin de piață și/sau prospecți).
-- Coloana `target` rămâne, păstrată în sincron cu prima destinație, ca aplicația
-- deja publicată să continue să citească o valoare validă.
-- Deduplicare între portaluri: contorizăm rândurile unite, ca efectul să fie vizibil.

alter table public.apify_sources
  add column targets text[] not null default array['market_pool']::text[],
  add column prospect_organization_id uuid references public.organizations (id) on delete set null;

update public.apify_sources set targets = array[target]::text[];

alter table public.apify_sources
  add constraint apify_sources_targets_valid check (
    cardinality(targets) between 1 and 2
    and targets <@ array['market_pool', 'prospects']::text[]
  );

alter table public.apify_runs
  add column items_merged integer not null default 0,
  add column prospects_created integer not null default 0,
  add column prospects_updated integer not null default 0,
  add column prospects_skipped integer not null default 0;

alter table public.market_import_runs
  add column cross_portal_merges integer not null default 0;
