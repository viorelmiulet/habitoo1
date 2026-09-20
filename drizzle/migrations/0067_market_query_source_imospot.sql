-- Sursa Imospot pentru interogarea live a comparabilelor.
-- Livrată dezactivată: nu se face nicio cerere până când un superadmin o activează.
insert into public.market_query_sources (key, label, base_url, enabled, timeout_ms, radius_km, price_band_percent, notes)
values (
  'imospot',
  'Imospot.ro',
  'https://www.imospot.ro',
  false,
  4000,
  5,
  40,
  'Interogare publică, la momentul analizei. Cel mult 2 pagini (24 rezultate) per interogare, robots.txt respectat, o cerere pe rând. Fără imagini și fără date de contact. Harta localităților acoperă București, cele șase sectoare și cartierele confirmate; zonele fără corespondent coboară la nivelul orașului.'
)
on conflict (key) do update set
  label = excluded.label,
  base_url = excluded.base_url,
  notes = excluded.notes,
  updated_at = now();