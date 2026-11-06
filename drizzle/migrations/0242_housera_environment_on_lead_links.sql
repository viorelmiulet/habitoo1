ALTER TABLE public.portal_lead_links ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT '';
UPDATE public.portal_lead_links SET environment = 'staging' WHERE portal = 'housera' AND environment = '';
CREATE UNIQUE INDEX IF NOT EXISTS portal_lead_links_env_unique ON public.portal_lead_links (portal, organization_id, external_lead_id, environment);
ALTER TABLE public.portal_lead_links DROP CONSTRAINT IF EXISTS portal_lead_links_unique;
COMMENT ON COLUMN public.portal_lead_links.environment IS 'Housera: staging/production where the link was created; empty for portals without environments.';