alter table public.imobiliare_locations
  add column if not exists is_hidden boolean not null default false;
create index if not exists imobiliare_locations_visible_idx
  on public.imobiliare_locations (city_normalized, depth, is_hidden);