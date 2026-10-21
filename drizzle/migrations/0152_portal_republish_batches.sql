CREATE TABLE public.portal_republish_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  scope text NOT NULL DEFAULT 'mine' CHECK (scope IN ('mine','all')),
  portal_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done')),
  total integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  skipped_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.portal_republish_batches TO authenticated;
GRANT ALL ON public.portal_republish_batches TO service_role;
ALTER TABLE public.portal_republish_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read republish batches" ON public.portal_republish_batches
  FOR SELECT TO authenticated USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE UNIQUE INDEX portal_republish_batches_one_active ON public.portal_republish_batches (organization_id) WHERE status = 'running';

ALTER TABLE public.portal_publish_jobs
  ADD COLUMN operation text NOT NULL DEFAULT 'apply' CHECK (operation IN ('apply','republish')),
  ADD COLUMN republish_batch_id uuid REFERENCES public.portal_republish_batches(id) ON DELETE SET NULL;
CREATE INDEX portal_publish_jobs_republish_batch ON public.portal_publish_jobs (republish_batch_id) WHERE republish_batch_id IS NOT NULL;