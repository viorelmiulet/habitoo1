ALTER TABLE public.portal_publish_jobs ADD COLUMN lacheie_image_limit_retry_of uuid;
CREATE UNIQUE INDEX portal_publish_lacheie_image_retry_once ON public.portal_publish_jobs(lacheie_image_limit_retry_of) WHERE lacheie_image_limit_retry_of IS NOT NULL;

CREATE OR REPLACE FUNCTION public.requeue_lacheie_image_limit_jobs(_defer boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer := 0; released integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('lacheie_image_limit_recovery'));
  IF NOT _defer THEN
    UPDATE public.portal_publish_jobs SET next_attempt_at = now()
      WHERE portal_key = 'lacheie' AND status = 'queued' AND cancelled_at IS NULL
        AND lacheie_image_limit_retry_of IS NOT NULL AND next_attempt_at = 'infinity'::timestamptz;
    GET DIAGNOSTICS released = ROW_COUNT;
  END IF;
  WITH latest AS (
    SELECT DISTINCT ON (organization_id, property_id) * FROM public.portal_publish_jobs
      WHERE portal_key = 'lacheie' ORDER BY organization_id, property_id, created_at DESC, id DESC
  ), inserted AS (
    INSERT INTO public.portal_publish_jobs(organization_id, property_id, portal_key, enabled, promoted,
      sync_existing, requested_by, superadmin, operation, next_attempt_at, lacheie_image_limit_retry_of)
    SELECT j.organization_id, j.property_id, 'lacheie', true, j.promoted, true,
      j.requested_by, j.superadmin, 'apply', CASE WHEN _defer THEN 'infinity'::timestamptz ELSE now() END, j.id
      FROM latest j JOIN public.properties p ON p.id = j.property_id AND p.organization_id = j.organization_id
      WHERE j.status = 'error' AND j.enabled AND j.cancelled_at IS NULL
        AND j.result_message LIKE '%acceptă maximum 30%'
        AND p.status = 'active' AND p.publish_status = 'published' AND p.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.portal_operation_logs l WHERE l.organization_id = j.organization_id
          AND l.property_id = j.property_id AND l.portal = 'lacheie' AND NOT l.success
          AND l.error_code = 'VALIDATION_ERROR' AND l.error_message LIKE '%acceptă maximum 30%')
        AND NOT EXISTS (SELECT 1 FROM public.portal_publish_jobs busy WHERE busy.organization_id = j.organization_id
          AND busy.property_id = j.property_id AND busy.portal_key = 'lacheie' AND busy.status IN ('queued','running'))
        AND NOT EXISTS (SELECT 1 FROM public.portal_publications pp WHERE pp.organization_id = j.organization_id
          AND pp.property_id = j.property_id AND pp.portal_key = 'lacheie' AND NOT pp.enabled)
    ON CONFLICT DO NOTHING RETURNING id
  ) SELECT count(*)::integer INTO n FROM inserted;
  IF NOT _defer AND n + released > 0 THEN PERFORM public.portal_publish_arm(); END IF;
  RETURN n + released;
END; $$;
REVOKE ALL ON FUNCTION public.requeue_lacheie_image_limit_jobs(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_lacheie_image_limit_jobs(boolean) TO service_role;