-- Read-only verification after the one-time owner-phone cleanup.
SELECT count(*) = 0 AS no_listing_has_phone
FROM public.listings
WHERE phone IS NOT NULL;