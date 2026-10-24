-- Read-only regression checks for the import's database normalizer.
-- Run through a privileged database query session; no test listings are inserted.
SELECT
 (SELECT zone='Sector 1' FROM public.normalize_listing_geography('Bucuresti',NULL,'Sectorul 1',NULL)) AS sector_normalized,
 (SELECT neighborhood='Titan' FROM public.normalize_listing_geography('Bucuresti',NULL,NULL,'titan')) AS titan_normalized,
 (SELECT city='Popești-Leordeni' AND county='Ilfov' FROM public.normalize_listing_geography('Popești','Ilfov',NULL,NULL)) AS popesti_in_ilfov,
 (SELECT city IS NULL AND county='Mehedinți' FROM public.normalize_listing_geography('Mehedinti',NULL,NULL,NULL)) AS county_not_city,
 (SELECT city='Bacău' AND county='Bacău' FROM public.normalize_listing_geography('Bacau','Bacau',NULL,NULL)) AS canonical_diacritics,
 (SELECT city='Giroc' AND county='Timiș' FROM public.normalize_listing_geography('giroc',NULL,NULL,NULL)) AS unique_locality_county;