CREATE OR REPLACE FUNCTION public.portal_publish_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,cron AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.portal_publish_jobs WHERE status IN ('queued','running') OR contact_update_requested_by IS NOT NULL) THEN
    PERFORM cron.unschedule('portal-publish-worker');
    RETURN;
  END IF;
  PERFORM public.portal_publish_kick();
END; $$;
REVOKE ALL ON FUNCTION public.portal_publish_tick() FROM PUBLIC,anon,authenticated;