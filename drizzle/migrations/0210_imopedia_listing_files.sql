CREATE TABLE public.imopedia_listing_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_listing_id uuid NOT NULL REFERENCES public.portal_listings(id) ON DELETE CASCADE,
  file_id text NOT NULL CHECK (file_id ~ '^[A-Za-z0-9-]{1,100}$'),
  photo_id text,
  "order" integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_listing_id, file_id)
);
GRANT SELECT ON public.imopedia_listing_files TO authenticated;
GRANT ALL ON public.imopedia_listing_files TO service_role;
ALTER TABLE public.imopedia_listing_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY imopedia_listing_files_select ON public.imopedia_listing_files
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.portal_listings pl
    WHERE pl.id = portal_listing_id
      AND (pl.organization_id = public.current_org() OR public.is_superadmin())
  ));