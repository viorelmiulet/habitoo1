-- Faza 3, Etapa 2: consolidarea liniei de versiuni ACP.
-- Aditiv: doar backfill + garanție de unicitate la concurență.

UPDATE public.acp_analyses SET root_analysis_id = id WHERE root_analysis_id IS NULL;
UPDATE public.acp_analyses
   SET snapshot_at = COALESCE(last_run_at, created_at)
 WHERE snapshot_at IS NULL;

-- Două recalculări simultane nu pot obține același `version` în același root.
CREATE UNIQUE INDEX IF NOT EXISTS acp_analyses_root_version_uidx
  ON public.acp_analyses (root_analysis_id, version)
  WHERE root_analysis_id IS NOT NULL;