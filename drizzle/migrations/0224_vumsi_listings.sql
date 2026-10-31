CREATE TABLE public.vumsi_listings (
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  external_id text NOT NULL,
  transaction text NOT NULL CHECK (transaction IN ('sale','rent')),
  vumsi_uuid uuid,
  status integer,
  public_url text,
  expires_at timestamptz,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status_checked_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, external_id)
);
CREATE INDEX vumsi_listings_property_idx ON public.vumsi_listings (organization_id, property_id);
GRANT SELECT ON public.vumsi_listings TO authenticated;
GRANT ALL ON public.vumsi_listings TO service_role;
ALTER TABLE public.vumsi_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members and superadmin read Vumsi listings" ON public.vumsi_listings
  FOR SELECT TO authenticated USING (organization_id = public.current_org() OR public.is_superadmin());