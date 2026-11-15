DROP TRIGGER IF EXISTS storia_fixed_expiry_listing ON public.portal_listings;
DROP TRIGGER IF EXISTS storia_fixed_expiry_renewal ON public.properties;
DROP FUNCTION IF EXISTS public.storia_fixed_expiry_on_listing();
DROP FUNCTION IF EXISTS public.storia_fixed_expiry_on_renewal();
DROP FUNCTION IF EXISTS public.storia_expire_due(timestamptz,integer);
DROP INDEX IF EXISTS public.storia_fixed_expiry_due;
COMMENT ON COLUMN public.portal_listings.expires_at IS 'DEPRECATED: unused fixed deadline; Storia outdated state alone decides expiration';
COMMENT ON COLUMN public.portal_listings.storia_advert_states IS 'Storia API state, informational valid_to and event timestamp per current advert UUID';
CREATE OR REPLACE FUNCTION public.storia_record_expiry(p_org uuid,p_property uuid,p_uuid text DEFAULT NULL,p_code text DEFAULT NULL,p_valid_to timestamptz DEFAULT NULL,p_event_at timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.properties; l public.portal_listings; refs text[]; ref text; states jsonb; a jsonb; changed integer; recipient uuid; reason text:='Expirat pe Storia (fără autoprelungire)';
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR p.deleted_at IS NOT NULL THEN RETURN p_code='outdated'; END IF;
 SELECT * INTO l FROM public.portal_listings WHERE property_id=p_property AND organization_id=p_org AND portal='storia' FOR UPDATE;
 IF NOT FOUND THEN RETURN p_code='outdated'; END IF;
 SELECT array_agg(lower(split_part(part,':',2))) INTO refs FROM unnest(string_to_array(coalesce(l.external_id,''),'|')) part WHERE split_part(part,':',1) IN ('SALE','RENT') AND split_part(part,':',2)<>'';
 IF p_uuid IS NULL OR NOT (lower(p_uuid)=ANY(coalesce(refs,ARRAY[]::text[]))) THEN RETURN p_code='outdated'; END IF;
 p_uuid:=lower(p_uuid);
 states:=coalesce(l.storia_advert_states,'{}'::jsonb);
 a:=coalesce(states->p_uuid,'{}'::jsonb);
 IF p_event_at IS NOT NULL AND ((a->>'event_at' IS NOT NULL AND p_event_at<(a->>'event_at')::timestamptz) OR (l.published_at IS NOT NULL AND p_event_at<l.published_at)) THEN RETURN p_code='outdated'; END IF;
 IF p_code IS NOT NULL THEN a:=a||jsonb_build_object('code',p_code); END IF;
 IF p_valid_to IS NOT NULL THEN a:=a||jsonb_build_object('valid_to',p_valid_to); END IF;
 IF p_event_at IS NOT NULL THEN a:=a||jsonb_build_object('event_at',p_event_at); END IF;
 states:=jsonb_set(states,ARRAY[p_uuid],a,true);
 UPDATE public.portal_listings SET storia_advert_states=states,valid_to=coalesce((SELECT max((value->>'valid_to')::timestamptz) FROM jsonb_each(states) WHERE key=ANY(refs)),l.valid_to),updated_at=now() WHERE id=l.id;
 IF p_code IS DISTINCT FROM 'outdated' THEN RETURN false; END IF;
 IF p.storia_auto_renew IS DISTINCT FROM false OR coalesce(array_length(refs,1),0)=0 THEN RETURN true; END IF;
 FOREACH ref IN ARRAY refs LOOP
  IF states->ref->>'code' IS DISTINCT FROM 'outdated' THEN RETURN true; END IF;
 END LOOP;
 UPDATE public.portal_publications SET enabled=false,status='disabled',last_error=NULL,last_synced_at=now(),updated_at=now() WHERE organization_id=p_org AND property_id=p_property AND portal_key='storia' AND enabled=true;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed=0 THEN RETURN true; END IF;
 UPDATE public.portal_listings SET status='withdrawn',withdraw_reason=reason,last_error=NULL,last_sync_at=now(),updated_at=now() WHERE id=l.id;
 INSERT INTO public.portal_operation_logs(organization_id,portal,property_id,operation,success,external_id,portal_response) VALUES(p_org,'storia',p_property,'expire',true,l.external_id,jsonb_build_object('reason',reason,'states',states));
 INSERT INTO public.audit_logs(organization_id,action,entity,entity_id,old_values,new_values) VALUES(p_org,'storia.expired_deselected','properties',p_property,jsonb_build_object('enabled',true),jsonb_build_object('portal','storia','enabled',false,'withdraw_reason',reason));
 recipient:=coalesce(p.assigned_to,p.created_by);
 IF recipient IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=recipient AND organization_id=p_org) THEN
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link) VALUES(p_org,recipient,'portal_info','Anunțul '||coalesce(p.title,'')||' a expirat pe Storia/OLX și a fost debifat.',reason,'/app/properties/'||p_property||'?tab=publishing');
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.storia_record_expiry(uuid,uuid,text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storia_record_expiry(uuid,uuid,text,text,timestamptz,timestamptz) TO service_role;