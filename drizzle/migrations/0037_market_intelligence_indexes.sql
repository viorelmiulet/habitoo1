-- ACP Stage 4 (Market Intelligence): indexuri pentru filtrele și agregările reale.
-- Migrare pur aditivă: nu creează, nu redenumește și nu șterge coloane sau tabele.

CREATE INDEX IF NOT EXISTS market_listings_mi_scope_idx
  ON public.market_listings (status, property_type, transaction_type, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS market_listings_mi_city_idx
  ON public.market_listings (lower(city));

CREATE INDEX IF NOT EXISTS market_listings_mi_county_idx
  ON public.market_listings (lower(county));

CREATE INDEX IF NOT EXISTS market_listings_mi_rooms_area_idx
  ON public.market_listings (rooms, usable_area);

CREATE INDEX IF NOT EXISTS market_listings_mi_price_per_sqm_idx
  ON public.market_listings (price_per_sqm)
  WHERE price_per_sqm IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_listing_snapshots_trend_idx
  ON public.market_listing_snapshots (market_listing_id, captured_at DESC);
