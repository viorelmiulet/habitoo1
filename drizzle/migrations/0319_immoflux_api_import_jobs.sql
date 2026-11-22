ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS external_reference text;
CREATE TABLE public.immoflux_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error','stopped')),
 next_page integer NOT NULL DEFAULT 1,
 next_index integer NOT NULL DEFAULT 0,
 last_page integer,
 total integer,
 imported_count integer NOT NULL DEFAULT 0,
 existing_count integer NOT NULL DEFAULT 0,
 error_count integer NOT NULL DEFAULT 0,
 unmapped_codes text[] NOT NULL DEFAULT '{}',
 report jsonb NOT NULL DEFAULT '[]'::jsonb,
 image_job_id uuid REFERENCES public.property_import_jobs(id) ON DELETE SET NULL,
 locked_until timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 finished_at timestamptz
);
GRANT SELECT ON public.immoflux_import_jobs TO authenticated;
GRANT ALL ON public.immoflux_import_jobs TO service_role;
ALTER TABLE public.immoflux_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY immoflux_import_jobs_superadmin_read ON public.immoflux_import_jobs FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE UNIQUE INDEX immoflux_import_jobs_one_active ON public.immoflux_import_jobs(organization_id) WHERE status IN ('queued','running');
CREATE INDEX immoflux_import_jobs_org_created ON public.immoflux_import_jobs(organization_id, created_at DESC);