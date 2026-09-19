-- Configurația unei surse (lista de orașe, pagini per oraș) stă în date, nu în cod.
alter table public.collector_sources
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Sursa OLX, OPRITĂ implicit: nimic nu se colectează până când un superadmin o activează.
insert into public.collector_sources (key, label, base_url, enabled, crawl_delay_ms, max_pages_per_run, notes, config)
values (
  'olx',
  'OLX.ro (pagini publice)',
  'https://www.olx.ro',
  false,
  6000,
  20,
  'Doar pagini publice, fără autentificare, fără cookie-uri, fără telefoane.',
  jsonb_build_object(
    'cities', jsonb_build_array(
      jsonb_build_object('slug', 'bucuresti', 'label', 'București'),
      jsonb_build_object('slug', 'cluj-napoca', 'label', 'Cluj-Napoca'),
      jsonb_build_object('slug', 'timisoara', 'label', 'Timișoara'),
      jsonb_build_object('slug', 'iasi', 'label', 'Iași'),
      jsonb_build_object('slug', 'brasov', 'label', 'Brașov')
    ),
    'categoryPath', 'imobiliare',
    'pagesPerCity', 3
  )
)
on conflict (key) do nothing;