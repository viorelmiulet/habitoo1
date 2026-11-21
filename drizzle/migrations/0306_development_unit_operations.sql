ALTER TABLE public.properties ADD COLUMN development_withdrawn_at timestamptz;
ALTER TABLE public.development_clone_jobs ADD COLUMN operation text NOT NULL DEFAULT 'clone' CHECK(operation IN ('clone','withdraw','republish','remove'));

CREATE FUNCTION public.guard_development_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.development_withdrawn_at IS DISTINCT FROM OLD.development_withdrawn_at AND current_setting('habitoo.development_operation',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Folosește operația din ansamblu.' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_development_withdrawal BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.guard_development_withdrawal();
CREATE FUNCTION public.guard_withdrawn_portal_selection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.enabled AND EXISTS(SELECT 1 FROM public.properties WHERE id=NEW.property_id AND development_withdrawn_at IS NOT NULL) THEN RAISE EXCEPTION 'Unitatea este retrasă de pe portaluri. Folosește Republică din ansamblu.'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_withdrawn_portal_selection BEFORE INSERT OR UPDATE ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawn_portal_selection();
CREATE OR REPLACE FUNCTION public.development_unit_storia_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u record; BEGIN
 FOR u IN SELECT * FROM public.storia_development_units WHERE property_id=NEW.id LOOP
 IF NEW.development_withdrawn_at IS NOT NULL OR NEW.development_id IS DISTINCT FROM u.development_id OR NEW.deleted_at IS NOT NULL OR NEW.status NOT IN ('active','reserved','negotiation') THEN PERFORM public.queue_storia_development(u.development_id,'unit_withdraw',auth.uid(),u.id);
 ELSE PERFORM public.queue_storia_development(u.development_id,'unit',auth.uid(),u.id); END IF; END LOOP; RETURN NEW; END $$;
-- A new independent copy must not inherit an old unit's withdrawal intent.
DO $$ DECLARE def text; BEGIN
 def:=pg_get_functiondef('public.clone_properties_to_development(uuid,uuid[])'::regprocedure);
 def:=replace(def,'''cloned_from_property_id''','''development_withdrawn_at'',''cloned_from_property_id''');
 EXECUTE def;
END $$;

CREATE FUNCTION public.start_development_unit_operation(_development_id uuid,_property_ids uuid[],_operation text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; ids uuid[]; jid uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.can_access_development(_development_id,true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501'; END IF;
 IF _operation NOT IN ('withdraw','republish','remove') THEN RAISE EXCEPTION 'Operație invalidă.'; END IF;
 SELECT organization_id INTO org FROM public.developments WHERE id=_development_id AND deleted_at IS NULL FOR UPDATE;
 SELECT array_agg(DISTINCT x) INTO ids FROM unnest(_property_ids) x;
 IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Selectează între 1 și 200 de copii.'; END IF;
 IF EXISTS(SELECT 1 FROM public.development_clone_jobs WHERE development_id=_development_id AND operation<>'clone' AND status IN ('queued','running')) THEN RAISE EXCEPTION 'O operație este deja în curs pentru acest ansamblu.'; END IF;
 IF (SELECT count(*) FROM public.properties p WHERE p.id=ANY(ids) AND p.organization_id=org AND p.development_id=_development_id AND p.cloned_from_property_id IS NOT NULL AND p.deleted_at IS NULL AND (public.is_superadmin() OR (p.organization_id=public.current_org() AND (public.is_org_admin() OR p.assigned_to=auth.uid())))) <> cardinality(ids) THEN RAISE EXCEPTION 'Unele copii nu sunt accesibile sau nu aparțin ansamblului.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.development_clone_jobs(organization_id,development_id,requested_by,property_ids,total,operation,result) VALUES(org,_development_id,auth.uid(),ids,cardinality(ids),_operation,'{"succeeded":[],"failed":[]}'::jsonb) RETURNING id INTO jid;
 PERFORM public.development_clone_kick(); RETURN jid; END $$;
REVOKE ALL ON FUNCTION public.start_development_unit_operation(uuid,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_development_unit_operation(uuid,uuid[],text) TO authenticated;

CREATE FUNCTION public.development_unit_operation_step(_job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record; p record; r jsonb; portals jsonb; BEGIN
 SELECT * INTO j FROM public.development_clone_jobs WHERE id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.operation='clone' OR j.processed>=j.total THEN RETURN NULL; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',j.requested_by,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',j.requested_by::text,true);
 IF NOT public.can_access_development(j.development_id,true) THEN RAISE EXCEPTION 'Nu mai ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=j.property_ids[j.processed+1] FOR UPDATE;
 IF p.id IS NULL OR p.organization_id<>j.organization_id OR p.development_id IS DISTINCT FROM j.development_id OR p.cloned_from_property_id IS NULL OR NOT(public.is_superadmin() OR (p.organization_id=public.current_org() AND (public.is_org_admin() OR p.assigned_to=auth.uid()))) THEN RAISE EXCEPTION 'Copia nu mai este accesibilă.' USING ERRCODE='42501'; END IF;
 IF j.current_item IS NOT NULL THEN RETURN j.current_item; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT key),'[]'::jsonb) INTO portals FROM (SELECT portal_key key FROM public.portal_publications WHERE property_id=p.id AND enabled UNION SELECT portal FROM public.portal_listings WHERE property_id=p.id AND status IN ('published','in_feed','pending') UNION SELECT 'storia' UNION SELECT 'agency_site') q;
 r:=jsonb_build_object('index',j.processed,'propertyId',p.id,'reference',p.reference,'portals',portals);
 PERFORM set_config('habitoo.development_operation','on',true);
 IF j.operation='remove' THEN
   IF p.deleted_at IS NULL THEN PERFORM public.delete_property(p.id); END IF;
 ELSIF p.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Copia este deja ștearsă.';
 ELSIF j.operation='withdraw' THEN UPDATE public.properties SET development_withdrawn_at=coalesce(development_withdrawn_at,now()) WHERE id=p.id;
 ELSE UPDATE public.properties SET development_withdrawn_at=NULL WHERE id=p.id;
 END IF;
 PERFORM set_config('habitoo.development_operation','off',true);
 UPDATE public.development_clone_jobs SET current_item=r WHERE id=j.id; RETURN r; END $$;

CREATE FUNCTION public.development_unit_operation_advance(_job_id uuid,_index integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record; item jsonb; BEGIN
 SELECT * INTO j FROM public.development_clone_jobs WHERE id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.operation='clone' OR j.status<>'running' OR j.processed<>_index THEN RETURN; END IF;
 item:=coalesce(j.current_item,jsonb_build_object('propertyId',j.property_ids[_index+1]));
 UPDATE public.development_clone_jobs SET result=jsonb_set(result,CASE WHEN _reason IS NULL THEN '{succeeded}' ELSE '{failed}' END,coalesce(result->CASE WHEN _reason IS NULL THEN 'succeeded' ELSE 'failed' END,'[]'::jsonb)||jsonb_build_array(item||jsonb_build_object('reason',_reason))),processed=_index+1,current_item=NULL,attempts=0 WHERE id=_job_id; END $$;

CREATE FUNCTION public.development_unit_operation_finish(_job_id uuid,_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record; dname text; n int; f int; reasons text; BEGIN
 UPDATE public.development_clone_jobs SET status=CASE WHEN _error IS NULL THEN 'done' ELSE 'error' END,last_error=_error,finished_at=now(),locked_until=NULL WHERE id=_job_id AND operation<>'clone' AND status IN ('queued','running') RETURNING * INTO j;
 IF j.id IS NULL THEN RETURN; END IF;
 SELECT name INTO dname FROM public.developments WHERE id=j.development_id;
 n:=jsonb_array_length(j.result->'succeeded'); f:=jsonb_array_length(j.result->'failed')+greatest(j.total-j.processed,0);
 SELECT string_agg(DISTINCT v->>'reason','; ') INTO reasons FROM jsonb_array_elements(j.result->'failed') v;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link) VALUES(j.organization_id,j.requested_by,'development_clone','Operație ansamblu finalizată',format('%s — %s: %s unități procesate, %s eșuate.%s',dname,CASE j.operation WHEN 'withdraw' THEN 'Retragere' WHEN 'republish' THEN 'Republicare' ELSE 'Scoatere din ansamblu' END,n,f,CASE WHEN coalesce(_error,reasons) IS NULL THEN '' ELSE ' Motive: '||concat_ws('; ',_error,reasons) END),'/app/developments/'||j.development_id||'?tab=units'); END $$;
REVOKE ALL ON FUNCTION public.development_unit_operation_step(uuid),public.development_unit_operation_advance(uuid,integer,text),public.development_unit_operation_finish(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.development_unit_operation_step(uuid),public.development_unit_operation_advance(uuid,integer,text),public.development_unit_operation_finish(uuid,text) TO service_role;