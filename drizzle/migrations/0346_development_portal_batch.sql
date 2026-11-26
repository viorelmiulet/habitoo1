ALTER TABLE public.development_portal_jobs ADD COLUMN changes jsonb;
ALTER TABLE public.development_portal_jobs ADD COLUMN batch_transaction text;
COMMENT ON COLUMN public.development_portal_jobs.changes IS 'Ordered portal_key/enabled changes; NULL means legacy single-portal job.';
COMMENT ON COLUMN public.development_portal_jobs.batch_transaction IS 'Internal transaction identity for atomic batch writes; never a client-controlled bypass.';
CREATE OR REPLACE FUNCTION public.development_portal_selection_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE did uuid; key text; active boolean; org uuid; ids uuid[]; BEGIN
 IF TG_OP='UPDATE' AND NEW.enabled=OLD.enabled THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN did:=OLD.development_id;key:=OLD.portal_key;active:=false; ELSE did:=NEW.development_id;key:=NEW.portal_key;active:=NEW.enabled;END IF;
 IF auth.uid() IS NULL OR NOT public.can_access_development(did,true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501';END IF;
 SELECT organization_id INTO org FROM public.developments WHERE id=did FOR UPDATE;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public.development_portal_jobs j WHERE j.development_id=did AND j.status='queued' AND j.requested_by=auth.uid() AND j.batch_transaction=pg_current_xact_id()::text AND j.changes @> jsonb_build_array(jsonb_build_object('portal_key',key,'enabled',active))) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.development_portal_jobs WHERE development_id=did AND status IN ('queued','running')) OR EXISTS(SELECT 1 FROM public.development_clone_jobs WHERE development_id=did AND operation<>'clone' AND status IN ('queued','running')) THEN RAISE EXCEPTION 'O operație este deja în curs pentru acest ansamblu.';END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids FROM public.properties WHERE development_id=did AND organization_id=org AND deleted_at IS NULL;
 INSERT INTO public.development_portal_jobs(organization_id,development_id,portal_key,enabled,requested_by,property_ids,total) VALUES(org,did,key,active,auth.uid(),ids,cardinality(ids));
 IF key='storia' AND current_setting('habitoo.storia_selection',true) IS DISTINCT FROM 'on' THEN PERFORM public.request_storia_development(did,NOT active);END IF;
 PERFORM public.partner_api_enqueue_sync(ARRAY[org]);PERFORM public.development_clone_kick();RETURN coalesce(NEW,OLD);END $$;
CREATE FUNCTION public.set_development_portal_selections(_development_id uuid,_actor_id uuid,_changes jsonb,_eligible_portals text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; effective jsonb; ids uuid[]; jid uuid; c record; first_change jsonb; BEGIN
 IF _changes IS NULL OR jsonb_typeof(_changes)<>'array' THEN RAISE EXCEPTION 'Trimite între 1 și 50 de modificări.';END IF;
 IF jsonb_array_length(_changes) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Trimite între 1 și 50 de modificări.';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_changes) v WHERE jsonb_typeof(v)<>'object' OR coalesce(jsonb_typeof(v->'portal_key'),'null')<>'string' OR coalesce(v->>'portal_key','') !~ '^[a-z0-9][a-z0-9_-]{0,99}$' OR coalesce(jsonb_typeof(v->'enabled'),'null')<>'boolean') THEN RAISE EXCEPTION 'Modificări de portal invalide.';END IF;
 IF (SELECT count(DISTINCT v->>'portal_key') FROM jsonb_array_elements(_changes) v)<>jsonb_array_length(_changes) THEN RAISE EXCEPTION 'Un portal poate apărea o singură dată.';END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',_actor_id,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',_actor_id::text,true);
 IF _actor_id IS NULL OR NOT public.can_access_development(_development_id,true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501';END IF;
 SELECT organization_id INTO org FROM public.developments WHERE id=_development_id AND deleted_at IS NULL FOR UPDATE;
 IF org IS NULL THEN RAISE EXCEPTION 'Ansamblu inaccesibil.';END IF;
 IF EXISTS(SELECT 1 FROM public.development_portal_jobs WHERE development_id=_development_id AND status IN ('queued','running')) OR EXISTS(SELECT 1 FROM public.development_clone_jobs WHERE development_id=_development_id AND operation<>'clone' AND status IN ('queued','running')) THEN RAISE EXCEPTION 'O operație este deja în curs pentru acest ansamblu.';END IF;
 FOR c IN SELECT * FROM jsonb_to_recordset(_changes) AS x(portal_key text,enabled boolean) LOOP
  IF c.enabled AND NOT (c.portal_key=ANY(coalesce(_eligible_portals,'{}'::text[]))) THEN RAISE EXCEPTION '%: Portalul nu este eligibil pentru ansamblu.',c.portal_key;END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(v ORDER BY ord),'[]'::jsonb) INTO effective FROM jsonb_array_elements(_changes) WITH ORDINALITY AS x(v,ord)
 WHERE coalesce((SELECT s.enabled FROM public.development_portal_selections s WHERE s.development_id=_development_id AND s.portal_key=v->>'portal_key'),false) IS DISTINCT FROM (v->>'enabled')::boolean;
 IF jsonb_array_length(effective)=0 THEN RETURN jsonb_build_object('ok',true,'jobId',NULL,'changes',effective);END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids FROM public.properties WHERE development_id=_development_id AND organization_id=org AND deleted_at IS NULL;
 first_change:=effective->0;
 INSERT INTO public.development_portal_jobs(organization_id,development_id,portal_key,enabled,requested_by,property_ids,total,changes,batch_transaction)
 VALUES(org,_development_id,first_change->>'portal_key',(first_change->>'enabled')::boolean,_actor_id,ids,cardinality(ids),effective,pg_current_xact_id()::text) RETURNING id INTO jid;
 FOR c IN SELECT * FROM jsonb_to_recordset(effective) AS x(portal_key text,enabled boolean) LOOP
  BEGIN
   INSERT INTO public.development_portal_selections(development_id,portal_key,enabled) VALUES(_development_id,c.portal_key,c.enabled) ON CONFLICT(development_id,portal_key) DO UPDATE SET enabled=EXCLUDED.enabled;
   IF c.portal_key='storia' THEN PERFORM public.request_storia_development(_development_id,NOT c.enabled);END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '%: %',c.portal_key,SQLERRM; END;
 END LOOP;
 PERFORM public.partner_api_enqueue_sync(ARRAY[org]);PERFORM public.development_clone_kick();
 RETURN jsonb_build_object('ok',true,'jobId',jid,'changes',effective);END $$;
