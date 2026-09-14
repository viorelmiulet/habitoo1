-- Faza 3, Etapa 3 ACP: metadate pentru rapoartele PDF.
-- Aditiv: rapoartele existente rămân valide. `analysis_id` indică EXACT versiunea
-- ACP pentru care s-a generat raportul; `version` numerotează rapoartele acelei versiuni.

ALTER TABLE public.acp_reports
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS root_analysis_id uuid,
  ADD COLUMN IF NOT EXISTS analysis_version integer,
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS file_size_bytes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acp_reports_status_check'
  ) THEN
    ALTER TABLE public.acp_reports
      ADD CONSTRAINT acp_reports_status_check
      CHECK (status IN ('generating', 'ready', 'failed'));
  END IF;
END $$;

UPDATE public.acp_reports r
SET organization_id = COALESCE(r.organization_id, a.organization_id),
    root_analysis_id = COALESCE(r.root_analysis_id, a.root_analysis_id, a.id),
    analysis_version = COALESCE(r.analysis_version, a.version),
    snapshot_at = COALESCE(r.snapshot_at, a.snapshot_at, a.last_run_at, a.created_at)
FROM public.acp_analyses a
WHERE a.id = r.analysis_id;

CREATE INDEX IF NOT EXISTS acp_reports_org_created_idx
  ON public.acp_reports (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS acp_reports_root_idx
  ON public.acp_reports (root_analysis_id);