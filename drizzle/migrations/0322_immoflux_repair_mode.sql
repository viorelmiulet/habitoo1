ALTER TABLE public.immoflux_import_jobs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'import';
ALTER TABLE public.immoflux_import_jobs DROP CONSTRAINT IF EXISTS immoflux_import_jobs_mode_check;
ALTER TABLE public.immoflux_import_jobs ADD CONSTRAINT immoflux_import_jobs_mode_check CHECK (mode IN ('import','repair'));
