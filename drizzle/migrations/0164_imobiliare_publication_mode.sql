ALTER TABLE public.portal_publications ADD COLUMN IF NOT EXISTS imobiliare_mode text;
ALTER TABLE public.portal_publications ADD CONSTRAINT portal_publications_imobiliare_mode_check CHECK (imobiliare_mode IS NULL OR (portal_key = 'imobiliare_ro' AND imobiliare_mode IN ('combined', 'imoradar_only')));
ALTER TABLE public.portal_publish_jobs ADD COLUMN IF NOT EXISTS imobiliare_mode text;
ALTER TABLE public.portal_publish_jobs ADD CONSTRAINT portal_publish_jobs_imobiliare_mode_check CHECK (imobiliare_mode IS NULL OR (portal_key = 'imobiliare_ro' AND imobiliare_mode IN ('combined', 'imoradar_only')));
ALTER TABLE public.portal_listings ADD COLUMN IF NOT EXISTS imobiliare_mode text;
ALTER TABLE public.portal_listings ADD CONSTRAINT portal_listings_imobiliare_mode_check CHECK (imobiliare_mode IS NULL OR (portal = 'imobiliare_ro' AND imobiliare_mode IN ('combined', 'imoradar_only')));
COMMENT ON COLUMN public.portal_publications.imobiliare_mode IS 'Requested destination on the existing Imobiliare.ro card; NULL preserves the legacy combined mode.';
COMMENT ON COLUMN public.portal_publish_jobs.imobiliare_mode IS 'Explicit destination carried by the durable publication job; NULL preserves the current selection.';
COMMENT ON COLUMN public.portal_listings.imobiliare_mode IS 'Last destination confirmed by a successful portal response. imoradar_only is draft on Imobiliare.ro, online on imoradar24.';