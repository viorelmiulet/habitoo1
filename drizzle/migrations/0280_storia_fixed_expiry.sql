ALTER TABLE public.portal_listings ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN public.portal_listings.storia_advert_states IS 'DEPRECATED: fixed 30-day expires_at replaces API-driven expiration decisions';
CREATE OR REPLACE FUNCTION public.storia_fixed_expiry_on_listing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.portal='storia' THEN
  IF TG_OP='INSERT' OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
   NEW.expires_at := CASE WHEN (SELECT storia_auto_renew FROM public.properties WHERE id=NEW.property_id AND organization_id=NEW.organization_id) IS FALSE AND NEW.published_at IS NOT NULL THEN NEW.published_at + interval '720 hours' ELSE NULL END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storia_fixed_expiry_listing BEFORE INSERT OR UPDATE OF published_at ON public.portal_listings FOR EACH ROW EXECUTE FUNCTION public.storia_fixed_expiry_on_listing();
CREATE OR REPLACE FUNCTION public.storia_fixed_expiry_on_renewal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.storia_auto_renew IS DISTINCT FROM OLD.storia_auto_renew THEN
 UPDATE public.portal_listings SET expires_at=CASE WHEN NEW.storia_auto_renew IS FALSE AND published_at IS NOT NULL THEN published_at + interval '720 hours' ELSE NULL END WHERE property_id=NEW.id AND organization_id=NEW.organization_id AND portal='storia';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storia_fixed_expiry_renewal AFTER UPDATE OF storia_auto_renew ON public.properties FOR EACH ROW EXECUTE FUNCTION public.storia_fixed_expiry_on_renewal();
UPDATE public.portal_listings l SET expires_at=l.published_at + interval '720 hours' FROM public.properties p WHERE l.portal='storia' AND l.property_id=p.id AND l.organization_id=p.organization_id AND p.storia_auto_renew IS FALSE AND l.published_at IS NOT NULL;
CREATE INDEX storia_fixed_expiry_due ON public.portal_listings(expires_at) WHERE portal='storia' AND expires_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.storia_record_expiry(p_org uuid,p_property uuid,p_uuid text DEFAULT NULL,p_code text DEFAULT NULL,p_valid_to timestamptz DEFAULT NULL,p_event_at timestamptz DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_valid_to IS NOT NULL THEN UPDATE public.portal_listings SET valid_to=p_valid_to WHERE organization_id=p_org AND property_id=p_property AND portal='storia' AND (p_event_at IS NULL OR last_event_at IS NULL OR p_event_at>=last_event_at); END IF;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.storia_expire_due(p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 1000) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidate record; p public.properties; l public.portal_listings; changed integer; total integer:=0; recipient uuid; reason text:='Expirat pe Storia (fără autoprelungire)';
BEGIN
 FOR candidate IN SELECT x.id,x.property_id,x.organization_id FROM public.portal_listings x JOIN public.portal_publications pp ON pp.organization_id=x.organization_id AND pp.property_id=x.property_id AND pp.portal_key='storia' AND pp.enabled=true WHERE x.portal='storia' AND x.expires_at<=p_now ORDER BY x.expires_at,x.id LIMIT greatest(1,least(p_limit,10000)) LOOP
 SELECT * INTO p FROM public.properties WHERE id=candidate.property_id AND organization_id=candidate.organization_id FOR UPDATE;
 IF NOT FOUND OR p.deleted_at IS NOT NULL OR p.storia_auto_renew IS DISTINCT FROM false THEN CONTINUE; END IF;
 SELECT * INTO l FROM public.portal_listings WHERE id=candidate.id FOR UPDATE;
 IF l.expires_at IS NULL OR l.expires_at>p_now THEN CONTINUE; END IF;
 UPDATE public.portal_publications SET enabled=false,status='disabled',last_error=NULL,last_synced_at=p_now,updated_at=p_now WHERE organization_id=p.organization_id AND property_id=p.id AND portal_key='storia' AND enabled=true;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed=0 THEN CONTINUE; END IF;
 UPDATE public.portal_listings SET status='withdrawn',withdraw_reason=reason,last_error=NULL,last_sync_at=p_now,updated_at=p_now WHERE id=l.id;
 INSERT INTO public.portal_operation_logs(organization_id,portal,property_id,operation,success,external_id,portal_response) VALUES(p.organization_id,'storia',p.id,'expire',true,l.external_id,jsonb_build_object('reason',reason,'expires_at',l.expires_at));
 INSERT INTO public.audit_logs(organization_id,action,entity,entity_id,old_values,new_values) VALUES(p.organization_id,'storia.expired_deselected','properties',p.id,jsonb_build_object('enabled',true),jsonb_build_object('portal','storia','enabled',false,'withdraw_reason',reason,'expires_at',l.expires_at));
 recipient:=coalesce(p.assigned_to,p.created_by);
 IF recipient IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=recipient AND organization_id=p.organization_id) THEN INSERT INTO public.notifications(organization_id,user_id,type,title,body,link) VALUES(p.organization_id,recipient,'portal_info','Anunțul '||coalesce(p.title,'')||' a expirat pe Storia/OLX și a fost debifat.',reason,'/app/properties/'||p.id||'?tab=publishing'); END IF;
 total:=total+1;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.storia_expire_due(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storia_expire_due(timestamptz,integer) TO service_role;