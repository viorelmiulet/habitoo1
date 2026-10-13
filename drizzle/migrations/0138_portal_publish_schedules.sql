CREATE TABLE public.portal_publish_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  promoted boolean,
  requested_by uuid NOT NULL,
  superadmin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','executed','cancelled','failed')),
  reason text,
  locked_at timestamptz,
  finished_at timestamptz,
  finished_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portal_publish_schedules TO authenticated;
GRANT ALL ON public.portal_publish_schedules TO service_role;
ALTER TABLE public.portal_publish_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read publish schedules" ON public.portal_publish_schedules
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE UNIQUE INDEX portal_publish_schedules_one_active
  ON public.portal_publish_schedules (property_id, portal_key) WHERE status = 'scheduled';
CREATE INDEX portal_publish_schedules_due ON public.portal_publish_schedules (scheduled_at) WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION public.claim_due_portal_publish_schedules(_limit integer, _lease_seconds integer)
RETURNS SETOF public.portal_publish_schedules
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.portal_publish_schedules s
     SET locked_at = now()
   WHERE s.id IN (
     SELECT id FROM public.portal_publish_schedules
      WHERE status = 'scheduled' AND scheduled_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - make_interval(secs => greatest(_lease_seconds, 1)))
      ORDER BY scheduled_at
      LIMIT greatest(_limit, 0)
      FOR UPDATE SKIP LOCKED)
  RETURNING s.*;
$$;
REVOKE ALL ON FUNCTION public.claim_due_portal_publish_schedules(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_portal_publish_schedules(integer, integer) TO service_role;