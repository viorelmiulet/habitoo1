-- Coloana cerută de trigger-ul touch_updated_at pe market_import_runs.
ALTER TABLE public.market_import_runs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();