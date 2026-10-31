CREATE TABLE public.vumsi_nomenclature_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  synced_by uuid,
  reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.vumsi_nomenclature_snapshots TO authenticated;
GRANT ALL ON public.vumsi_nomenclature_snapshots TO service_role;
ALTER TABLE public.vumsi_nomenclature_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads Vumsi snapshots" ON public.vumsi_nomenclature_snapshots
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE INDEX vumsi_nomenclature_snapshots_synced_at_idx ON public.vumsi_nomenclature_snapshots (synced_at DESC);