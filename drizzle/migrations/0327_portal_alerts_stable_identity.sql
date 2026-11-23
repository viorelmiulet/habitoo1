CREATE OR REPLACE FUNCTION public.record_portal_alert(_org uuid, _property uuid, _portal text, _operation text, _success boolean, _message text DEFAULT NULL, _code text DEFAULT NULL, _http integer DEFAULT NULL, _name text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pub public.portal_publications; kind text; fingerprint text; recipient uuid; label text; since_at timestamptz;
BEGIN
SELECT * INTO pub FROM public.portal_publications WHERE organization_id=_org AND property_id=_property AND portal_key=_portal FOR UPDATE;
IF _success THEN
 UPDATE public.portal_publications SET alert_error_key=NULL,alert_since=NULL,alert_operation=NULL,alert_temporary=false WHERE organization_id=_org AND property_id=_property AND portal_key=_portal;
 UPDATE public.notifications SET resolved_at=now(),read_at=coalesce(read_at,now()) WHERE organization_id=_org AND portal_property_id=_property AND portal_key=_portal AND type IN ('portal_failure','portal_publish_error') AND resolved_at IS NULL;
 RETURN;
END IF;
IF pub.id IS NULL OR NOT pub.enabled THEN RETURN; END IF;
kind:=public.portal_alert_class(_message,_code,_http); IF kind IS NULL THEN RETURN; END IF;
fingerprint:=CASE WHEN kind='temporary' THEN 'temporary' ELSE md5(coalesce(nullif(btrim(regexp_replace(coalesce(_message,''),'\s+',' ','g')),''),_code,'')) END;
IF pub.alert_error_key IS DISTINCT FROM fingerprint OR (kind='temporary' AND pub.alert_operation IS DISTINCT FROM _operation) THEN
 since_at:=now();
 UPDATE public.notifications SET resolved_at=now(),read_at=coalesce(read_at,now()) WHERE organization_id=_org AND portal_property_id=_property AND portal_key=_portal AND type IN ('portal_failure','portal_publish_error') AND resolved_at IS NULL;
ELSE since_at:=coalesce(pub.alert_since,now()); END IF;
UPDATE public.portal_publications SET alert_error_key=fingerprint,alert_since=since_at,alert_operation=_operation,alert_temporary=(kind='temporary') WHERE id=pub.id;
IF kind='temporary' AND since_at>now()-interval '24 hours' THEN RETURN; END IF;
label:=coalesce(nullif(_name,''),CASE _portal WHEN 'storia' THEN 'Storia' WHEN 'imobiliare_ro' THEN 'Imobiliare.ro' WHEN 'lacheie' THEN 'La Cheie' WHEN 'homepitch' THEN 'HomePitch' WHEN 'imospot' THEN 'Imospot' ELSE _portal END);
FOR recipient IN SELECT user_id FROM public.user_roles WHERE organization_id=_org AND role='agency_admin' UNION SELECT p.assigned_to FROM public.properties p JOIN public.profiles a ON a.id=p.assigned_to AND a.organization_id=_org AND a.is_active WHERE p.id=_property AND p.organization_id=_org AND p.deleted_at IS NULL LOOP
 IF recipient IS NULL THEN CONTINUE; END IF;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link,portal_property_id,portal_key,portal_error_key)
 SELECT _org,recipient,'portal_failure',CASE WHEN kind='temporary' THEN 'Portalul '||label||' nu răspunde de 24 h' ELSE label||': verifică publicarea anunțului' END,CASE WHEN kind='temporary' THEN 'Aceeași operație nu a reușit în ultimele 24 de ore.' ELSE 'Publicarea necesită corectarea datelor sau a configurării. Deschide anunțul pentru detalii.' END,'/app/properties/'||_property||'?tab=publishing',_property,_portal,fingerprint
 WHERE NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.user_id=recipient AND n.organization_id=_org AND n.portal_property_id=_property AND n.portal_key=_portal AND n.portal_error_key=fingerprint AND n.resolved_at IS NULL);
END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.record_portal_alert(uuid,uuid,text,text,boolean,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_portal_alert(uuid,uuid,text,text,boolean,text,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.suppress_legacy_portal_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.type IN ('portal_failure','portal_publish_error') AND NEW.portal_error_key IS NULL
   AND (NEW.portal_property_id IS NOT NULL OR NEW.link ~ '^/app/properties/[0-9a-fA-F-]{36}([/?#]|$)') THEN
   RETURN NULL;
 END IF;
 RETURN NEW;
END $$;
