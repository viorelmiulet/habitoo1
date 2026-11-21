CREATE TABLE public.property_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  property_ids uuid[] NOT NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  total integer NOT NULL DEFAULT 0,
  file_path text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
GRANT SELECT, INSERT ON public.property_export_jobs TO authenticated;
GRANT ALL ON public.property_export_jobs TO service_role;
ALTER TABLE public.property_export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY property_export_jobs_own_select ON public.property_export_jobs FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
CREATE POLICY property_export_jobs_own_insert ON public.property_export_jobs FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND organization_id = public.current_org() AND status = 'queued' AND file_path IS NULL);
CREATE INDEX property_export_jobs_queue ON public.property_export_jobs (status, created_at);