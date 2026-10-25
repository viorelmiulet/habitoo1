ALTER TABLE public.listings ADD COLUMN first_seen_at timestamptz;

UPDATE public.listings SET first_seen_at = COALESCE(scraped_at, now()) WHERE first_seen_at IS NULL;

ALTER TABLE public.listings ALTER COLUMN first_seen_at SET NOT NULL;
ALTER TABLE public.listings ALTER COLUMN first_seen_at SET DEFAULT now();

COMMENT ON COLUMN public.listings.first_seen_at IS 'Momentul primei intrări în Habitoo; se completează la insert (default now()) și nu se schimbă la reimport.';