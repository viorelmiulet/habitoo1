ALTER TABLE public.portal_publish_jobs DROP CONSTRAINT IF EXISTS portal_publish_jobs_operation_check;
ALTER TABLE public.portal_publish_jobs ADD CONSTRAINT portal_publish_jobs_operation_check CHECK (operation IN ('apply','republish','imoradar','update'));
ALTER TABLE public.portal_publish_jobs ADD COLUMN contact_update_requested_by uuid;
COMMENT ON COLUMN public.portal_publish_jobs.contact_update_requested_by IS 'Pending contact refresh after a concurrent publication finishes; consumed transactionally by queue claim.';
CREATE OR REPLACE FUNCTION public.enqueue_portal_contact_update(_org uuid, _property uuid, _portal text, _actor uuid, _superadmin boolean, _next timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  INSERT INTO public.portal_publish_jobs (organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,next_attempt_at)
  VALUES (_org,_property,_portal,true,true,_actor,_superadmin,'update',_next)
  ON CONFLICT (property_id,portal_key) WHERE status IN ('queued','running') DO UPDATE SET contact_update_requested_by = _actor;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_portal_contact_update(uuid,uuid,text,uuid,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_portal_contact_update(uuid,uuid,text,uuid,boolean,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_portal_publish_jobs(_limit integer, _lease_seconds integer) RETURNS SETOF public.portal_publish_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE pending record;
BEGIN
  FOR pending IN SELECT * FROM public.portal_publish_jobs WHERE status IN ('done','error') AND contact_update_requested_by IS NOT NULL FOR UPDATE SKIP LOCKED LOOP
    PERFORM public.enqueue_portal_contact_update(pending.organization_id,pending.property_id,pending.portal_key,pending.contact_update_requested_by,pending.superadmin,now());
    UPDATE public.portal_publish_jobs SET contact_update_requested_by = NULL WHERE id = pending.id;
  END LOOP;
  RETURN QUERY UPDATE public.portal_publish_jobs j SET status = 'running', locked_at = now(), attempts = j.attempts + 1 WHERE j.id IN (
    SELECT id FROM public.portal_publish_jobs WHERE (status = 'queued' AND next_attempt_at <= now()) OR (status = 'running' AND locked_at < now() - make_interval(secs => greatest(_lease_seconds,1))) ORDER BY next_attempt_at LIMIT greatest(_limit,0) FOR UPDATE SKIP LOCKED
  ) RETURNING j.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_portal_publish_jobs(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_portal_publish_jobs(integer,integer) TO service_role;