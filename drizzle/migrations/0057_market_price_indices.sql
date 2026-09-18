-- Indicele trimestrial al prețurilor locuințelor (Eurostat), strat de date.
-- Aditiv: nicio modificare a tabelelor ACP existente. Motorul determinist nu
-- citește încă acest tabel.

CREATE TABLE IF NOT EXISTS public.market_price_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'eurostat',
  dataset text NOT NULL,
  series text NOT NULL,
  region text NOT NULL DEFAULT 'RO',
  unit text NOT NULL,
  period_year integer NOT NULL,
  period_quarter integer NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  index_value numeric NOT NULL,
  base_label text,
  published_at timestamptz,
  import_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_price_indices_unique_point UNIQUE
    (source, dataset, series, region, unit, period_year, period_quarter)
);

CREATE INDEX IF NOT EXISTS market_price_indices_series_period_idx
  ON public.market_price_indices (series, period_year DESC, period_quarter DESC);

-- Sursa 'eurostat' este permisă în jurnalul de rulări: `market_import_runs.source`
-- este text liber (fără CHECK), iar allowlist-ul aplicativ este în
-- `src/lib/market/indices/eurostat.ts`.
CREATE INDEX IF NOT EXISTS market_import_runs_eurostat_idx
  ON public.market_import_runs (started_at DESC)
  WHERE source = 'eurostat';

GRANT SELECT ON public.market_price_indices TO authenticated;
GRANT ALL ON public.market_price_indices TO service_role;

ALTER TABLE public.market_price_indices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_price_indices_select" ON public.market_price_indices
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE TRIGGER market_price_indices_touch
  BEFORE UPDATE ON public.market_price_indices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();