-- Două surse Apify pregătite, oprite implicit, ca nimic să nu fie scris de la zero.
-- Inputul trebuie să respecte schema documentată a actorului; maparea traduce
-- numele câmpurilor actorului în câmpurile Habitoo și se corectează după ce se
-- vede primul rezultat brut al unei rulări.

insert into public.apify_sources
  (key, label, actor_id, input, field_mapping, enabled, max_items, targets, target, unit_cost_usd, notes)
values
  (
    'olx_imobiliare',
    'OLX Imobiliare (Apify)',
    'sian.agency/olx-property-scraper',
    '{"country":"ro","category":"imobiliare","query":"apartament","maxItems":100,"proxyConfiguration":{"useApifyProxy":true}}'::jsonb,
    '{"sourceListingId":"id","url":"url","title":"title","price":"price","currency":"currency","usableArea":["surface","area"],"rooms":"rooms","city":"city","county":"region","neighborhood":"district","listingDate":["createdTime","createdAt"],"sellerType":["sellerType","isBusiness"],"images":"images"}'::jsonb,
    false,
    100,
    array['prospects']::text[],
    'prospects',
    0.005,
    'Verifică inputul în documentația actorului OLX. Prospecți se creează numai din anunțurile marcate public ca persoane fizice.'
  ),
  (
    'imobiliare_ro',
    'Imobiliare.ro (Apify)',
    'swerve/imobiliare-scraper',
    '{"searchUrl":"https://www.imobiliare.ro/vanzare-apartamente/bucuresti","maxItems":100}'::jsonb,
    '{"sourceListingId":["id","listingId"],"url":"url","title":"title","price":"price","currency":"currency","usableArea":["usableSurface","surface"],"totalArea":"builtSurface","rooms":"rooms","city":"city","county":"county","neighborhood":"zone","listingDate":"publishedAt","sellerType":"sellerType","images":"images"}'::jsonb,
    false,
    100,
    array['market_pool']::text[],
    'market_pool',
    0.005,
    'Inputul folosește un searchUrl de pe imobiliare.ro, conform schemei actorului.'
  )
on conflict (key) do nothing;
