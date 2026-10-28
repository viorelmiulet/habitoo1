CREATE TABLE public.imo24_image_retries (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.imo24_image_retries TO service_role;
ALTER TABLE public.imo24_image_retries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.portal_publish_jobs ADD COLUMN IF NOT EXISTS followup_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_portal_publish_jobs(_limit integer, _lease_seconds integer) RETURNS SETOF public.portal_publish_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE pending record;
BEGIN
  FOR pending IN SELECT * FROM public.portal_publish_jobs WHERE status IN ('done','error') AND contact_update_requested_by IS NOT NULL FOR UPDATE SKIP LOCKED LOOP
    PERFORM public.enqueue_portal_contact_update(pending.organization_id,pending.property_id,pending.portal_key,pending.contact_update_requested_by,pending.superadmin,greatest(coalesce(pending.followup_at, now()), now()));
    UPDATE public.portal_publish_jobs SET contact_update_requested_by = NULL, followup_at = NULL WHERE id = pending.id;
  END LOOP;
  RETURN QUERY UPDATE public.portal_publish_jobs j SET status = 'running', locked_at = now(), attempts = j.attempts + 1 WHERE j.id IN (
    SELECT id FROM public.portal_publish_jobs WHERE (status = 'queued' AND next_attempt_at <= now()) OR (status = 'running' AND locked_at < now() - make_interval(secs => greatest(_lease_seconds,1))) ORDER BY next_attempt_at LIMIT greatest(_limit,0) FOR UPDATE SKIP LOCKED
  ) RETURNING j.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_portal_publish_jobs(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_portal_publish_jobs(integer,integer) TO service_role;

-- Reprogramează un PUT imo24 (imagini amânate), cel mult _max ori; întoarce încercarea sau 0.
CREATE OR REPLACE FUNCTION public.schedule_imo24_image_retry(_org uuid, _property uuid, _actor uuid, _max integer, _delay_seconds integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE n integer; due timestamptz := now() + make_interval(secs => greatest(_delay_seconds, 1));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = _property AND organization_id = _org) THEN RETURN 0; END IF;
  INSERT INTO public.imo24_image_retries (property_id, organization_id, attempts, updated_at)
  VALUES (_property, _org, 1, now())
  ON CONFLICT (property_id) DO UPDATE SET attempts = public.imo24_image_retries.attempts + 1, updated_at = now()
    WHERE public.imo24_image_retries.attempts < _max
  RETURNING attempts INTO n;
  IF n IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.portal_publish_jobs (organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,next_attempt_at)
  VALUES (_org,_property,'imo24',true,true,_actor,false,'update',due)
  ON CONFLICT (property_id,portal_key) WHERE status IN ('queued','running')
  DO UPDATE SET contact_update_requested_by = _actor, followup_at = due;
  PERFORM public.portal_publish_arm();
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.schedule_imo24_image_retry(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_imo24_image_retry(uuid,uuid,uuid,integer,integer) TO service_role;