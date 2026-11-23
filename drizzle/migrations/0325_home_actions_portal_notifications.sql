CREATE TABLE public.home_action_preferences (user_id uuid NOT NULL, organization_id uuid NOT NULL, action_key text NOT NULL, ignored boolean NOT NULL DEFAULT false, snoozed_until timestamptz, PRIMARY KEY(user_id, action_key));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_action_preferences TO authenticated;
GRANT ALL ON public.home_action_preferences TO service_role;
ALTER TABLE public.home_action_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_home_actions ON public.home_action_preferences FOR ALL TO authenticated USING(user_id=auth.uid() AND organization_id=public.current_org()) WITH CHECK(user_id=auth.uid() AND organization_id=public.current_org());
ALTER TABLE public.notifications ADD COLUMN portal_property_id uuid, ADD COLUMN portal_key text, ADD COLUMN portal_error_key text, ADD COLUMN resolved_at timestamptz;
ALTER TABLE public.portal_publications ADD COLUMN alert_error_key text, ADD COLUMN alert_since timestamptz, ADD COLUMN alert_operation text, ADD COLUMN alert_temporary boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.portal_alert_class(_message text, _code text DEFAULT NULL, _http integer DEFAULT NULL) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN _http>=500 OR coalesce(_code,'') ~* 'TIMEOUT|NETWORK|TEMPORARY' OR coalesce(_message,'') ~* '5[0-9]{2}|521|temporar|timeout|timed out|nu a r.spuns|network|re.ea|fetch failed' THEN 'temporary' WHEN coalesce(_code,'') ~* 'VALIDATION|CONFIG|AUTH|MISSING|DISCONNECT' OR coalesce(_message,'') ~* 'valid|configur|lipse|lips.|obligator|maximum|prea multe|deconect|conectat|nepublicat|token|401|403|c.mp|datele' THEN 'action' ELSE NULL END $$;
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
fingerprint:=CASE WHEN kind='temporary' THEN 'temporary' ELSE md5(coalesce(_code,'')||':'||regexp_replace(coalesce(_message,''),'\s+',' ','g')) END;
IF pub.alert_error_key IS DISTINCT FROM fingerprint OR pub.alert_operation IS DISTINCT FROM _operation THEN
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
CREATE OR REPLACE FUNCTION public.portal_alert_log_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.operation IN ('publish','update','republish','sync','activate') THEN PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal,NEW.operation,NEW.success,NEW.error_message,NEW.error_code,NEW.http_status); END IF; RETURN NEW; END $$;
CREATE TRIGGER portal_alert_log AFTER INSERT ON public.portal_operation_logs FOR EACH ROW EXECUTE FUNCTION public.portal_alert_log_trigger();
CREATE OR REPLACE FUNCTION public.portal_alert_publication_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.status IN ('published','in_feed') AND NEW.last_error IS NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.last_error IS DISTINCT FROM NEW.last_error) THEN PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal_key,'publish',true);
ELSIF NEW.enabled AND NEW.status='error' AND NEW.last_error IS NOT NULL AND (TG_OP='INSERT' OR OLD.last_error IS DISTINCT FROM NEW.last_error OR OLD.status IS DISTINCT FROM NEW.status) THEN PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal_key,'publish',false,NEW.last_error);
END IF; RETURN NEW; END $$;
CREATE TRIGGER portal_alert_publication AFTER INSERT OR UPDATE OF status,last_error ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.portal_alert_publication_trigger();
CREATE OR REPLACE FUNCTION public.suppress_legacy_portal_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type IN ('portal_failure','portal_publish_error') AND NEW.portal_error_key IS NULL THEN RETURN NULL; END IF; RETURN NEW; END $$;
CREATE TRIGGER suppress_legacy_portal_notification BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.suppress_legacy_portal_notification();
CREATE OR REPLACE FUNCTION public.reconcile_portal_alerts() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p record; BEGIN
FOR p IN SELECT pub.organization_id,pub.property_id,pub.portal_key,pub.status,pub.last_error,prop.publish_status,i.status AS connection_status,i.last_error AS connection_error,pub.alert_temporary,pub.alert_since,pub.alert_operation FROM public.portal_publications pub JOIN public.properties prop ON prop.id=pub.property_id AND prop.organization_id=pub.organization_id LEFT JOIN public.portal_integrations i ON i.organization_id=pub.organization_id AND i.portal_key=pub.portal_key WHERE pub.enabled AND prop.status='active' AND prop.deleted_at IS NULL LOOP
IF p.alert_temporary AND p.alert_since<=now()-interval '24 hours' THEN PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,coalesce(p.alert_operation,'publish'),false,'eroare temporară');
ELSIF p.status='error' AND p.last_error IS NOT NULL THEN PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',false,p.last_error);
ELSIF p.connection_status IN ('disconnected','error') THEN PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',false,'Cont de portal deconectat','CONFIGURATION_ERROR');
ELSIF p.publish_status<>'published' THEN PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',false,'Anunț nepublicat cu portal bifat','VALIDATION_ERROR');
ELSIF p.status IN ('published','in_feed') AND p.last_error IS NULL THEN PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',true); END IF;
END LOOP; END $$;
REVOKE ALL ON FUNCTION public.reconcile_portal_alerts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_portal_alerts() TO service_role;
-- Legacy rows remain in the same notification system but are retired as resolved; the reconciler produces only current, deduplicated actionable alerts.
UPDATE public.notifications SET resolved_at=now(),read_at=coalesce(read_at,now()) WHERE type IN ('portal_failure','portal_publish_error') AND portal_error_key IS NULL;
SELECT cron.schedule('portal-alerts-hourly','0 * * * *','SELECT public.reconcile_portal_alerts()');