CREATE TABLE public.partner_api_listing_state (
  portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug),
  property_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  agent_id uuid,
  content_hash text NOT NULL,
  visible boolean NOT NULL,
  payload jsonb NOT NULL,
  first_visible_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  PRIMARY KEY (portal, property_id)
);
CREATE INDEX partner_api_listing_state_cursor ON public.partner_api_listing_state (portal, updated_at, property_id);
CREATE INDEX partner_api_listing_state_org ON public.partner_api_listing_state (portal, organization_id);
GRANT ALL ON public.partner_api_listing_state TO service_role;
ALTER TABLE public.partner_api_listing_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_api_agency_state (
  portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug),
  organization_id uuid NOT NULL,
  active boolean NOT NULL,
  activated_at timestamptz,
  deactivated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portal, organization_id)
);
GRANT ALL ON public.partner_api_agency_state TO service_role;
ALTER TABLE public.partner_api_agency_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_api_agent_state (
  portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug),
  agent_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portal, agent_id)
);
CREATE INDEX partner_api_agent_state_org ON public.partner_api_agent_state (portal, organization_id);
GRANT ALL ON public.partner_api_agent_state TO service_role;
ALTER TABLE public.partner_api_agent_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_api_events (
  seq bigserial PRIMARY KEY,
  portal text NOT NULL,
  type text NOT NULL CHECK (type IN ('listing.upserted','listing.withdrawn','agency.activated','agency.deactivated','agent.updated')),
  entity_type text NOT NULL CHECK (entity_type IN ('listing','agency','agent')),
  entity_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_api_events_portal_seq ON public.partner_api_events (portal, seq);
GRANT ALL ON public.partner_api_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.partner_api_events_seq_seq TO service_role;
ALTER TABLE public.partner_api_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_api_sync_queue (
  organization_id uuid PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.partner_api_sync_queue TO service_role;
ALTER TABLE public.partner_api_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_api_sync_lease (
  id smallint PRIMARY KEY CHECK (id = 1),
  holder uuid,
  expires_at timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.partner_api_sync_lease (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT ALL ON public.partner_api_sync_lease TO service_role;
ALTER TABLE public.partner_api_sync_lease ENABLE ROW LEVEL SECURITY;

-- Lightweight enqueue: one upsert per touched agency, only when an API portal exists.
CREATE OR REPLACE FUNCTION public.partner_api_enqueue_from_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_feed_portals WHERE active AND integration_mode IN ('api','both')) THEN
    RETURN NULL;
  END IF;
  _org := COALESCE(to_jsonb(NEW)->>'organization_id', to_jsonb(OLD)->>'organization_id')::uuid;
  IF _org IS NOT NULL THEN
    INSERT INTO public.partner_api_sync_queue (organization_id) VALUES (_org)
    ON CONFLICT (organization_id) DO UPDATE SET requested_at = LEAST(partner_api_sync_queue.requested_at, now());
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD)->>'organization_id') IS DISTINCT FROM (to_jsonb(NEW)->>'organization_id') AND (to_jsonb(OLD)->>'organization_id') IS NOT NULL THEN
    INSERT INTO public.partner_api_sync_queue (organization_id) VALUES ((to_jsonb(OLD)->>'organization_id')::uuid)
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.partner_api_enqueue_from_row() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();
CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.property_images FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();
CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.portal_publications FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();
CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.portal_connections FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();
CREATE TRIGGER partner_api_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.partner_api_enqueue_from_row();

CREATE OR REPLACE FUNCTION public.partner_api_enqueue_sync(_orgs uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.partner_api_sync_queue (organization_id) SELECT DISTINCT unnest(_orgs) ON CONFLICT DO NOTHING;
$$;
CREATE OR REPLACE FUNCTION public.partner_api_take_sync_queue(_limit int)
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.partner_api_sync_queue q WHERE q.organization_id IN (
    SELECT organization_id FROM public.partner_api_sync_queue ORDER BY requested_at LIMIT GREATEST(1, LEAST(_limit, 1000)) FOR UPDATE SKIP LOCKED
  ) RETURNING q.organization_id;
$$;
CREATE OR REPLACE FUNCTION public.partner_api_sync_lease_acquire(_holder uuid, _seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  UPDATE public.partner_api_sync_lease SET holder = _holder, expires_at = now() + make_interval(secs => GREATEST(30, LEAST(_seconds, 900)))
  WHERE id = 1 AND expires_at < now() RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_sync_lease_release(_holder uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.partner_api_sync_lease SET holder = NULL, expires_at = '-infinity' WHERE id = 1 AND holder = _holder;
$$;

-- One transaction per (portal, agency): activations, listings, agents, deactivations; events share the order.
CREATE OR REPLACE FUNCTION public.partner_api_apply_sync(_portal text, _agencies jsonb, _listings jsonb, _agents jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; l record; g record;
BEGIN
  FOR a IN SELECT * FROM jsonb_to_recordset(COALESCE(_agencies,'[]')) AS x(organization_id uuid, active boolean) WHERE x.active LOOP
    INSERT INTO public.partner_api_agency_state (portal, organization_id, active, activated_at, updated_at)
    VALUES (_portal, a.organization_id, true, now(), now())
    ON CONFLICT (portal, organization_id) DO UPDATE SET active = true, activated_at = now(), deactivated_at = NULL, updated_at = now();
    INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id) VALUES (_portal, 'agency.activated', 'agency', a.organization_id, a.organization_id);
  END LOOP;
  FOR l IN SELECT * FROM jsonb_to_recordset(COALESCE(_listings,'[]')) AS x(property_id uuid, organization_id uuid, agent_id uuid, content_hash text, visible boolean, payload jsonb) LOOP
    IF NOT l.visible AND NOT EXISTS (SELECT 1 FROM public.partner_api_listing_state s WHERE s.portal = _portal AND s.property_id = l.property_id AND s.visible) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.partner_api_listing_state (portal, property_id, organization_id, agent_id, content_hash, visible, payload, first_visible_at, updated_at, withdrawn_at)
    VALUES (_portal, l.property_id, l.organization_id, l.agent_id, l.content_hash, l.visible, l.payload, now(), now(), CASE WHEN l.visible THEN NULL ELSE now() END)
    ON CONFLICT (portal, property_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, agent_id = EXCLUDED.agent_id,
      content_hash = EXCLUDED.content_hash, visible = EXCLUDED.visible, payload = EXCLUDED.payload, updated_at = now(),
      withdrawn_at = CASE WHEN EXCLUDED.visible THEN NULL ELSE now() END;
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
  FOR a IN SELECT * FROM jsonb_to_recordset(COALESCE(_agencies,'[]')) AS x(organization_id uuid, active boolean) WHERE NOT x.active LOOP
    UPDATE public.partner_api_agency_state SET active = false, deactivated_at = now(), updated_at = now() WHERE portal = _portal AND organization_id = a.organization_id;
    IF FOUND THEN
      INSERT INTO public.partner_api_events (portal, type, entity_type, entity_id, organization_id) VALUES (_portal, 'agency.deactivated', 'agency', a.organization_id, a.organization_id);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.partner_api_purge()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.partner_api_listing_state WHERE NOT visible AND withdrawn_at < now() - interval '30 days';
  DELETE FROM public.partner_api_events WHERE occurred_at < now() - interval '90 days';
$$;

REVOKE ALL ON FUNCTION public.partner_api_enqueue_sync(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_api_take_sync_queue(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_api_sync_lease_acquire(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_api_sync_lease_release(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_api_apply_sync(text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_api_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_enqueue_sync(uuid[]), public.partner_api_take_sync_queue(int), public.partner_api_sync_lease_acquire(uuid, int),
  public.partner_api_sync_lease_release(uuid), public.partner_api_apply_sync(text, jsonb, jsonb, jsonb), public.partner_api_purge() TO service_role;