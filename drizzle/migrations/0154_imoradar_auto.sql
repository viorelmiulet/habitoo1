ALTER TABLE public.imobiliare_promotion_states
  ADD COLUMN IF NOT EXISTS manually_stopped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_warning text;
ALTER TABLE public.portal_publications
  ADD COLUMN IF NOT EXISTS imoradar_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.portal_republish_batches
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'republish' CHECK (kind IN ('republish','imoradar'));
ALTER TABLE public.portal_publish_jobs DROP CONSTRAINT IF EXISTS portal_publish_jobs_operation_check;
ALTER TABLE public.portal_publish_jobs ADD CONSTRAINT portal_publish_jobs_operation_check CHECK (operation IN ('apply','republish','imoradar'));