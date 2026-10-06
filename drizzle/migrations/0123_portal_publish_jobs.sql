-- lovable-cron-fallback-reviewed: queue woken on enqueue; per-minute backstop armed only while queued/running jobs exist, unscheduled after drain
CREATE TABLE public.portal_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  enabled boolean NOT NULL,
  promoted boolean,
  sync_existing boolean NOT NULL DEFAULT true,
  requested_by uuid NOT NULL,
  superadmin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  result_ok boolean,
  result_action text,
  result_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.portal_publish_jobs TO authenticated;
GRANT ALL ON public.portal_publish_jobs TO service_role;
ALTER TABLE public.portal_publish_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read publish jobs" ON public.portal_publish_jobs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE UNIQUE INDEX portal_publish_jobs_one_active
  ON public.portal_publish_jobs (property_id, portal_key) WHERE status IN ('queued','running');
CREATE INDEX portal_publish_jobs_pending ON public.portal_publish_jobs (status, next_attempt_at);
CREATE INDEX portal_publish_jobs_property ON public.portal_publish_jobs (property_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_portal_publish_jobs(_limit integer, _lease_seconds integer)
RETURNS SETOF public.portal_publish_jobs
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.portal_publish_jobs j
     SET status = 'running', locked_at = now(), attempts = j.attempts + 1
   WHERE j.id IN (
     SELECT id FROM public.portal_publish_jobs
      WHERE (status = 'queued' AND next_attempt_at <= now())
         OR (status = 'running' AND locked_at < now() - make_interval(secs => greatest(_lease_seconds, 1)))
      ORDER BY next_attempt_at
      LIMIT greatest(_limit, 0)
      FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
$$;
REVOKE ALL ON FUNCTION public.claim_portal_publish_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_portal_publish_jobs(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.portal_publish_kick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
begin
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-publish',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('portal_publish')),
    body := '{}'::jsonb);
end; $$;

CREATE OR REPLACE FUNCTION public.portal_publish_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
begin
  if not exists (select 1 from public.portal_publish_jobs where status in ('queued','running')) then
    perform cron.unschedule('portal-publish-worker');
    return;
  end if;
  perform public.portal_publish_kick();
end; $$;

CREATE OR REPLACE FUNCTION public.portal_publish_arm()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $$
begin
  if not exists (select 1 from cron.job where jobname = 'portal-publish-worker') then
    perform cron.schedule('portal-publish-worker', '* * * * *', 'select public.portal_publish_tick()');
  end if;
  perform public.portal_publish_kick();
end; $$;
REVOKE ALL ON FUNCTION public.portal_publish_arm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_publish_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_publish_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_publish_arm() TO service_role;