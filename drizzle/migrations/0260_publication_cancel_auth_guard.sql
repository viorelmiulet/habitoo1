CREATE OR REPLACE FUNCTION public.cancel_portal_republish_batch(_batch uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.portal_republish_batches; n integer;
BEGIN
 SELECT * INTO b FROM public.portal_republish_batches WHERE id=_batch FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(public.is_superadmin() OR (b.organization_id=public.current_org() AND (b.requested_by=auth.uid() OR public.is_org_admin(b.organization_id))),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF b.status<>'running' THEN RETURN 0; END IF;
 IF b.created_at>=now()-interval '30 minutes' OR EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND finished_at>=now()-interval '10 minutes') THEN RAISE EXCEPTION 'Republicarea nu este blocată'; END IF;
 UPDATE public.portal_publish_jobs SET status='done',cancelled_at=now(),locked_at=NULL,claim_token=NULL,finished_at=now(),result_ok=false,result_action='cancelled',result_message='Anulat: Oprește restul',contact_update_requested_by=NULL,followup_at=NULL WHERE republish_batch_id=b.id AND status IN ('queued','running');
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.portal_republish_batches SET status='done',finished_at=now(),succeeded=(SELECT count(*) FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND status='done' AND coalesce(result_action,'') NOT IN ('skipped','cancelled')),failed=(SELECT count(*) FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND status='error'),skipped=jsonb_array_length(b.skipped_items)+(SELECT count(*) FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND result_action IN ('skipped','cancelled')) WHERE id=b.id;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.cancel_portal_republish_batch(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_portal_republish_batch(uuid) TO authenticated;