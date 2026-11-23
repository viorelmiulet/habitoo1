CREATE OR REPLACE FUNCTION public.portal_alert_log_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.operation IN ('publish','update','republish','sync','activate') THEN
    PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal,NEW.operation,NEW.success,NEW.error_message,NEW.error_code,NEW.http_status);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Portal alert log skipped (SQLSTATE %)', SQLSTATE;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.portal_alert_publication_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT NEW.enabled THEN
    PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal_key,'publish',true);
  ELSIF NEW.status IN ('published','in_feed') AND NEW.last_error IS NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.last_error IS DISTINCT FROM NEW.last_error) THEN
    PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal_key,'publish',true);
  ELSIF NEW.status='error' AND NEW.last_error IS NOT NULL AND (TG_OP='INSERT' OR OLD.last_error IS DISTINCT FROM NEW.last_error OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.record_portal_alert(NEW.organization_id,NEW.property_id,NEW.portal_key,coalesce(NEW.alert_operation,'publish'),false,NEW.last_error);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Portal alert publication skipped (SQLSTATE %)', SQLSTATE;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS portal_alert_publication ON public.portal_publications;
CREATE TRIGGER portal_alert_publication AFTER INSERT OR UPDATE OF status,last_error,enabled ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.portal_alert_publication_trigger();

CREATE OR REPLACE FUNCTION public.reconcile_portal_alerts() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT pub.organization_id,pub.property_id,pub.portal_key,pub.enabled,pub.status,pub.last_error,
      prop.status AS property_status,prop.deleted_at,prop.publish_status,
      i.status AS connection_status,pub.alert_temporary,pub.alert_since,pub.alert_operation,
      latest.success AS latest_success,latest.created_at AS latest_at
    FROM public.portal_publications pub
    JOIN public.properties prop ON prop.id=pub.property_id AND prop.organization_id=pub.organization_id
    LEFT JOIN public.portal_integrations i ON i.organization_id=pub.organization_id AND i.portal_key=pub.portal_key
    LEFT JOIN LATERAL (
      SELECT l.success,l.created_at FROM public.portal_operation_logs l
      WHERE l.organization_id=pub.organization_id AND l.property_id=pub.property_id AND l.portal=pub.portal_key
        AND l.operation IN ('publish','update','republish','sync','activate')
      ORDER BY l.created_at DESC,l.id DESC LIMIT 1
    ) latest ON true
    WHERE pub.enabled OR pub.alert_error_key IS NOT NULL
  LOOP
    BEGIN
      IF NOT p.enabled OR p.property_status<>'active' OR p.deleted_at IS NOT NULL THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',true);
      ELSIF p.latest_success AND p.latest_at>=p.alert_since AND p.status IN ('published','in_feed') AND p.last_error IS NULL THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',true);
      ELSIF p.connection_status IN ('disconnected','error') THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',false,'Cont de portal deconectat','CONFIGURATION_ERROR');
      ELSIF p.publish_status<>'published' THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',false,'Anunț nepublicat cu portal bifat','VALIDATION_ERROR');
      ELSIF p.status='error' AND p.last_error IS NOT NULL THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,coalesce(p.alert_operation,'publish'),false,p.last_error);
      ELSIF p.alert_temporary AND p.alert_since<=now()-interval '24 hours' THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,coalesce(p.alert_operation,'publish'),false,'eroare temporară');
      ELSIF NOT p.alert_temporary AND p.status IN ('published','in_feed') AND p.last_error IS NULL THEN
        PERFORM public.record_portal_alert(p.organization_id,p.property_id,p.portal_key,'publish',true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Portal alert reconciliation item skipped (SQLSTATE %)', SQLSTATE;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_portal_alerts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_portal_alerts() TO service_role;
