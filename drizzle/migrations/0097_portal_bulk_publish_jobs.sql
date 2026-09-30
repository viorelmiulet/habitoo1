-- lovable-cron-fallback-reviewed: 1440 runs/day max; armed only while bulk portal jobs have pending work
CREATE TABLE public.portal_bulk_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','cancelled')),
  total integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  done integer NOT NULL DEFAULT 0 CHECK (done >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

GRANT SELECT ON public.portal_bulk_jobs TO authenticated;
GRANT ALL ON public.portal_bulk_jobs TO service_role;
ALTER TABLE public.portal_bulk_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal bulk jobs readable by organization members"
  ON public.portal_bulk_jobs FOR SELECT TO authenticated
  USING (public.is_superadmin() OR organization_id = public.current_org());

CREATE INDEX portal_bulk_jobs_org_created_idx
  ON public.portal_bulk_jobs (organization_id, created_at DESC);
CREATE INDEX portal_bulk_jobs_pending_idx
  ON public.portal_bulk_jobs (status, created_at);

CREATE TABLE public.portal_bulk_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_bulk_jobs(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  enabled boolean NOT NULL,
  promoted boolean,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ok','failed','skipped')),
  message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  locked_until timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (job_id, property_id, portal_key)
);

GRANT SELECT ON public.portal_bulk_items TO authenticated;
GRANT ALL ON public.portal_bulk_items TO service_role;
ALTER TABLE public.portal_bulk_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal bulk items readable through organization jobs"
  ON public.portal_bulk_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.portal_bulk_jobs j
    WHERE j.id = job_id
      AND (public.is_superadmin() OR j.organization_id = public.current_org())
  ));

CREATE INDEX portal_bulk_items_pending_idx
  ON public.portal_bulk_items (status, next_attempt_at, created_at);
CREATE INDEX portal_bulk_items_job_idx
  ON public.portal_bulk_items (job_id, status, created_at);

CREATE OR REPLACE FUNCTION public.claim_portal_bulk_property(
  _job_id uuid,
  _property_id uuid,
  _ttl_seconds integer
)
RETURNS SETOF public.portal_bulk_items
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.portal_bulk_items
     SET locked_until = now() + make_interval(secs => greatest(_ttl_seconds, 1)),
         status = 'running'
   WHERE job_id = _job_id
     AND property_id = _property_id
     AND status IN ('queued','running')
     AND (locked_until IS NULL OR locked_until < now())
     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.portal_bulk_arm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'portal-bulk-worker') THEN
    PERFORM cron.schedule('portal-bulk-worker', '* * * * *', 'select public.portal_bulk_tick()');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_bulk_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  _pending integer;
BEGIN
  SELECT count(*) INTO _pending
    FROM public.portal_bulk_items
   WHERE status IN ('queued','running');

  IF _pending = 0 THEN
    PERFORM cron.unschedule('portal-bulk-worker');
    SELECT count(*) INTO _pending
      FROM public.portal_bulk_items
     WHERE status IN ('queued','running');
    IF _pending > 0 THEN
      PERFORM public.portal_bulk_arm();
    END IF;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-bulk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('portal_bulk')
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_portal_bulk_property(uuid, uuid, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_bulk_arm() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_bulk_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_portal_bulk_property(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_bulk_arm() TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_bulk_tick() TO service_role;