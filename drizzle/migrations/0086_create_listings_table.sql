CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('storia','imobiliare','olx')),
  external_id text NOT NULL,
  title text,
  price numeric,
  currency text DEFAULT 'EUR',
  price_per_m2 numeric,
  rooms integer,
  surface numeric,
  floor text,
  location text,
  county text,
  property_type text,
  transaction_type text,
  is_owner boolean DEFAULT true,
  owner_type text DEFAULT 'persoana_fizica',
  description text,
  phone text,
  url text,
  images text[],
  fingerprint text,
  scraped_at timestamptz DEFAULT now(),
  published_at timestamptz,
  raw_data jsonb,
  CONSTRAINT listings_source_external_id_key UNIQUE (source, external_id)
);

CREATE INDEX listings_fingerprint_idx ON public.listings (fingerprint);
CREATE INDEX listings_is_owner_idx ON public.listings (is_owner);
CREATE INDEX listings_location_idx ON public.listings (location);
CREATE INDEX listings_price_idx ON public.listings (price);
CREATE INDEX listings_scraped_at_idx ON public.listings (scraped_at);

GRANT SELECT ON public.listings TO anon;
GRANT SELECT ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to listings"
ON public.listings
FOR SELECT
TO anon, authenticated
USING (true);