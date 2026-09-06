ALTER TABLE public.portal_integrations ADD COLUMN credential_secret text;
REVOKE ALL (credential_secret, credential_hash) ON public.portal_integrations FROM authenticated;