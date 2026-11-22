ALTER TABLE public.immoflux_import_jobs
  ADD COLUMN IF NOT EXISTS status_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_failures integer NOT NULL DEFAULT 0;
