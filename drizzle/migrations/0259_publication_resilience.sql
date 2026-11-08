ALTER TABLE public.portal_publish_jobs ADD COLUMN claim_token uuid, ADD COLUMN cancelled_at timestamptz;
CREATE TABLE public.portal_relay_health (id boolean PRIMARY KEY DEFAULT true CHECK(id), responding boolean, consecutive_failures integer NOT NULL DEFAULT 0, first_failure_at timestamptz, last_checked_at timestamptz, paused_until timestamptz, probe_locked_until timestamptz);
GRANT SELECT ON public.portal_relay_health TO authenticated;
GRANT ALL ON public.portal_relay_health TO service_role;
ALTER TABLE public.portal_relay_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads relay state" ON public.portal_relay_health FOR SELECT TO authenticated USING(public.is_superadmin());
CREATE TABLE public.portal_publish_fairness (portal_key text PRIMARY KEY, last_claimed_at timestamptz NOT NULL DEFAULT '-infinity');
GRANT ALL ON public.portal_publish_fairness TO service_role;
ALTER TABLE public.portal_publish_fairness ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.record_portal_relay_response(_ok boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.portal_relay_health; alert boolean := false;
BEGIN
 INSERT INTO public.portal_relay_health(id) VALUES(true) ON CONFLICT DO NOTHING;
 SELECT * INTO h FROM public.portal_relay_health WHERE id FOR UPDATE;
 IF _ok THEN
  UPDATE public.portal_relay_health SET responding=true,consecutive_failures=0,first_failure_at=NULL,last_checked_at=now(),paused_until=NULL,probe_locked_until=NULL WHERE id;
  IF h.paused_until IS NOT NULL THEN UPDATE public.portal_publish_jobs SET next_attempt_at=now() WHERE status='queued' AND cancelled_at IS NULL AND portal_key IN ('imobiliare_ro','vdi') AND next_attempt_at<=h.paused_until; END IF;
 ELSE
  IF h.first_failure_at IS NULL OR h.first_failure_at<now()-interval '5 minutes' THEN h.consecutive_failures:=0; h.first_failure_at:=now(); END IF;
  h.consecutive_failures:=h.consecutive_failures+1;
  alert:=h.consecutive_failures>=3 AND h.paused_until IS NULL;
  UPDATE public.portal_relay_health SET responding=false,consecutive_failures=h.consecutive_failures,first_failure_at=h.first_failure_at,last_checked_at=now(),paused_until=CASE WHEN h.consecutive_failures>=3 OR h.paused_until IS NOT NULL THEN now()+interval '15 minutes' ELSE NULL END,probe_locked_until=NULL WHERE id;
  IF h.consecutive_failures>=3 OR h.paused_until IS NOT NULL THEN
   UPDATE public.portal_publish_jobs SET next_attempt_at=greatest(next_attempt_at,now()+interval '15 minutes') WHERE status='queued' AND cancelled_at IS NULL AND portal_key IN ('imobiliare_ro','vdi');
  END IF;
  IF alert THEN INSERT INTO public.notifications(user_id,type,title,body,link) SELECT DISTINCT user_id,'portal_relay_error','Releul cu IP fix (relay.habitoo.ro) nu răspunde','Publicările pe Imobiliare.ro și VDI.ro sunt amânate 15 minute.','/superadmin/setari-portaluri' FROM public.user_roles WHERE role='superadmin'; END IF;
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.claim_portal_relay_probe() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.portal_relay_health SET probe_locked_until=now()+interval '30 seconds' WHERE id AND paused_until<=now() AND (probe_locked_until IS NULL OR probe_locked_until<now());
 RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.claim_portal_publish_jobs(_limit integer,_lease_seconds integer) RETURNS SETOF public.portal_publish_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pending record; expired record; chosen public.portal_publish_jobs; p record; n integer:=0; progress boolean; lease interval:=make_interval(secs=>greatest(_lease_seconds,1));
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('portal_publish_claim_fair'));
 FOR expired IN SELECT * FROM public.portal_publish_jobs WHERE status='running' AND cancelled_at IS NULL AND locked_at<now()-lease AND attempts>=3 FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.portal_publish_jobs SET status='error',locked_at=NULL,claim_token=NULL,result_ok=false,result_action='blocked',result_message='Portalul nu a răspuns de 3 ori; se reîncearcă la următoarea republicare',finished_at=now() WHERE id=expired.id;
  INSERT INTO public.portal_operation_logs(organization_id,property_id,portal,actor_id,operation,success,error_code,error_message) VALUES(expired.organization_id,expired.property_id,expired.portal_key,expired.requested_by,expired.operation,false,'TIMEOUT','Portalul nu a răspuns de 3 ori; se reîncearcă la următoarea republicare');
 END LOOP;
 UPDATE public.portal_publish_jobs SET status='queued',locked_at=NULL,claim_token=NULL WHERE status='running' AND cancelled_at IS NULL AND locked_at<now()-lease AND attempts<3;
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
CREATE OR REPLACE FUNCTION public.finish_portal_publish_job(_id uuid,_token uuid,_status text,_ok boolean,_action text,_message text,_retry_ms integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _status NOT IN ('queued','done','error') THEN RAISE EXCEPTION 'invalid result'; END IF;
 UPDATE public.portal_publish_jobs SET status=_status,locked_at=NULL,claim_token=NULL,result_ok=_ok,result_action=_action,result_message=left(_message,500),finished_at=CASE WHEN _status='queued' THEN NULL ELSE now() END,next_attempt_at=CASE WHEN _status='queued' THEN greatest(now()+make_interval(secs=>coalesce(_retry_ms,0)/1000.0),coalesce((SELECT paused_until FROM public.portal_relay_health WHERE id AND portal_publish_jobs.portal_key IN ('imobiliare_ro','vdi')),now())) ELSE next_attempt_at END
 WHERE id=_id AND claim_token=_token AND status='running' AND cancelled_at IS NULL;
 RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.cancel_portal_republish_batch(_batch uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.portal_republish_batches; n integer;
BEGIN
 SELECT * INTO b FROM public.portal_republish_batches WHERE id=_batch FOR UPDATE;
 IF NOT FOUND OR NOT (public.is_superadmin() OR (b.organization_id=public.current_org() AND (b.requested_by=auth.uid() OR public.is_org_admin(b.organization_id)))) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF b.status<>'running' THEN RETURN 0; END IF;
 IF b.created_at>=now()-interval '30 minutes' OR EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND finished_at>=now()-interval '10 minutes') THEN RAISE EXCEPTION 'Republicarea nu este blocată'; END IF;
 UPDATE public.portal_publish_jobs SET status='done',cancelled_at=now(),locked_at=NULL,claim_token=NULL,finished_at=now(),result_ok=false,result_action='cancelled',result_message='Anulat: Oprește restul',contact_update_requested_by=NULL,followup_at=NULL WHERE republish_batch_id=b.id AND status IN ('queued','running');
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.portal_republish_batches SET status='done',finished_at=now(),succeeded=(SELECT count(*) FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND status='done' AND coalesce(result_action,'') NOT IN ('skipped','cancelled')),failed=(SELECT count(*) FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND status='error'),skipped=jsonb_array_length(b.skipped_items)+(SELECT count(*) FROM public.portal_publish_jobs WHERE republish_batch_id=b.id AND result_action IN ('skipped','cancelled')) WHERE id=b.id;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.record_portal_relay_response(boolean),public.claim_portal_relay_probe(),public.finish_portal_publish_job(uuid,uuid,text,boolean,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_portal_relay_response(boolean),public.claim_portal_relay_probe(),public.finish_portal_publish_job(uuid,uuid,text,boolean,text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_portal_republish_batch(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_portal_republish_batch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_portal_publish_jobs(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_portal_publish_jobs(integer,integer) TO service_role;