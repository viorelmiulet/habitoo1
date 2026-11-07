CREATE OR REPLACE FUNCTION public.partner_webhook_put(_portal text,_environment text,_url text,_events text[],_secret text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE w partner_api_webhooks;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-webhook:'||_portal||':'||_environment,0));
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=_portal AND environment=_environment FOR UPDATE;
 IF NOT FOUND AND _secret IS NULL THEN RETURN jsonb_build_object('retry',true);END IF;
 INSERT INTO partner_api_webhooks(portal,environment,url,events,secret_encrypted) VALUES(_portal,_environment,_url,_events,COALESCE(_secret,w.secret_encrypted)) ON CONFLICT(portal,environment) DO UPDATE SET url=excluded.url,events=excluded.events,secret_encrypted=excluded.secret_encrypted,status='active',consecutive_failures=0,generation=CASE WHEN partner_api_webhooks.status='suspended' THEN gen_random_uuid() ELSE partner_api_webhooks.generation END,updated_at=now();
 IF w.status='suspended' THEN
  UPDATE partner_api_webhook_queue SET status='cancelled',owner=NULL,leased_until=NULL WHERE portal=_portal AND environment=_environment AND status='queued';
 END IF;
 RETURN jsonb_build_object('saved',true);
END $$;