CREATE TABLE public.partner_api_webhooks(portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug),environment text NOT NULL CHECK(environment IN ('test','live')),url text NOT NULL,events text[] NOT NULL DEFAULT '{}',secret_encrypted text NOT NULL,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),generation uuid NOT NULL DEFAULT gen_random_uuid(),last_success_at timestamptz,consecutive_failures integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(portal,environment));
GRANT ALL ON public.partner_api_webhooks TO service_role;ALTER TABLE public.partner_api_webhooks ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_api_webhook_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),portal text NOT NULL,environment text NOT NULL,generation uuid NOT NULL,event jsonb NOT NULL,seq bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),available_at timestamptz NOT NULL DEFAULT now(),attempt integer NOT NULL DEFAULT 0,owner uuid,leased_until timestamptz,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','delivered','cancelled')),FOREIGN KEY(portal,environment) REFERENCES public.partner_api_webhooks(portal,environment) ON DELETE CASCADE,UNIQUE(portal,environment,generation,seq));
GRANT ALL ON public.partner_api_webhook_queue TO service_role;ALTER TABLE public.partner_api_webhook_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX partner_webhook_queue_due ON public.partner_api_webhook_queue(available_at) WHERE status='queued';
CREATE TABLE public.partner_api_webhook_deliveries(cursor_id bigserial PRIMARY KEY,id uuid NOT NULL UNIQUE,portal text NOT NULL,environment text NOT NULL,event text NOT NULL,seq bigint NOT NULL,http_status integer,duration_ms integer NOT NULL,attempt integer NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),error text);
GRANT SELECT ON public.partner_api_webhook_deliveries TO authenticated;GRANT ALL ON public.partner_api_webhook_deliveries TO service_role;GRANT USAGE,SELECT ON SEQUENCE public.partner_api_webhook_deliveries_cursor_id_seq TO service_role;
ALTER TABLE public.partner_api_webhook_deliveries ENABLE ROW LEVEL SECURITY;CREATE POLICY webhook_delivery_superadmin ON public.partner_api_webhook_deliveries FOR SELECT TO authenticated USING(public.is_superadmin());
CREATE INDEX partner_webhook_delivery_page ON public.partner_api_webhook_deliveries(portal,environment,cursor_id DESC);
-- Wake on event insert via the authenticated database webhook callback; retries reuse the existing Partner API minute callback.
CREATE FUNCTION public.partner_webhook_wake() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM net.http_post(url:='https://www.habitoo.ro/api/public/jobs/partner-webhooks',headers:=jsonb_build_object('Content-Type','application/json','x-cron-nonce',public.cron_nonce_issue('partner_webhooks')),body:='{}'::jsonb);
END $$;
CREATE FUNCTION public.partner_webhook_event_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE w partner_api_webhooks;env text;data jsonb;BEGIN
 env:=CASE WHEN NEW.organization_id='a7b50000-0000-4000-8000-000000000001' THEN 'test' ELSE 'live' END;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-webhook:'||NEW.portal||':'||env,0));
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=NEW.portal AND environment=env AND status='active' FOR UPDATE;
 IF NOT FOUND OR (cardinality(w.events)>0 AND NOT NEW.type=ANY(w.events)) THEN RETURN NEW;END IF;
 data:=jsonb_build_object('agency_id',NEW.organization_id);
 IF NEW.entity_type='listing' THEN data:=data||jsonb_build_object('listing_id',NEW.entity_id);ELSIF NEW.entity_type='agent' THEN data:=data||jsonb_build_object('agent_id',NEW.entity_id);END IF;
 INSERT INTO partner_api_webhook_queue(portal,environment,generation,seq,event) VALUES(NEW.portal,env,w.generation,NEW.seq,jsonb_build_object('id','habitoo-'||NEW.seq,'type',NEW.type,'seq',NEW.seq,'occurred_at',NEW.occurred_at,'data',data)) ON CONFLICT DO NOTHING;
 PERFORM partner_webhook_wake();RETURN NEW;
