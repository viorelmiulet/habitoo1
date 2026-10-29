CREATE TABLE public.ofera_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  transaction text NOT NULL CHECK (transaction IN ('sale','rent')),
  external_id text NOT NULL,
  ofera_id bigint,
  public_url text,
  valid_until date,
  status text NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('pending_activation','active','inactive','deleted','unconfirmed')),
  images_fingerprint text,
  last_log_track_id text,
  last_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, transaction),
  UNIQUE (organization_id, external_id)
);
GRANT SELECT ON public.ofera_listings TO authenticated;
GRANT ALL ON public.ofera_listings TO service_role;
ALTER TABLE public.ofera_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ofera_listings_select ON public.ofera_listings FOR SELECT TO authenticated USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE INDEX ofera_listings_property_idx ON public.ofera_listings (organization_id, property_id);