REVOKE ALL ON FUNCTION public.set_development_portal_selections(uuid,uuid,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_development_portal_selections(uuid,uuid,jsonb,text[]) TO service_role;
CREATE OR REPLACE FUNCTION public.development_portal_job_step(_job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j record;p record;r jsonb;cs jsonb;BEGIN
 SELECT * INTO j FROM public.development_portal_jobs WHERE id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.processed>=j.total THEN RETURN NULL;END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',j.requested_by,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',j.requested_by::text,true);
 IF NOT public.can_access_development(j.development_id,true) THEN RAISE EXCEPTION 'Nu mai ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.properties WHERE id=j.property_ids[j.processed+1];
 SELECT coalesce(jsonb_agg(v ORDER BY ord),'[]'::jsonb) INTO cs FROM jsonb_array_elements(coalesce(j.changes,jsonb_build_array(jsonb_build_object('portal_key',j.portal_key,'enabled',j.enabled)))) WITH ORDINALITY x(v,ord) WHERE NOT (v->>'enabled')::boolean OR p.development_withdrawn_at IS NULL;
 r:=jsonb_build_object('index',j.processed,'propertyId',j.property_ids[j.processed+1],'reference',p.reference,'portals',coalesce((SELECT jsonb_agg(v->>'portal_key') FROM jsonb_array_elements(cs) v),'[]'::jsonb),'changes',cs,'skip',p.id IS NULL OR p.deleted_at IS NOT NULL OR p.organization_id<>j.organization_id OR p.development_id IS DISTINCT FROM j.development_id OR jsonb_array_length(cs)=0);
 UPDATE public.development_portal_jobs SET current_item=r WHERE id=j.id;RETURN r;END $$;
CREATE OR REPLACE FUNCTION public.development_portal_job_finish(_job_id uuid,_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j record;dname text;n int;s int;f int;reasons text;portals text;BEGIN
 UPDATE public.development_portal_jobs SET status=CASE WHEN _error IS NULL THEN 'done' ELSE 'error' END,last_error=_error,locked_until=NULL,finished_at=now() WHERE id=_job_id AND status IN ('queued','running') RETURNING * INTO j;IF j.id IS NULL THEN RETURN;END IF;
 SELECT name INTO dname FROM public.developments WHERE id=j.development_id;
 SELECT count(*) FILTER(WHERE coalesce((v->>'skip')::boolean,false)=false),count(*) FILTER(WHERE (v->>'skip')::boolean) INTO n,s FROM jsonb_array_elements(j.result->'succeeded') v;
 f:=jsonb_array_length(j.result->'failed')+greatest(j.total-j.processed,0);
 SELECT string_agg(DISTINCT v->>'reason','; ') INTO reasons FROM jsonb_array_elements(j.result->'failed') v;
 SELECT string_agg(v->>'portal_key',', ' ORDER BY ord) INTO portals FROM jsonb_array_elements(coalesce(j.changes,jsonb_build_array(jsonb_build_object('portal_key',j.portal_key,'enabled',j.enabled)))) WITH ORDINALITY x(v,ord);
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link) VALUES(j.organization_id,j.requested_by,'development_clone','Portaluri ansamblu — operație finalizată',format('%s — %s: %s unități procesate, %s sărite, %s eșuate.%s',dname,portals,n,s,f,CASE WHEN coalesce(_error,reasons) IS NULL THEN '' ELSE ' Motive: '||concat_ws('; ',_error,reasons) END),'/app/developments/'||j.development_id||'?tab=publishing');
 PERFORM public.partner_api_enqueue_sync(ARRAY[j.organization_id]);END $$;
REVOKE ALL ON FUNCTION public.development_portal_selection_changed(),public.development_portal_job_step(uuid),public.development_portal_job_finish(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.development_portal_job_step(uuid),public.development_portal_job_finish(uuid,text) TO service_role;