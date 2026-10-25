ALTER TABLE public.listings ADD COLUMN floor_num integer GENERATED ALWAYS AS (
  CASE
    WHEN floor IS NULL OR btrim(floor) = '' THEN NULL
    WHEN floor ~* 'parter' THEN 0
    WHEN btrim(floor) ~* '^p$' THEN 0
    WHEN floor ~* 'demisol' THEN -1
    WHEN floor ~ '\d+' THEN (regexp_match(floor, '\d+'))[1]::integer
    ELSE NULL
  END
) STORED;

COMMENT ON COLUMN public.listings.floor_num IS 'Etajul ca număr, extras din floor (Parter = 0, demisol = -1), pentru filtrul de interval.';

CREATE INDEX listings_owner_floor_num_idx ON public.listings (floor_num) WHERE is_owner;