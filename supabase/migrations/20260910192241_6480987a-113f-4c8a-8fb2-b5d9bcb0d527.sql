CREATE TABLE public.portal_taxonomy_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portal text NOT NULL,
  site_urn text NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  fetched_by uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  discrepancies jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (portal, site_urn)
);

GRANT ALL ON public.portal_taxonomy_cache TO service_role;

ALTER TABLE public.portal_taxonomy_cache ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER portal_taxonomy_cache_touch
  BEFORE UPDATE ON public.portal_taxonomy_cache
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();