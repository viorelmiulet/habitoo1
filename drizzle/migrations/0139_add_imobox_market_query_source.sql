INSERT INTO public.market_query_sources (key, label, base_url, enabled, timeout_ms, radius_km, price_band_percent, notes)
VALUES ('imobox', 'ImoBox.ro', 'https://api.imobox.ro', false, 8000, 5, 40, 'API public ImoBox (/v1/anunturi), fără cheie; max 3 pagini a câte 100.')
ON CONFLICT (key) DO NOTHING;