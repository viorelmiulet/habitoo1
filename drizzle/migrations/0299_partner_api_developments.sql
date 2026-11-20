CREATE TABLE IF NOT EXISTS public.partner_api_development_state(
  portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug),
  development_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  content_hash text NOT NULL,
  visible boolean NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  PRIMARY KEY(portal,development_id)
);
CREATE INDEX IF NOT EXISTS partner_api_development_state_cursor ON public.partner_api_development_state(portal,updated_at,development_id);
CREATE INDEX IF NOT EXISTS partner_api_development_state_org ON public.partner_api_development_state(portal,organization_id);
GRANT ALL ON public.partner_api_development_state TO service_role;
ALTER TABLE public.partner_api_development_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.partner_api_listing_state ADD COLUMN IF NOT EXISTS development_id uuid;

ALTER TABLE public.partner_api_events DROP CONSTRAINT IF EXISTS partner_api_events_type_check;
ALTER TABLE public.partner_api_events ADD CONSTRAINT partner_api_events_type_check CHECK (type IN ('listing.upserted','listing.withdrawn','agency.activated','agency.deactivated','agent.updated','development.upserted','development.withdrawn'));
ALTER TABLE public.partner_api_events DROP CONSTRAINT IF EXISTS partner_api_events_entity_type_check;
ALTER TABLE public.partner_api_events ADD CONSTRAINT partner_api_events_entity_type_check CHECK (entity_type IN ('listing','agency','agent','development'));

DROP TRIGGER IF EXISTS partner_api_enqueue ON public.developments;
CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.developments FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();
DROP TRIGGER IF EXISTS partner_api_enqueue ON public.development_images;
CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.development_images FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();

