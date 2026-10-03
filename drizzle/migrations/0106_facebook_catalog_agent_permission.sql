ALTER TABLE public.organizations
ADD COLUMN facebook_catalog_agents_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.facebook_catalog_agents_enabled IS
'Controls whether non-admin agents may opt their own listings into Facebook Catalog; disabling does not change existing opt-ins.';