ALTER TABLE public.apify_runs
  ADD COLUMN criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN field_mapping_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN max_items integer NOT NULL DEFAULT 100 CHECK (max_items BETWEEN 1 AND 10000),
  ADD COLUMN estimated_cost_usd numeric(14, 4);