DROP FUNCTION IF EXISTS public.partner_api_apply_sync(text,jsonb,jsonb,jsonb);
CREATE OR REPLACE FUNCTION public.partner_api_apply_sync(_portal text, _agencies jsonb, _listings jsonb, _agents jsonb, _developments jsonb DEFAULT '[]'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; l record; g record; d record;
BEGIN
  FOR a IN SELECT * FROM jsonb_to_recordset(COALESCE(_agencies,'[]')) AS x(organization_id uuid, active boolean) WHERE x.active LOOP
    INSERT INTO public.partner_api_agency_state (portal, organization_id, active, activated_at, updated_at)
    VALUES (_portal, a.organization_id, true, now(), now())
    ON CONFLICT (portal, organization_id) DO UPDATE SET active = true, activated_at = now(), deactivated_at = NULL, updated_at = now();
    INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id) VALUES (_portal, 'agency.activated', 'agency', a.organization_id, a.organization_id);
  END LOOP;
  FOR l IN SELECT * FROM jsonb_to_recordset(COALESCE(_listings,'[]')) AS x(property_id uuid, organization_id uuid, agent_id uuid, content_hash text, visible boolean, payload jsonb, development_id uuid) LOOP
    IF NOT l.visible AND NOT EXISTS (SELECT 1 FROM public.partner_api_listing_state s WHERE s.portal = _portal AND s.property_id = l.property_id AND s.visible) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.partner_api_listing_state (portal, property_id, organization_id, agent_id, content_hash, visible, payload, first_visible_at, updated_at, withdrawn_at, development_id)
    VALUES (_portal, l.property_id, l.organization_id, l.agent_id, l.content_hash, l.visible, l.payload, now(), now(), CASE WHEN l.visible THEN NULL ELSE now() END, l.development_id)
    ON CONFLICT (portal, property_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, agent_id = EXCLUDED.agent_id,
      content_hash = EXCLUDED.content_hash, visible = EXCLUDED.visible, payload = EXCLUDED.payload, updated_at = now(),
      withdrawn_at = CASE WHEN EXCLUDED.visible THEN NULL ELSE now() END, development_id = EXCLUDED.development_id;
    INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id)
    VALUES (_portal, CASE WHEN l.visible THEN 'listing.upserted' ELSE 'listing.withdrawn' END, 'listing', l.property_id, l.organization_id);
  END LOOP;
  FOR g IN SELECT * FROM jsonb_to_recordset(COALESCE(_agents,'[]')) AS x(agent_id uuid, organization_id uuid, content_hash text, payload jsonb, deleted boolean) LOOP
    IF g.deleted THEN
      DELETE FROM public.partner_api_agent_state WHERE portal = _portal AND agent_id = g.agent_id;
    ELSE
      INSERT INTO public.partner_api_agent_state (portal, agent_id, organization_id, content_hash, payload, updated_at)
      VALUES (_portal, g.agent_id, g.organization_id, g.content_hash, g.payload, now())
      ON CONFLICT (portal, agent_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, content_hash = EXCLUDED.content_hash, payload = EXCLUDED.payload, updated_at = now();
    END IF;
    INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id) VALUES (_portal, 'agent.updated', 'agent', g.agent_id, g.organization_id);
  END LOOP;
  FOR d IN SELECT * FROM jsonb_to_recordset(COALESCE(_developments,'[]')) AS x(development_id uuid, organization_id uuid, content_hash text, visible boolean, payload jsonb) LOOP
    IF NOT d.visible AND NOT EXISTS (SELECT 1 FROM public.partner_api_development_state s WHERE s.portal = _portal AND s.development_id = d.development_id AND s.visible) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.partner_api_development_state (portal, development_id, organization_id, content_hash, visible, payload, updated_at, withdrawn_at)
    VALUES (_portal, d.development_id, d.organization_id, d.content_hash, d.visible, d.payload, now(), CASE WHEN d.visible THEN NULL ELSE now() END)
    ON CONFLICT (portal, development_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, content_hash = EXCLUDED.content_hash,
      visible = EXCLUDED.visible, payload = EXCLUDED.payload, updated_at = now(), withdrawn_at = CASE WHEN EXCLUDED.visible THEN NULL ELSE now() END;
    INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id)
    VALUES (_portal, CASE WHEN d.visible THEN 'development.upserted' ELSE 'development.withdrawn' END, 'development', d.development_id, d.organization_id);
  END LOOP;
  FOR a IN SELECT * FROM jsonb_to_recordset(COALESCE(_agencies,'[]')) AS x(organization_id uuid, active boolean) WHERE NOT x.active LOOP
    UPDATE public.partner_api_agency_state SET active = false, deactivated_at = now(), updated_at = now() WHERE portal = _portal AND organization_id = a.organization_id;
    IF FOUND THEN
      INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id) VALUES (_portal, 'agency.deactivated', 'agency', a.organization_id, a.organization_id);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.partner_api_apply_sync(text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_apply_sync(text,jsonb,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.partner_api_purge()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.partner_api_listing_state WHERE NOT visible AND withdrawn_at < now() - interval '30 days';
  DELETE FROM public.partner_api_development_state WHERE NOT visible AND withdrawn_at < now() - interval '30 days';
  DELETE FROM public.partner_api_events WHERE occurred_at < now() - interval '90 days';
$$;

CREATE OR REPLACE FUNCTION public.partner_webhook_event_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE w partner_api_webhooks;env text;data jsonb;BEGIN
 env:=CASE WHEN NEW.organization_id='a7b50000-0000-4000-8000-000000000001' THEN 'test' ELSE 'live' END;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-webhook:'||NEW.portal||':'||env,0));
 SELECT * INTO w FROM partner_api_webhooks WHERE portal=NEW.portal AND environment=env AND status='active' FOR UPDATE;
 IF NOT FOUND OR (cardinality(w.events)>0 AND NOT NEW.type=ANY(w.events)) OR (cardinality(w.events)=0 AND NEW.entity_type='development') THEN RETURN NEW;END IF;
 data:=jsonb_build_object('agency_id',NEW.organization_id);
 IF NEW.entity_type='listing' THEN data:=data||jsonb_build_object('listing_id',NEW.entity_id);ELSIF NEW.entity_type='agent' THEN data:=data||jsonb_build_object('agent_id',NEW.entity_id);ELSIF NEW.entity_type='development' THEN data:=data||jsonb_build_object('development_id',NEW.entity_id);END IF;
 INSERT INTO partner_api_webhook_queue(portal,environment,generation,seq,event) VALUES(NEW.portal,env,w.generation,NEW.seq,jsonb_build_object('id','habitoo-'||NEW.seq,'type',NEW.type,'seq',NEW.seq,'occurred_at',NEW.occurred_at,'data',data)) ON CONFLICT DO NOTHING;
 PERFORM partner_webhook_wake();RETURN NEW;
END $$;

ALTER TABLE public.partner_api_sandbox_templates DROP CONSTRAINT IF EXISTS partner_api_sandbox_templates_kind_check;
ALTER TABLE public.partner_api_sandbox_templates ADD CONSTRAINT partner_api_sandbox_templates_kind_check CHECK (kind IN ('listing','agent','development'));
INSERT INTO public.partner_api_sandbox_templates(kind,id,payload)
SELECT 'development','a7b50000-0000-4000-8000-000000000200', jsonb_set(p, '{images}', COALESCE((SELECT t.payload->'images' FROM public.partner_api_sandbox_templates t WHERE t.kind='listing' AND t.id='a7b50000-0000-4000-8000-000000000100'), p->'images'))
FROM (SELECT '{"id":"a7b50000-0000-4000-8000-000000000200","agency_id":"a7b50000-0000-4000-8000-000000000001","agent_id":"a7b50000-0000-4000-8000-000000000002","name":"[Test] Ansamblul Demo Habitoo","developer_name":"Dezvoltator Demo — FICTIV","description":"Ansamblu fictiv pentru testarea integrării Partner API. Nu reprezintă o ofertă reală.","location":{"county":"București","city":"București","district":"Centru","street":null,"street_number":null,"lat":44.434687,"lng":26.10752,"precise":false},"construction_stage":"in_constructie","delivery_date":"2027-12-31","buildings_count":2,"floors_count":8,"total_units":120,"amenities":["parcare_subterana","loc_de_joaca"],"price_range":{"from":80000,"to":140000,"currency":"EUR"},"area_from":40,"area_to":140,"estate_type":"flats","images":[{"url":"https://www.habitoo.ro/api/public/sandbox-photo/apartment","position":0,"is_cover":true}],"listing_ids":["a7b50000-0000-4000-8000-000000000100","a7b50000-0000-4000-8000-000000000104","a7b50000-0000-4000-8000-000000000106"],"created_at":"2026-11-20T00:00:00.000Z","updated_at":"2026-11-20T00:00:00.000Z"}'::jsonb AS p) s
ON CONFLICT (kind,id) DO UPDATE SET payload=EXCLUDED.payload;

CREATE OR REPLACE FUNCTION public.partner_api_sandbox_reset(_portal text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _org uuid:='a7b50000-0000-4000-8000-000000000001'; l record; a record; dv record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-sandbox:'||_portal,0));
 IF NOT EXISTS(SELECT 1 FROM dynamic_feed_portals WHERE slug=_portal AND active AND integration_mode IN ('api','both')) THEN RETURN jsonb_build_object('not_found',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations o JOIN partner_api_test_agencies t ON t.organization_id=o.id WHERE o.id=_org AND o.is_demo) THEN RAISE EXCEPTION 'Sandbox not provisioned'; END IF;
 IF (SELECT count(*) FROM partner_api_sandbox_templates WHERE kind='listing')<>12 OR (SELECT count(*) FROM partner_api_sandbox_templates WHERE kind='agent')<>2 THEN RAISE EXCEPTION 'Sandbox templates incomplete'; END IF;
 FOR l IN SELECT property_id FROM partner_api_listing_state s WHERE s.portal=_portal AND s.organization_id=_org AND s.visible AND NOT EXISTS(SELECT 1 FROM partner_api_sandbox_templates t WHERE t.kind='listing' AND t.id=s.property_id) LOOP
  UPDATE partner_api_listing_state SET visible=false,withdrawn_at=now(),updated_at=now(),development_id=NULL,payload=jsonb_build_object('id',l.property_id,'agency_id',_org,'status','withdrawn') WHERE portal=_portal AND property_id=l.property_id;
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'listing.withdrawn','listing',l.property_id,_org);
 END LOOP;
 FOR dv IN SELECT development_id FROM partner_api_development_state s WHERE s.portal=_portal AND s.organization_id=_org AND s.visible AND NOT EXISTS(SELECT 1 FROM partner_api_sandbox_templates t WHERE t.kind='development' AND t.id=s.development_id) LOOP
  UPDATE partner_api_development_state SET visible=false,withdrawn_at=now(),updated_at=now(),payload=jsonb_build_object('id',dv.development_id,'agency_id',_org) WHERE portal=_portal AND development_id=dv.development_id;
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'development.withdrawn','development',dv.development_id,_org);
 END LOOP;
 DELETE FROM partner_api_sandbox_data WHERE portal=_portal;
 INSERT INTO partner_api_agency_state(portal,organization_id,active,activated_at) VALUES(_portal,_org,true,now()) ON CONFLICT(portal,organization_id) DO UPDATE SET active=true,deactivated_at=NULL,updated_at=now();
 FOR l IN SELECT id,payload FROM partner_api_sandbox_templates WHERE kind='listing' ORDER BY id LOOP
  INSERT INTO partner_api_listing_state(portal,property_id,organization_id,agent_id,content_hash,visible,payload,development_id)
  VALUES(_portal,l.id,_org,(l.payload->>'agent_id')::uuid,'sandbox',true,l.payload,(SELECT t.id FROM partner_api_sandbox_templates t WHERE t.kind='development' AND t.payload->'listing_ids' ? l.id::text LIMIT 1))
  ON CONFLICT(portal,property_id) DO UPDATE SET agent_id=excluded.agent_id,visible=true,payload=excluded.payload,content_hash='sandbox',withdrawn_at=NULL,updated_at=now(),development_id=excluded.development_id;
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'listing.upserted','listing',l.id,_org);
 END LOOP;
 DELETE FROM partner_api_agent_state WHERE portal=_portal AND organization_id=_org;
 FOR a IN SELECT id,payload FROM partner_api_sandbox_templates WHERE kind='agent' ORDER BY id LOOP
  INSERT INTO partner_api_agent_state(portal,agent_id,organization_id,content_hash,payload) VALUES(_portal,a.id,_org,'sandbox',a.payload);
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'agent.updated','agent',a.id,_org);
 END LOOP;
 FOR dv IN SELECT id,payload FROM partner_api_sandbox_templates WHERE kind='development' ORDER BY id LOOP
  INSERT INTO partner_api_development_state(portal,development_id,organization_id,content_hash,visible,payload) VALUES(_portal,dv.id,_org,'sandbox',true,dv.payload)
  ON CONFLICT(portal,development_id) DO UPDATE SET visible=true,payload=excluded.payload,content_hash='sandbox',withdrawn_at=NULL,updated_at=now();
  INSERT INTO partner_api_events(portal,type,entity_type,entity_id,organization_id) VALUES(_portal,'development.upserted','development',dv.id,_org);
 END LOOP;
 RETURN jsonb_build_object('reset',true,'listings',12,'agents',2,'agency_id',_org);
