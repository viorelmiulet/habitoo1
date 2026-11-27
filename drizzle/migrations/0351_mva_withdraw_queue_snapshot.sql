CREATE OR REPLACE FUNCTION public.request_mva_withdrawal(_org uuid, _property uuid, _actor uuid DEFAULT NULL)
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
   ELSE
     UPDATE public.portal_publish_jobs SET mva_withdraw_idstr=coalesce(mva_withdraw_idstr,ref) WHERE id=j.id;
   END IF;
 ELSE
   INSERT INTO public.portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,mva_withdraw_idstr)
   VALUES(_org,_property,'mvaimobiliare',false,false,actor,true,'apply',ref)
   ON CONFLICT(property_id,portal_key) WHERE status IN ('queued','running') DO NOTHING RETURNING id INTO job_id;
   IF job_id IS NULL THEN
     SELECT * INTO j FROM public.portal_publish_jobs WHERE property_id=_property AND portal_key='mvaimobiliare' AND status IN ('queued','running') FOR UPDATE;
     job_id := j.id;
     UPDATE public.portal_publish_jobs SET
       mva_withdraw_idstr=coalesce(mva_withdraw_idstr,ref),
       enabled=CASE WHEN status='queued' THEN false ELSE enabled END,
       operation=CASE WHEN status='queued' THEN 'apply' ELSE operation END,
       sync_existing=CASE WHEN status='queued' THEN false ELSE sync_existing END,
       mva_withdraw_requested_at=CASE WHEN status='running' AND enabled THEN coalesce(mva_withdraw_requested_at,now()) ELSE mva_withdraw_requested_at END
     WHERE id=job_id;
   END IF;
 END IF;
 PERFORM public.portal_publish_arm();
 RETURN job_id;
END $$;
REVOKE ALL ON FUNCTION public.request_mva_withdrawal(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_mva_withdrawal(uuid,uuid,uuid) TO service_role;