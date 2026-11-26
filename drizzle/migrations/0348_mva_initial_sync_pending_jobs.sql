ALTER TABLE public.mva_initial_syncs ADD COLUMN pending_property_ids uuid[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.start_mva_initial_sync(_org uuid, _actor uuid, _hash text, _encrypted text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run_id uuid; pending_ids uuid[];
BEGIN
 PERFORM 1 FROM public.portal_connections WHERE organization_id=_org AND portal='mvaimobiliare' AND activated=true AND portal_credentials_encrypted=_encrypted FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conexiunea mvaimobiliare.ro s-a schimbat. Repetă testul.'; END IF;
 INSERT INTO public.mva_initial_syncs(organization_id,requested_by,credential_hash) VALUES(_org,_actor,_hash)
 ON CONFLICT(organization_id,credential_hash) DO NOTHING RETURNING id INTO run_id;
 IF run_id IS NULL THEN RETURN NULL; END IF;
 WITH candidates AS (
 SELECT p.id FROM public.properties p JOIN public.portal_publications pp ON pp.property_id=p.id AND pp.organization_id=_org AND pp.portal_key='mvaimobiliare' AND pp.enabled=true
 WHERE p.organization_id=_org AND p.deleted_at IS NULL
 ), inserted AS (
 INSERT INTO public.portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,mva_sync_id,next_attempt_at)
 SELECT _org,id,'mvaimobiliare',true,true,_actor,false,'apply',run_id,now()+interval '1 second'*(row_number() OVER(ORDER BY id)-1) FROM candidates
 ON CONFLICT(property_id,portal_key) WHERE status IN ('queued','running') DO NOTHING RETURNING property_id
 ) SELECT coalesce(array_agg(c.id),'{}') INTO pending_ids FROM candidates c WHERE NOT EXISTS(SELECT 1 FROM inserted i WHERE i.property_id=c.id);
 UPDATE public.mva_initial_syncs SET pending_property_ids=pending_ids WHERE id=run_id;
 PERFORM public.portal_publish_arm();
 RETURN run_id;
END $$;
REVOKE ALL ON FUNCTION public.start_mva_initial_sync(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_mva_initial_sync(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.enqueue_mva_initial_pending(_id uuid,_token uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.mva_initial_syncs; n integer;
BEGIN
 SELECT * INTO r FROM public.mva_initial_syncs WHERE id=_id AND claim_token=_token AND phase='waiting' FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 INSERT INTO public.portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,mva_sync_id)
 SELECT r.organization_id,p.id,'mvaimobiliare',true,true,r.requested_by,false,'apply',r.id FROM public.properties p
 JOIN public.portal_publications pp ON pp.property_id=p.id AND pp.organization_id=r.organization_id AND pp.portal_key='mvaimobiliare' AND pp.enabled=true
 WHERE p.id=ANY(r.pending_property_ids) AND p.organization_id=r.organization_id AND p.deleted_at IS NULL
 ON CONFLICT(property_id,portal_key) WHERE status IN ('queued','running') DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE organization_id=r.organization_id AND portal_key='mvaimobiliare' AND status IN ('queued','running') AND mva_sync_id IS DISTINCT FROM r.id) THEN
 RAISE EXCEPTION 'O publicare mvaimobiliare.ro este deja în curs.'; END IF;
 UPDATE public.mva_initial_syncs SET pending_property_ids='{}',locked_until=NULL WHERE id=r.id;
 IF n>0 THEN PERFORM public.portal_publish_arm(); END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_mva_initial_pending(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_mva_initial_pending(uuid,uuid) TO service_role;