END $$;

CREATE OR REPLACE FUNCTION public.partner_api_sandbox_simulate(_portal text, _action text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
 ELSIF _action IN ('development_update','development_withdraw') THEN
  SELECT development_id,payload INTO _id,_payload FROM partner_api_development_state WHERE portal=_portal AND organization_id=_org AND visible ORDER BY development_id LIMIT 1 FOR UPDATE;
  IF _id IS NULL THEN RETURN jsonb_build_object('not_found',true); END IF;
  IF _action='development_withdraw' THEN
   UPDATE partner_api_development_state SET visible=false,payload=jsonb_build_object('id',_id,'agency_id',_org),withdrawn_at=now(),updated_at=now() WHERE portal=_portal AND development_id=_id;
   UPDATE partner_api_listing_state SET development_id=NULL WHERE portal=_portal AND organization_id=_org AND development_id=_id;
   _type:='development.withdrawn';
  ELSE
   _payload:=jsonb_set(_payload,'{name}',to_jsonb('[Test] Ansamblu actualizat '||to_char(clock_timestamp(),'HH24:MI:SS.MS')));
   UPDATE partner_api_development_state SET payload=_payload,updated_at=now() WHERE portal=_portal AND development_id=_id;
   _type:='development.upserted';
  END IF;
  _entity:='development';
 ELSIF _action IN ('listing_update','listing_withdraw','listing_create') THEN
  SELECT property_id,payload INTO _id,_payload FROM partner_api_listing_state WHERE portal=_portal AND organization_id=_org AND visible ORDER BY property_id LIMIT 1 FOR UPDATE;
  IF _id IS NULL THEN SELECT id,payload INTO _id,_payload FROM partner_api_sandbox_templates WHERE kind='listing' ORDER BY id LIMIT 1; END IF;
  IF _action='listing_create' THEN
   _id:=gen_random_uuid(); _payload:=_payload||jsonb_build_object('id',_id,'reference','TEST-'||left(_id::text,8),'title','[Test] Anunț demo nou','created_at',now(),'status','active');
   INSERT INTO partner_api_listing_state(portal,property_id,organization_id,agent_id,content_hash,visible,payload) VALUES(_portal,_id,_org,(_payload->>'agent_id')::uuid,'sandbox',true,_payload);
  ELSIF _action='listing_withdraw' THEN
   IF NOT EXISTS(SELECT 1 FROM partner_api_listing_state WHERE portal=_portal AND property_id=_id AND visible) THEN RETURN jsonb_build_object('not_found',true); END IF;
   _payload:=jsonb_build_object('id',_id,'reference',_payload->>'reference','agency_id',_org,'agent_id',_payload->>'agent_id','status','withdrawn');
   UPDATE partner_api_listing_state SET visible=false,payload=_payload,withdrawn_at=now(),updated_at=now(),development_id=NULL WHERE portal=_portal AND property_id=_id;
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