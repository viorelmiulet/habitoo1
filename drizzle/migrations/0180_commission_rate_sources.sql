-- Rate source tracking: BNR first (curs.bnr.ro), ECB (Frankfurter) as fallback.
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'BNR'
  CHECK (source IN ('BNR', 'BCE'));

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS rate_source text
  CHECK (rate_source IN ('BNR', 'BCE'));