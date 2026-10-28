CREATE TABLE public.zonata_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  external_id text NOT NULL,
  transaction text NOT NULL CHECK (transaction IN ('sale','rent')),
  zonata_id text,
  status text NOT NULL CHECK (status IN ('test','in_review','active','rejected','withdrawn','sold','expired')),
  url text,
  expires_at timestamptz,
  rejected_reason text,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
GRANT SELECT ON public.zonata_listings TO authenticated;
GRANT ALL ON public.zonata_listings TO service_role;
ALTER TABLE public.zonata_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY zonata_listings_select ON public.zonata_listings FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE INDEX zonata_listings_property_idx ON public.zonata_listings (organization_id, property_id);
CREATE INDEX zonata_listings_review_idx ON public.zonata_listings (status) WHERE status = 'in_review';