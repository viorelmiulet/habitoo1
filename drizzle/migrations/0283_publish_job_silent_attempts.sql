CREATE OR REPLACE FUNCTION public.claim_portal_publish_jobs(_limit integer,_lease_seconds integer) RETURNS SETOF public.portal_publish_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pending record; expired record; chosen public.portal_publish_jobs; p record; n integer:=0; progress boolean; lease interval:=make_interval(secs=>greatest(_lease_seconds,1));
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('portal_publish_claim_fair'));
 FOR expired IN SELECT * FROM public.portal_publish_jobs WHERE status='running' AND cancelled_at IS NULL AND locked_at<now()-lease AND attempts>=2 FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.portal_publish_jobs SET status='error',locked_at=NULL,claim_token=NULL,result_ok=false,result_action='blocked',result_message='Publicarea s-a oprit de 2 ori fără rezultat; jobul a fost închis. Reia actualizarea.',finished_at=now() WHERE id=expired.id;
  INSERT INTO public.portal_operation_logs(organization_id,property_id,portal,actor_id,operation,success,error_code,error_message) VALUES(expired.organization_id,expired.property_id,expired.portal_key,expired.requested_by,expired.operation,false,'TIMEOUT','Publicarea s-a oprit de 2 ori fără rezultat; jobul a fost închis. Reia actualizarea.');
 END LOOP;
 UPDATE public.portal_publish_jobs SET status='queued',locked_at=NULL,claim_token=NULL WHERE status='running' AND cancelled_at IS NULL AND locked_at<now()-lease AND attempts<2;
 FOR pending IN SELECT * FROM public.portal_publish_jobs WHERE status IN ('done','error') AND cancelled_at IS NULL AND contact_update_requested_by IS NOT NULL FOR UPDATE SKIP LOCKED LOOP
  PERFORM public.enqueue_portal_contact_update(pending.organization_id,pending.property_id,pending.portal_key,pending.contact_update_requested_by,pending.superadmin,greatest(coalesce(pending.followup_at,now()),now()));
  UPDATE public.portal_publish_jobs SET contact_update_requested_by=NULL,followup_at=NULL WHERE id=pending.id;
 END LOOP;
 INSERT INTO public.portal_publish_fairness(portal_key) SELECT DISTINCT portal_key FROM public.portal_publish_jobs WHERE status='queued' ON CONFLICT DO NOTHING;
 LOOP
  progress:=false;
  FOR p IN SELECT f.portal_key FROM public.portal_publish_fairness f WHERE EXISTS(SELECT 1 FROM public.portal_publish_jobs j WHERE j.portal_key=f.portal_key AND j.status='queued' AND j.cancelled_at IS NULL AND j.next_attempt_at<=now()) ORDER BY f.last_claimed_at,f.portal_key LOOP
   IF n>=greatest(_limit,0) THEN RETURN; END IF;
   IF p.portal_key IN ('imobiliare_ro','vdi') AND EXISTS(SELECT 1 FROM public.portal_relay_health WHERE id AND paused_until IS NOT NULL) THEN CONTINUE; END IF;
   IF (SELECT count(*) FROM public.portal_publish_jobs WHERE portal_key=p.portal_key AND status='running' AND cancelled_at IS NULL AND locked_at>=now()-lease)>=2 THEN CONTINUE; END IF;
   SELECT * INTO chosen FROM public.portal_publish_jobs WHERE portal_key=p.portal_key AND status='queued' AND cancelled_at IS NULL AND next_attempt_at<=now() ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN CONTINUE; END IF;
   UPDATE public.portal_publish_jobs SET status='running',locked_at=now(),claim_token=gen_random_uuid(),attempts=attempts+1 WHERE id=chosen.id RETURNING * INTO chosen;
   UPDATE public.portal_publish_fairness SET last_claimed_at=clock_timestamp() WHERE portal_key=p.portal_key;
   RETURN NEXT chosen; n:=n+1; progress:=true;
  END LOOP;
  EXIT WHEN NOT progress OR n>=greatest(_limit,0);
 END LOOP;
END; $$;