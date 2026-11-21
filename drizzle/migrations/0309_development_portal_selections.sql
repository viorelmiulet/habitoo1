CREATE TABLE public.development_portal_selections (
 development_id uuid NOT NULL REFERENCES public.developments(id), portal_key text NOT NULL,
 enabled boolean NOT NULL DEFAULT false, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(development_id,portal_key)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.development_portal_selections TO authenticated;
GRANT ALL ON public.development_portal_selections TO service_role;
ALTER TABLE public.development_portal_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_portal_selections_read ON public.development_portal_selections FOR SELECT TO authenticated USING(public.can_access_development(development_id));
CREATE POLICY development_portal_selections_write ON public.development_portal_selections FOR ALL TO authenticated USING(public.can_access_development(development_id,true)) WITH CHECK(public.can_access_development(development_id,true));
-- Additive backfill: union of existing enabled unit selections, with no queue triggers installed yet.
INSERT INTO public.development_portal_selections(development_id,portal_key,enabled)
SELECT DISTINCT p.development_id,pp.portal_key,true FROM public.properties p JOIN public.portal_publications pp ON pp.property_id=p.id
WHERE p.development_id IS NOT NULL AND p.deleted_at IS NULL AND pp.enabled
UNION SELECT development_id,'storia',true FROM public.development_portal_publications WHERE desired_active
ON CONFLICT(development_id,portal_key) DO NOTHING;

CREATE TABLE public.development_portal_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 development_id uuid NOT NULL REFERENCES public.developments(id), portal_key text NOT NULL, enabled boolean NOT NULL,
 requested_by uuid NOT NULL, property_ids uuid[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','error')),
 total integer NOT NULL DEFAULT 0, processed integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 current_item jsonb, result jsonb NOT NULL DEFAULT '{"succeeded":[],"failed":[]}', last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz, locked_until timestamptz
);
GRANT SELECT ON public.development_portal_jobs TO authenticated;
GRANT ALL ON public.development_portal_jobs TO service_role;
ALTER TABLE public.development_portal_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_portal_jobs_read ON public.development_portal_jobs FOR SELECT TO authenticated USING(public.can_access_development(development_id));
CREATE UNIQUE INDEX development_portal_jobs_active ON public.development_portal_jobs(development_id) WHERE status IN ('queued','running');

CREATE FUNCTION public.development_portal_selection_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.development_id IS DISTINCT FROM OLD.development_id OR NEW.portal_key IS DISTINCT FROM OLD.portal_key) THEN RAISE EXCEPTION 'Identitatea selecției nu poate fi schimbată.'; END IF;
 IF auth.uid() IS NULL OR NOT public.can_access_development(NEW.development_id,true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501'; END IF;
 NEW.updated_by:=auth.uid();NEW.updated_at:=now();RETURN NEW;END $$;
CREATE TRIGGER development_portal_selection_guard BEFORE INSERT OR UPDATE ON public.development_portal_selections FOR EACH ROW EXECUTE FUNCTION public.development_portal_selection_guard();

CREATE FUNCTION public.development_portal_selection_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE did uuid; key text; active boolean; org uuid; ids uuid[]; BEGIN
 IF TG_OP='UPDATE' AND NEW.enabled=OLD.enabled THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN did:=OLD.development_id;key:=OLD.portal_key;active:=false; ELSE did:=NEW.development_id;key:=NEW.portal_key;active:=NEW.enabled;END IF;
 IF auth.uid() IS NULL OR NOT public.can_access_development(did,true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501';END IF;
 SELECT organization_id INTO org FROM public.developments WHERE id=did FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.development_portal_jobs WHERE development_id=did AND status IN ('queued','running')) OR EXISTS(SELECT 1 FROM public.development_clone_jobs WHERE development_id=did AND operation<>'clone' AND status IN ('queued','running')) THEN RAISE EXCEPTION 'O operație este deja în curs pentru acest ansamblu.';END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids FROM public.properties WHERE development_id=did AND organization_id=org AND deleted_at IS NULL;
 INSERT INTO public.development_portal_jobs(organization_id,development_id,portal_key,enabled,requested_by,property_ids,total) VALUES(org,did,key,active,auth.uid(),ids,cardinality(ids));
 -- Nested Storia request writes the same selection; unchanged writes do not enqueue twice.
 IF key='storia' AND current_setting('habitoo.storia_selection',true) IS DISTINCT FROM 'on' THEN PERFORM public.request_storia_development(did,NOT active);END IF;
 PERFORM public.partner_api_enqueue_sync(ARRAY[org]);
 PERFORM public.development_clone_kick();RETURN coalesce(NEW,OLD);END $$;
CREATE TRIGGER development_portal_selection_changed AFTER INSERT OR UPDATE OR DELETE ON public.development_portal_selections FOR EACH ROW EXECUTE FUNCTION public.development_portal_selection_changed();

-- Keep legacy Storia buttons/RPCs in agreement with the checkbox without recursive requests.
DO $$ DECLARE def text;BEGIN
 def:=pg_get_functiondef('public.request_storia_development(uuid,boolean,uuid[])'::regprocedure);
 def:=replace(def,'PERFORM public.queue_storia_development(_id,','PERFORM set_config(''habitoo.storia_selection'',''on'',true); INSERT INTO public.development_portal_selections(development_id,portal_key,enabled) VALUES(_id,''storia'',NOT _withdraw) ON CONFLICT(development_id,portal_key) DO UPDATE SET enabled=EXCLUDED.enabled; PERFORM set_config(''habitoo.storia_selection'',''off'',true); PERFORM public.queue_storia_development(_id,');
 EXECUTE def;END $$;

CREATE FUNCTION public.claim_development_portal_job() RETURNS SETOF public.development_portal_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 RETURN QUERY UPDATE public.development_portal_jobs SET status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),locked_until=now()+interval '2 minutes'
 WHERE id=(SELECT id FROM public.development_portal_jobs WHERE status='queued' OR (status='running' AND locked_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;END $$;
CREATE FUNCTION public.development_portal_job_step(_job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j record;p record;r jsonb;BEGIN
 SELECT * INTO j FROM public.development_portal_jobs WHERE id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.processed>=j.total THEN RETURN NULL;END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',j.requested_by,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',j.requested_by::text,true);
 IF NOT public.can_access_development(j.development_id,true) THEN RAISE EXCEPTION 'Nu mai ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.properties WHERE id=j.property_ids[j.processed+1];
 -- Always recheck withdrawals and membership, including resumed pending items.
 r:=jsonb_build_object('index',j.processed,'propertyId',j.property_ids[j.processed+1],'reference',p.reference,'portals',jsonb_build_array(j.portal_key),'skip',p.id IS NULL OR p.deleted_at IS NOT NULL OR p.organization_id<>j.organization_id OR p.development_id IS DISTINCT FROM j.development_id OR (j.enabled AND p.development_withdrawn_at IS NOT NULL));
 UPDATE public.development_portal_jobs SET current_item=r WHERE id=j.id;RETURN r;END $$;
CREATE FUNCTION public.development_portal_job_advance(_job_id uuid,_index integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j record;k text;BEGIN
 SELECT * INTO j FROM public.development_portal_jobs WHERE id=_job_id FOR UPDATE;IF j.id IS NULL OR j.status<>'running' OR j.processed<>_index OR j.current_item IS NULL THEN RETURN;END IF;
 k:=CASE WHEN _reason IS NULL THEN 'succeeded' ELSE 'failed' END;
 UPDATE public.development_portal_jobs SET result=result||jsonb_build_object(k,coalesce(result->k,'[]'::jsonb)||jsonb_build_array(current_item||jsonb_build_object('reason',_reason))),processed=_index+1,current_item=NULL,attempts=0 WHERE id=j.id;END $$;
CREATE FUNCTION public.development_portal_job_release(_job_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.development_portal_jobs SET status='queued',locked_until=NULL WHERE id=_job_id AND status='running';PERFORM public.development_clone_kick();END $$;
CREATE FUNCTION public.development_portal_job_finish(_job_id uuid,_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j record;dname text;n int;s int;f int;reasons text;BEGIN
 UPDATE public.development_portal_jobs SET status=CASE WHEN _error IS NULL THEN 'done' ELSE 'error' END,last_error=_error,locked_until=NULL,finished_at=now() WHERE id=_job_id AND status IN ('queued','running') RETURNING * INTO j;IF j.id IS NULL THEN RETURN;END IF;
 SELECT name INTO dname FROM public.developments WHERE id=j.development_id;
 SELECT count(*) FILTER(WHERE coalesce((v->>'skip')::boolean,false)=false),count(*) FILTER(WHERE (v->>'skip')::boolean) INTO n,s FROM jsonb_array_elements(j.result->'succeeded') v;
 f:=jsonb_array_length(j.result->'failed')+greatest(j.total-j.processed,0);
 SELECT string_agg(DISTINCT v->>'reason','; ') INTO reasons FROM jsonb_array_elements(j.result->'failed') v;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link) VALUES(j.organization_id,j.requested_by,'development_clone','Portaluri ansamblu — operație finalizată',format('%s — %s: %s unități procesate, %s sărite, %s eșuate.%s',dname,j.portal_key,n,s,f,CASE WHEN coalesce(_error,reasons) IS NULL THEN '' ELSE ' Motive: '||concat_ws('; ',_error,reasons) END),'/app/developments/'||j.development_id||'?tab=publishing');
 PERFORM public.partner_api_enqueue_sync(ARRAY[j.organization_id]);END $$;
REVOKE ALL ON FUNCTION public.claim_development_portal_job(),public.development_portal_job_step(uuid),public.development_portal_job_advance(uuid,integer,text),public.development_portal_job_release(uuid),public.development_portal_job_finish(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_development_portal_job(),public.development_portal_job_step(uuid),public.development_portal_job_advance(uuid,integer,text),public.development_portal_job_release(uuid),public.development_portal_job_finish(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.development_portal_selection_changed() FROM PUBLIC,anon,authenticated;

-- Prevent all enabling paths (including resumed clone jobs) from overriding the parent choice.
CREATE FUNCTION public.guard_development_portal_choice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE did uuid;BEGIN
 SELECT development_id INTO did FROM public.properties WHERE id=NEW.property_id;
 IF NEW.enabled AND did IS NOT NULL AND NEW.portal_key<>'agency_site' AND NOT EXISTS(SELECT 1 FROM public.development_portal_selections WHERE development_id=did AND portal_key=NEW.portal_key AND enabled) THEN RAISE EXCEPTION 'Portalul nu este bifat la ansamblu.';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_development_portal_choice BEFORE INSERT OR UPDATE ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.guard_development_portal_choice();
-- Block overlapping unit operations; allocations remain safe through the publication guard.
DO $$ DECLARE def text;BEGIN
 def:=pg_get_functiondef('public.start_development_unit_operation(uuid,uuid[],text)'::regprocedure);
 def:=replace(def,'IF _operation NOT IN','IF EXISTS(SELECT 1 FROM public.development_portal_jobs WHERE development_id=_development_id AND status IN (''queued'',''running'')) THEN RAISE EXCEPTION ''O operație este deja în curs pentru acest ansamblu.''; END IF; IF _operation NOT IN');EXECUTE def;END $$;