END $$;
CREATE TRIGGER partner_webhook_event AFTER INSERT ON public.partner_api_events FOR EACH ROW EXECUTE FUNCTION public.partner_webhook_event_enqueue();
CREATE FUNCTION public.partner_webhook_claim(_owner uuid,_portal text DEFAULT NULL,_environment text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q partner_api_webhook_queue;w partner_api_webhooks;BEGIN
 SELECT x.* INTO q FROM partner_api_webhook_queue x JOIN partner_api_webhooks c USING(portal,environment) JOIN dynamic_feed_portals p ON p.slug=c.portal
 WHERE x.status='queued' AND c.status='active' AND x.generation=c.generation AND p.active AND p.integration_mode IN ('api','both') AND x.available_at<=now() AND (x.leased_until IS NULL OR x.leased_until<=now()) AND (_portal IS NULL OR x.portal=_portal) AND (_environment IS NULL OR x.environment=_environment)
 AND NOT EXISTS(SELECT 1 FROM partner_api_webhook_queue earlier WHERE earlier.portal=x.portal AND earlier.environment=x.environment AND earlier.generation=x.generation AND earlier.status='queued' AND earlier.seq<x.seq)
 ORDER BY x.seq FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=q.portal AND environment=q.environment;
 UPDATE partner_api_webhook_queue SET owner=_owner,leased_until=now()+interval '60 seconds',attempt=attempt+1 WHERE id=q.id;
 RETURN jsonb_build_object('id',q.id,'portal',q.portal,'environment',q.environment,'generation',q.generation,'event',q.event,'seq',q.seq,'created_at',q.created_at,'attempt',q.attempt+1,'url',w.url,'secret_encrypted',w.secret_encrypted);
END $$;
CREATE FUNCTION public.partner_webhook_finish(_id uuid,_owner uuid,_delivery uuid,_ok boolean,_http integer,_duration integer,_error text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q partner_api_webhook_queue;w partner_api_webhooks;delay integer;BEGIN
 SELECT * INTO q FROM partner_api_webhook_queue WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR q.owner IS DISTINCT FROM _owner OR q.status<>'queued' OR q.leased_until<=now() THEN RETURN false;END IF;
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=q.portal AND environment=q.environment FOR UPDATE;
 IF NOT FOUND OR w.generation<>q.generation THEN RETURN false;END IF;
 INSERT INTO partner_api_webhook_deliveries(id,portal,environment,event,seq,http_status,duration_ms,attempt,error) VALUES(_delivery,q.portal,q.environment,q.event->>'type',q.seq,_http,GREATEST(_duration,0),q.attempt,left(_error,240));
 IF _ok THEN
 UPDATE partner_api_webhook_queue SET status='delivered',owner=NULL,leased_until=NULL WHERE id=q.id;
 UPDATE partner_api_webhooks SET last_success_at=now(),consecutive_failures=0 WHERE portal=q.portal AND environment=q.environment;
 ELSIF now()>=q.created_at+interval '24 hours' THEN
 UPDATE partner_api_webhooks SET status='suspended',consecutive_failures=consecutive_failures+1 WHERE portal=q.portal AND environment=q.environment;
 UPDATE partner_api_webhook_queue SET owner=NULL,leased_until=NULL WHERE id=q.id;
 INSERT INTO notifications(user_id,type,title,body,link) SELECT DISTINCT user_id,'system',CASE WHEN q.environment='test' THEN 'Test · Webhook suspendat' ELSE 'Webhook suspendat' END,'Portalul '||q.portal||' nu a primit evenimentele în 24 de ore.','/superadmin/portaluri-api' FROM user_roles WHERE role='superadmin';
 ELSE
 delay:=(ARRAY[60,300,1800,7200,21600,43200])[LEAST(q.attempt,6)];
 UPDATE partner_api_webhook_queue SET available_at=LEAST(now()+make_interval(secs=>delay),created_at+interval '24 hours'),owner=NULL,leased_until=NULL WHERE id=q.id;
 UPDATE partner_api_webhooks SET consecutive_failures=consecutive_failures+1 WHERE portal=q.portal AND environment=q.environment;
 END IF;RETURN true;
END $$;
CREATE FUNCTION public.partner_webhook_put(_portal text,_environment text,_url text,_events text[],_secret text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE w partner_api_webhooks;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-webhook:'||_portal||':'||_environment,0));
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=_portal AND environment=_environment FOR UPDATE;
 IF NOT FOUND AND _secret IS NULL THEN RETURN jsonb_build_object('retry',true);END IF;
 INSERT INTO partner_api_webhooks(portal,environment,url,events,secret_encrypted) VALUES(_portal,_environment,_url,_events,COALESCE(_secret,w.secret_encrypted)) ON CONFLICT(portal,environment) DO UPDATE SET url=excluded.url,events=excluded.events,secret_encrypted=excluded.secret_encrypted,status='active',consecutive_failures=0,generation=gen_random_uuid(),updated_at=now();
 UPDATE partner_api_webhook_queue SET status='cancelled',owner=NULL,leased_until=NULL WHERE portal=_portal AND environment=_environment AND status='queued';RETURN jsonb_build_object('saved',true);
END $$;
CREATE FUNCTION public.partner_webhook_test_enqueue(_portal text,_environment text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE w partner_api_webhooks;_seq bigint;_id uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-webhook:'||_portal||':'||_environment,0));
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=_portal AND environment=_environment AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 _seq:=nextval('partner_api_events_seq_seq');_id:=gen_random_uuid();
 INSERT INTO partner_api_webhook_queue(id,portal,environment,generation,seq,event) VALUES(_id,_portal,_environment,w.generation,_seq,jsonb_build_object('id',_id,'type','webhook.test','seq',_seq,'occurred_at',now(),'data',CASE WHEN _environment='test' THEN jsonb_build_object('agency_id','a7b50000-0000-4000-8000-000000000001') ELSE '{}'::jsonb END));RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.partner_webhook_wake(),public.partner_webhook_event_enqueue(),public.partner_webhook_claim(uuid,text,text),public.partner_webhook_finish(uuid,uuid,uuid,boolean,integer,integer,text),public.partner_webhook_put(text,text,text,text[],text),public.partner_webhook_test_enqueue(text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_webhook_wake(),public.partner_webhook_event_enqueue(),public.partner_webhook_claim(uuid,text,text),public.partner_webhook_finish(uuid,uuid,uuid,boolean,integer,integer,text),public.partner_webhook_put(text,text,text,text[],text),public.partner_webhook_test_enqueue(text,text) TO service_role;
ALTER FUNCTION public.partner_api_cleanup() RENAME TO partner_api_cleanup_before_webhooks;
CREATE FUNCTION public.partner_api_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.partner_api_cleanup_before_webhooks();DELETE FROM partner_api_webhook_deliveries WHERE occurred_at<now()-interval '14 days';DELETE FROM partner_api_webhook_queue WHERE created_at<now()-interval '14 days' AND status<>'queued';END $$;
REVOKE ALL ON FUNCTION public.partner_api_cleanup() FROM public,anon,authenticated;GRANT EXECUTE ON FUNCTION public.partner_api_cleanup() TO service_role;