CREATE TABLE public.homedirect_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  external_id text NOT NULL,
  transaction text NOT NULL CHECK (transaction IN ('sale','rent')),
  homedirect_id text,
  short_id text,
  slug text,
  url text,
  status text NOT NULL CHECK (status IN ('active','inactive','sold','rented','deleted')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
GRANT SELECT ON public.homedirect_listings TO authenticated;
GRANT ALL ON public.homedirect_listings TO service_role;
ALTER TABLE public.homedirect_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY homedirect_listings_select ON public.homedirect_listings FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE INDEX homedirect_listings_property_idx ON public.homedirect_listings (organization_id, property_id);