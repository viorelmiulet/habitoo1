ALTER TABLE public.portal_listings ADD COLUMN IF NOT EXISTS last_warning text;
ALTER TABLE public.portal_publications ADD COLUMN IF NOT EXISTS last_warning text;
COMMENT ON COLUMN public.portal_listings.last_warning IS 'Avertisment de publicare reușită (ex. poze parțiale); nu este eroare.';
COMMENT ON COLUMN public.portal_publications.last_warning IS 'Avertisment de publicare reușită (ex. poze parțiale); nu este eroare.';