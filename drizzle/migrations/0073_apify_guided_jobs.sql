-- Păstrează pe fiecare job criteriile ghidate și configurația efectiv executată.
-- Coloanele sunt doar jurnal; pipeline-ul de ingestie rămâne neschimbat.
alter table public.apify_runs
  add column criteria jsonb not null default '{}'::jsonb,
  add column input_snapshot jsonb not null default '{}'::jsonb,
  add column field_mapping_snapshot jsonb not null default '{}'::jsonb,
  add column max_items integer not null default 100 check (max_items between 1 and 10000),
  add column estimated_cost_usd numeric(14, 4);
