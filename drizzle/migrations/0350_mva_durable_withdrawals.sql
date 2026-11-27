ALTER TABLE public.portal_publish_jobs ADD COLUMN mva_withdraw_idstr text;
ALTER TABLE public.portal_publish_jobs ADD COLUMN mva_withdraw_requested_at timestamptz;

CREATE FUNCTION public.request_mva_withdrawal(_org uuid, _property uuid, _actor uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.properties; j public.portal_publish_jobs; ref text; actor uuid; job_id uuid;
BEGIN
 SELECT * INTO p FROM public.properties WHERE id=_property AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proprietatea nu a fost găsită.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.portal_connections WHERE organization_id=_org AND portal='mvaimobiliare' AND nullif(portal_credentials_encrypted,'') IS NOT NULL) THEN RETURN NULL; END IF;
 SELECT coalesce(l.external_id, pp.external_ref, p.reference, p.id::text), coalesce(_actor, pp.updated_by, pp.created_by, p.created_by, p.assigned_to)
 INTO ref, actor FROM public.portal_publications pp LEFT JOIN public.portal_listings l ON l.organization_id=pp.organization_id AND l.property_id=pp.property_id AND l.portal='mvaimobiliare'
 WHERE pp.organization_id=_org AND pp.property_id=_property AND pp.portal_key='mvaimobiliare';
 ref := coalesce(ref,p.reference,p.id::text); actor := coalesce(actor,_actor,p.created_by,p.assigned_to);
 SELECT * INTO j FROM public.portal_publish_jobs WHERE organization_id=_org AND property_id=_property AND portal_key='mvaimobiliare' AND status IN ('queued','running') FOR UPDATE;
 IF FOUND THEN
   job_id := j.id;
   IF j.enabled THEN
     IF j.status='queued' THEN
       UPDATE public.portal_publish_jobs SET enabled=false, operation='apply', sync_existing=false, promoted=false, mva_withdraw_idstr=ref, mva_withdraw_requested_at=NULL, attempts=0, next_attempt_at=now(), requested_by=coalesce(actor,requested_by) WHERE id=j.id;
     ELSE
       UPDATE public.portal_publish_jobs SET mva_withdraw_requested_at=coalesce(mva_withdraw_requested_at,now()), mva_withdraw_idstr=coalesce(mva_withdraw_idstr,ref) WHERE id=j.id;
     END IF;
   END IF;
 ELSE
   INSERT INTO public.portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,mva_withdraw_idstr)
   VALUES(_org,_property,'mvaimobiliare',false,false,actor,true,'apply',ref)
   ON CONFLICT(property_id,portal_key) WHERE status IN ('queued','running') DO NOTHING RETURNING id INTO job_id;
   IF job_id IS NULL THEN
     SELECT id INTO job_id FROM public.portal_publish_jobs WHERE property_id=_property AND portal_key='mvaimobiliare' AND status IN ('queued','running');
     UPDATE public.portal_publish_jobs SET mva_withdraw_requested_at=coalesce(mva_withdraw_requested_at,now()),mva_withdraw_idstr=coalesce(mva_withdraw_idstr,ref) WHERE id=job_id AND enabled=true;
   END IF;
 END IF;
 PERFORM public.portal_publish_arm();
 RETURN job_id;
END $$;
REVOKE ALL ON FUNCTION public.request_mva_withdrawal(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_mva_withdrawal(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.mva_publication_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.portal_key <> 'mvaimobiliare' OR NOT EXISTS(SELECT 1 FROM public.portal_connections WHERE organization_id=NEW.organization_id AND portal='mvaimobiliare' AND nullif(portal_credentials_encrypted,'') IS NOT NULL) THEN RETURN NEW; END IF;
 IF TG_WHEN='BEFORE' THEN
   IF NOT NEW.enabled THEN NEW.external_ref := coalesce(NEW.external_ref,OLD.external_ref); END IF;
 ELSIF OLD.enabled AND NOT NEW.enabled THEN
   PERFORM public.request_mva_withdrawal(NEW.organization_id,NEW.property_id,NEW.updated_by);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mva_publication_withdrawal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mva_publication_withdrawal() TO service_role;
CREATE TRIGGER mva_preserve_withdrawal_ref BEFORE UPDATE ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.mva_publication_withdrawal();
CREATE TRIGGER mva_enqueue_deselection AFTER UPDATE OF enabled ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.mva_publication_withdrawal();

CREATE FUNCTION public.mva_property_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.deleted_at IS NOT NULL OR NEW.publish_status IS DISTINCT FROM 'published' OR NEW.status NOT IN ('active','reserved','negotiation') OR NEW.development_withdrawn_at IS NOT NULL)
 AND (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.publish_status IS DISTINCT FROM NEW.publish_status OR OLD.status IS DISTINCT FROM NEW.status OR OLD.development_withdrawn_at IS DISTINCT FROM NEW.development_withdrawn_at)
 AND EXISTS(SELECT 1 FROM public.portal_publications WHERE organization_id=NEW.organization_id AND property_id=NEW.id AND portal_key='mvaimobiliare' AND enabled=true)
 THEN PERFORM public.request_mva_withdrawal(NEW.organization_id,NEW.id,coalesce(NEW.updated_by,NEW.created_by)); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mva_property_withdrawal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mva_property_withdrawal() TO service_role;
CREATE TRIGGER mva_enqueue_ineligible AFTER UPDATE OF status,publish_status,deleted_at,development_withdrawn_at ON public.properties FOR EACH ROW EXECUTE FUNCTION public.mva_property_withdrawal();

CREATE FUNCTION public.mva_drain_pending_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ref text;
BEGIN
 IF NEW.portal_key <> 'mvaimobiliare' OR NOT NEW.enabled OR NEW.mva_withdraw_requested_at IS NULL THEN RETURN NEW; END IF;
 IF TG_WHEN='BEFORE' AND NEW.status='queued' THEN
   NEW.enabled := false; NEW.operation := 'apply'; NEW.sync_existing := false; NEW.promoted := false; NEW.attempts := 0; NEW.next_attempt_at := now(); NEW.mva_withdraw_requested_at := NULL;
 ELSIF TG_WHEN='AFTER' AND NEW.status IN ('done','error') THEN
   SELECT coalesce(l.external_id,NEW.mva_withdraw_idstr) INTO ref FROM public.portal_listings l WHERE l.organization_id=NEW.organization_id AND l.property_id=NEW.property_id AND l.portal='mvaimobiliare';
   INSERT INTO public.portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,mva_withdraw_idstr)
   VALUES(NEW.organization_id,NEW.property_id,'mvaimobiliare',false,false,NEW.requested_by,true,'apply',coalesce(ref,NEW.mva_withdraw_idstr))
   ON CONFLICT(property_id,portal_key) WHERE status IN ('queued','running') DO NOTHING;
   PERFORM public.portal_publish_arm();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mva_drain_pending_withdrawal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mva_drain_pending_withdrawal() TO service_role;
CREATE TRIGGER mva_retarget_pending_retry BEFORE UPDATE OF status ON public.portal_publish_jobs FOR EACH ROW EXECUTE FUNCTION public.mva_drain_pending_withdrawal();
CREATE TRIGGER mva_drain_finished_publish AFTER UPDATE OF status ON public.portal_publish_jobs FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.mva_drain_pending_withdrawal();