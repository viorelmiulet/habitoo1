ALTER TABLE public.properties
  ADD COLUMN energy_class text,
  ADD COLUMN is_exclusive boolean,
  ADD COLUMN address_building text,
  ADD COLUMN address_staircase text,
  ADD COLUMN address_apartment text;
ALTER TABLE public.properties ADD CONSTRAINT properties_energy_class_check
  CHECK (energy_class IS NULL OR energy_class IN ('A++','A+','A','B','C','D','E','F','G'));
COMMENT ON COLUMN public.properties.address_building IS 'Intern: nu se expune în feed-uri sau portaluri.';
COMMENT ON COLUMN public.properties.address_staircase IS 'Intern: nu se expune în feed-uri sau portaluri.';
COMMENT ON COLUMN public.properties.address_apartment IS 'Intern: nu se expune în feed-uri sau portaluri.';

CREATE UNIQUE INDEX properties_org_source_external_unique
  ON public.properties (organization_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE public.property_images ADD COLUMN source_url text;
CREATE UNIQUE INDEX property_images_property_source_url_unique
  ON public.property_images (property_id, source_url) WHERE source_url IS NOT NULL;

CREATE TABLE public.property_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid,
  source text NOT NULL,
  file_name text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  images_total integer NOT NULL DEFAULT 0,
  images_done integer NOT NULL DEFAULT 0,
  images_failed integer NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_import_jobs TO authenticated;
GRANT ALL ON public.property_import_jobs TO service_role;
ALTER TABLE public.property_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property import jobs superadmin" ON public.property_import_jobs
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE INDEX property_import_jobs_org_idx ON public.property_import_jobs (organization_id, created_at DESC);

CREATE TABLE public.property_import_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.property_import_jobs(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  ordering integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_import_images TO authenticated;
GRANT ALL ON public.property_import_images TO service_role;
ALTER TABLE public.property_import_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property import images superadmin" ON public.property_import_images
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE INDEX property_import_images_status_lock_idx ON public.property_import_images (status, locked_until);
CREATE INDEX property_import_images_job_idx ON public.property_import_images (job_id);
CREATE TRIGGER property_import_images_touch BEFORE UPDATE ON public.property_import_images
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();