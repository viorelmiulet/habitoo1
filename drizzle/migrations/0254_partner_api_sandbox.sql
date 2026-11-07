CREATE TABLE public.partner_api_sandbox_templates(kind text NOT NULL CHECK(kind IN ('listing','agent')),id uuid NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(kind,id));
GRANT ALL ON public.partner_api_sandbox_templates TO service_role;
ALTER TABLE public.partner_api_sandbox_templates ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_api_sandbox_data(portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug),kind text NOT NULL CHECK(kind IN ('lead','message','publication','stats')),external_id text NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',PRIMARY KEY(portal,kind,external_id));
GRANT SELECT ON public.partner_api_sandbox_data TO authenticated; GRANT ALL ON public.partner_api_sandbox_data TO service_role;
ALTER TABLE public.partner_api_sandbox_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY sandbox_superadmin_read ON public.partner_api_sandbox_data FOR SELECT TO authenticated USING(public.is_superadmin());
CREATE INDEX sandbox_expiry ON public.partner_api_sandbox_data(expires_at);
CREATE OR REPLACE FUNCTION public.partner_api_sandbox_reset(_portal text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:='a7b50000-0000-4000-8000-000000000001'; l record; a record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-sandbox:'||_portal,0));
 IF NOT EXISTS(SELECT 1 FROM dynamic_feed_portals WHERE slug=_portal AND active AND integration_mode IN ('api','both')) THEN RETURN jsonb_build_object('not_found',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations o JOIN partner_api_test_agencies t ON t.organization_id=o.id WHERE o.id=_org AND o.is_demo) THEN RAISE EXCEPTION 'Sandbox not provisioned'; END IF;
 IF (SELECT count(*) FROM partner_api_sandbox_templates WHERE kind='listing')<>12 OR (SELECT count(*) FROM partner_api_sandbox_templates WHERE kind='agent')<>2 THEN RAISE EXCEPTION 'Sandbox templates incomplete'; END IF;
 FOR l IN SELECT property_id FROM partner_api_listing_state s WHERE s.portal=_portal AND s.organization_id=_org AND s.visible AND NOT EXISTS(SELECT 1 FROM partner_api_sandbox_templates t WHERE t.kind='listing' AND t.id=s.property_id) LOOP
  UPDATE partner_api_listing_state SET visible=false,withdrawn_at=now(),updated_at=now(),payload=jsonb_build_object('id',l.property_id,'agency_id',_org,'status','withdrawn') WHERE portal=_portal AND property_id=l.property_id;
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'listing.withdrawn','listing',l.property_id,_org);
 END LOOP;
 DELETE FROM partner_api_sandbox_data WHERE portal=_portal;
 INSERT INTO partner_api_agency_state(portal,organization_id,active,activated_at) VALUES(_portal,_org,true,now()) ON CONFLICT(portal,organization_id) DO UPDATE SET active=true,deactivated_at=NULL,updated_at=now();
 FOR l IN SELECT id,payload FROM partner_api_sandbox_templates WHERE kind='listing' ORDER BY id LOOP
  INSERT INTO partner_api_listing_state(portal,property_id,organization_id,agent_id,content_hash,visible,payload) VALUES(_portal,l.id,_org,(l.payload->>'agent_id')::uuid,'sandbox',true,l.payload) ON CONFLICT(portal,property_id) DO UPDATE SET agent_id=excluded.agent_id,visible=true,payload=excluded.payload,content_hash='sandbox',withdrawn_at=NULL,updated_at=now();
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'listing.upserted','listing',l.id,_org);
 END LOOP;
 DELETE FROM partner_api_agent_state WHERE portal=_portal AND organization_id=_org;
 FOR a IN SELECT id,payload FROM partner_api_sandbox_templates WHERE kind='agent' ORDER BY id LOOP
  INSERT INTO partner_api_agent_state(portal,agent_id,organization_id,content_hash,payload) VALUES(_portal,a.id,_org,'sandbox',a.payload);
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'agent.updated','agent',a.id,_org);
 END LOOP;
 RETURN jsonb_build_object('reset',true,'listings',12,'agents',2,'agency_id',_org);
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_sandbox_simulate(_portal text,_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:='a7b50000-0000-4000-8000-000000000001'; _id uuid; _payload jsonb; _seq bigint; _type text; _entity text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-sandbox:'||_portal,0));
 IF NOT EXISTS(SELECT 1 FROM partner_api_agency_state s JOIN organizations o ON o.id=s.organization_id JOIN partner_api_test_agencies t ON t.organization_id=o.id WHERE s.portal=_portal AND s.organization_id=_org AND s.active AND o.is_demo) THEN RETURN jsonb_build_object('not_found',true); END IF;
 IF _action='agent_update' THEN
  SELECT agent_id,payload INTO _id,_payload FROM partner_api_agent_state WHERE portal=_portal AND organization_id=_org ORDER BY agent_id LIMIT 1 FOR UPDATE;
  IF _id IS NULL THEN RETURN jsonb_build_object('not_found',true); END IF;
  _payload:=jsonb_set(_payload,'{position}',to_jsonb('Agent Demo — actualizat '||to_char(clock_timestamp(),'HH24:MI:SS.MS')));
  UPDATE partner_api_agent_state SET payload=_payload,updated_at=now() WHERE portal=_portal AND agent_id=_id;
  _type:='agent.updated'; _entity:='agent';
 ELSIF _action IN ('listing_update','listing_withdraw','listing_create') THEN
  SELECT property_id,payload INTO _id,_payload FROM partner_api_listing_state WHERE portal=_portal AND organization_id=_org AND visible ORDER BY property_id LIMIT 1 FOR UPDATE;
  IF _id IS NULL THEN SELECT id,payload INTO _id,_payload FROM partner_api_sandbox_templates WHERE kind='listing' ORDER BY id LIMIT 1; END IF;
  IF _action='listing_create' THEN
   _id:=gen_random_uuid(); _payload:=_payload||jsonb_build_object('id',_id,'reference','TEST-'||left(_id::text,8),'title','[Test] Anunț demo nou','created_at',now(),'status','active');
   INSERT INTO partner_api_listing_state(portal,property_id,organization_id,agent_id,content_hash,visible,payload) VALUES(_portal,_id,_org,(_payload->>'agent_id')::uuid,'sandbox',true,_payload);
  ELSIF _action='listing_withdraw' THEN
   IF NOT EXISTS(SELECT 1 FROM partner_api_listing_state WHERE portal=_portal AND property_id=_id AND visible) THEN RETURN jsonb_build_object('not_found',true); END IF;
   _payload:=jsonb_build_object('id',_id,'reference',_payload->>'reference','agency_id',_org,'agent_id',_payload->>'agent_id','status','withdrawn');
   UPDATE partner_api_listing_state SET visible=false,payload=_payload,withdrawn_at=now(),updated_at=now() WHERE portal=_portal AND property_id=_id;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM partner_api_listing_state WHERE portal=_portal AND property_id=_id AND visible) THEN RETURN jsonb_build_object('not_found',true); END IF;
   _payload:=jsonb_set(_payload,'{title}',to_jsonb('[Test] Anunț actualizat '||to_char(clock_timestamp(),'HH24:MI:SS.MS')));
   UPDATE partner_api_listing_state SET payload=_payload,updated_at=now() WHERE portal=_portal AND property_id=_id;
  END IF;
  _type:=CASE WHEN _action='listing_withdraw' THEN 'listing.withdrawn' ELSE 'listing.upserted' END; _entity:='listing';
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,_type,_entity,_id,_org) RETURNING seq INTO _seq;
 RETURN jsonb_build_object('id',_id,'type',_type,'seq',_seq,'agency_id',_org);
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_sandbox_write(_portal text,_kind text,_external text,_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r partner_api_sandbox_data; _new uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-sandbox:'||_portal,0));
 IF NOT EXISTS(SELECT 1 FROM dynamic_feed_portals WHERE slug=_portal AND active AND integration_mode IN ('api','both')) THEN RETURN jsonb_build_object('not_found',true); END IF;
 DELETE FROM partner_api_sandbox_data WHERE portal=_portal AND kind=_kind AND external_id=_external AND expires_at<=now();
 SELECT * INTO r FROM partner_api_sandbox_data WHERE portal=_portal AND kind=_kind AND external_id=_external FOR UPDATE;
 IF FOUND AND _kind IN ('lead','message') THEN RETURN jsonb_build_object('id',r.id,'deduplicated',true,'test',true); END IF;
 IF FOUND AND _kind='publication' AND (r.payload->>'occurred_at')::timestamptz > (_payload->>'occurred_at')::timestamptz THEN RETURN jsonb_build_object('id',r.id,'applied',false,'test',true); END IF;
 INSERT INTO partner_api_sandbox_data(portal,kind,external_id,payload) VALUES(_portal,_kind,_external,_payload||jsonb_build_object('test',true,'label','Test')) ON CONFLICT(portal,kind,external_id) DO UPDATE SET payload=excluded.payload,expires_at=now()+interval '30 days' RETURNING id INTO _new;
 INSERT INTO notifications(user_id,type,title,body,link) SELECT DISTINCT user_id,'system','Test · Partner API','Eveniment de test: '||_kind,'/superadmin/portaluri-api' FROM user_roles WHERE role='superadmin';
 RETURN jsonb_build_object('id',_new,'deduplicated',false,'applied',true,'test',true);
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_sandbox_on_portal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.active AND NEW.integration_mode IN ('api','both') AND EXISTS(SELECT 1 FROM partner_api_sandbox_templates) AND NOT EXISTS(SELECT 1 FROM partner_api_agency_state WHERE portal=NEW.slug AND organization_id='a7b50000-0000-4000-8000-000000000001') THEN PERFORM public.partner_api_sandbox_reset(NEW.slug); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER partner_api_sandbox_portal AFTER INSERT OR UPDATE ON public.dynamic_feed_portals FOR EACH ROW EXECUTE FUNCTION public.partner_api_sandbox_on_portal();
REVOKE ALL ON FUNCTION public.partner_api_sandbox_reset(text),public.partner_api_sandbox_simulate(text,text),public.partner_api_sandbox_write(text,text,text,jsonb),public.partner_api_sandbox_on_portal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_sandbox_reset(text),public.partner_api_sandbox_simulate(text,text),public.partner_api_sandbox_write(text,text,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.partner_api_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 DELETE FROM public.partner_api_rate_windows WHERE window_start<now()-interval '1 hour';
 DELETE FROM public.partner_api_idempotency WHERE expires_at<=now();
 DELETE FROM public.partner_api_request_logs WHERE created_at<now()-interval '30 days';
 DELETE FROM public.partner_api_sandbox_data WHERE expires_at<=now();
END $$;
COMMENT ON TABLE public.partner_api_sandbox_data IS 'Partner API test-only feedback and leads, labelled Test, no CRM ingestion or email; expires after 30 days; per-portal reset.';
COMMENT ON TABLE public.partner_api_sandbox_templates IS 'Fictitious API fixtures, not CRM properties/profiles; seed only through explicit provisioning.';