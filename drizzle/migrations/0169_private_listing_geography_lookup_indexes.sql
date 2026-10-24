CREATE INDEX ro_localities_listing_label_idx ON public.ro_localities(public.ro_normalize_name(public.listing_place_label(name)),county_id) WHERE active;
CREATE INDEX imobiliare_listing_neighborhood_idx ON public.imobiliare_locations(public.ro_normalize_name(name)) WHERE depth=3;
CREATE INDEX listings_neighborhood_lookup_idx ON public.listings(neighborhood_key,city_key,county_key);