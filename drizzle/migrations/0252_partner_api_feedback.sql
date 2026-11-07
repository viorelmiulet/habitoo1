CREATE TABLE public.partner_api_publications (
 portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug), environment text NOT NULL CHECK(environment IN ('live','test')), property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('published','pending_review','rejected','removed')), portal_listing_id text, url text, reasons jsonb NOT NULL DEFAULT '[]', occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(portal,environment,property_id)
);
GRANT SELECT ON public.partner_api_publications TO authenticated;
GRANT ALL ON public.partner_api_publications TO service_role;
ALTER TABLE public.partner_api_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_property_read ON public.partner_api_publications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.properties p WHERE p.id=property_id AND p.organization_id=organization_id));
CREATE TABLE public.partner_api_statistics (
 portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug), environment text NOT NULL CHECK(environment IN ('live','test')), property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, date date NOT NULL, views bigint NOT NULL DEFAULT 0 CHECK(views>=0), contacts bigint NOT NULL DEFAULT 0 CHECK(contacts>=0), favorites bigint NOT NULL DEFAULT 0 CHECK(favorites>=0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(portal,environment,property_id,date)
);
GRANT SELECT ON public.partner_api_statistics TO authenticated;
GRANT ALL ON public.partner_api_statistics TO service_role;
ALTER TABLE public.partner_api_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_stats_read ON public.partner_api_statistics FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.properties p WHERE p.id=property_id AND p.organization_id=organization_id));
CREATE TABLE public.partner_api_lead_receipts (
 portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug), environment text NOT NULL CHECK(environment IN ('live','test')), external_id text NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, lead_id uuid, message_id uuid NOT NULL DEFAULT gen_random_uuid(), owner_id uuid, leased_until timestamptz, completed boolean NOT NULL DEFAULT false, last_email_notified_at timestamptz, PRIMARY KEY(portal,environment,external_id)
);
GRANT ALL ON public.partner_api_lead_receipts TO service_role;
ALTER TABLE public.partner_api_lead_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX partner_api_lead_receipts_lead_idx ON public.partner_api_lead_receipts(portal,environment,lead_id);
CREATE OR REPLACE FUNCTION public.partner_api_write_allowed(_portal text,_environment text,_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM organizations o JOIN portal_connections c ON c.organization_id=o.id JOIN dynamic_feed_portals d ON d.slug=c.portal WHERE o.id=_org AND o.archived_at IS NULL AND c.portal=_portal AND c.activated AND d.active AND d.integration_mode IN ('api','both') AND ((_environment='test' AND EXISTS(SELECT 1 FROM partner_api_test_agencies t WHERE t.organization_id=o.id)) OR (_environment='live' AND NOT o.is_demo AND NOT EXISTS(SELECT 1 FROM partner_api_test_agencies t WHERE t.organization_id=o.id))))
$$;
CREATE OR REPLACE FUNCTION public.partner_api_listing_allowed(_portal text,_environment text,_id uuid,_recent boolean) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.organization_id FROM partner_api_listing_state s JOIN organizations o ON o.id=s.organization_id WHERE s.portal=_portal AND s.property_id=_id AND ((_environment='test' AND EXISTS(SELECT 1 FROM partner_api_test_agencies t WHERE t.organization_id=o.id)) OR (_environment='live' AND NOT o.is_demo AND NOT EXISTS(SELECT 1 FROM partner_api_test_agencies t WHERE t.organization_id=o.id))) AND o.archived_at IS NULL AND ((_recent AND (s.visible OR s.withdrawn_at>=now()-interval '30 days')) OR (NOT _recent AND s.visible AND public.partner_api_write_allowed(_portal,_environment,s.organization_id) AND EXISTS(SELECT 1 FROM properties p JOIN portal_publications pp ON pp.property_id=p.id AND pp.portal_key=_portal WHERE p.id=_id AND p.deleted_at IS NULL AND p.publish_status='published' AND p.status IN ('active','reserved','negotiation') AND pp.enabled)))
$$;
CREATE OR REPLACE FUNCTION public.partner_api_publication_apply(_portal text,_environment text,_id uuid,_body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; applied integer; ts timestamptz:=coalesce((_body->>'occurred_at')::timestamptz,now());
BEGIN
 org:=partner_api_listing_allowed(_portal,_environment,_id,true); IF org IS NULL THEN RETURN jsonb_build_object('not_found',true); END IF;
 INSERT INTO partner_api_publications(portal,environment,property_id,organization_id,status,portal_listing_id,url,reasons,occurred_at) VALUES(_portal,_environment,_id,org,_body->>'status',_body->>'portal_listing_id',_body->>'url',coalesce(_body->'reasons','[]'),ts)
 ON CONFLICT(portal,environment,property_id) DO UPDATE SET status=excluded.status,portal_listing_id=excluded.portal_listing_id,url=excluded.url,reasons=excluded.reasons,occurred_at=excluded.occurred_at,received_at=now() WHERE partner_api_publications.occurred_at<=excluded.occurred_at;
 GET DIAGNOSTICS applied=ROW_COUNT; RETURN jsonb_build_object('id',_id,'applied',applied>0);
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_stats_apply(_portal text,_environment text,_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; org uuid;
BEGIN
 IF jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'Too many items'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  org:=partner_api_listing_allowed(_portal,_environment,(item->>'listing_id')::uuid,true); IF org IS NULL THEN RETURN jsonb_build_object('not_found',true); END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  org:=partner_api_listing_allowed(_portal,_environment,(item->>'listing_id')::uuid,true);
  INSERT INTO partner_api_statistics(portal,environment,property_id,organization_id,date,views,contacts,favorites) VALUES(_portal,_environment,(item->>'listing_id')::uuid,org,(item->>'date')::date,coalesce((item->>'views')::bigint,0),coalesce((item->>'contacts')::bigint,0),coalesce((item->>'favorites')::bigint,0)) ON CONFLICT(portal,environment,property_id,date) DO UPDATE SET views=excluded.views,contacts=excluded.contacts,favorites=excluded.favorites,updated_at=now();
 END LOOP; RETURN jsonb_build_object('accepted',jsonb_array_length(_items));
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_lead_claim(_portal text,_environment text,_external text,_org uuid,_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r partner_api_lead_receipts;
BEGIN
 IF NOT partner_api_write_allowed(_portal,_environment,_org) THEN RETURN jsonb_build_object('not_found',true); END IF;
 INSERT INTO partner_api_lead_receipts(portal,environment,external_id,organization_id,lead_id) VALUES(_portal,_environment,_external,_org,gen_random_uuid()) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM partner_api_lead_receipts WHERE portal=_portal AND environment=_environment AND external_id=_external FOR UPDATE;
 IF r.organization_id<>_org THEN RETURN jsonb_build_object('not_found',true); END IF;
 IF r.completed THEN RETURN jsonb_build_object('id',r.lead_id,'deduplicated',true); END IF;
 IF r.leased_until>now() THEN RETURN jsonb_build_object('pending',true); END IF;
 UPDATE partner_api_lead_receipts SET owner_id=_owner,leased_until=now()+interval '2 minutes' WHERE portal=_portal AND environment=_environment AND external_id=_external;
 RETURN jsonb_build_object('id',r.lead_id,'message_id',r.message_id,'deduplicated',false);
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_lead_finish(_portal text,_environment text,_external text,_owner uuid,_lead uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE partner_api_lead_receipts SET lead_id=_lead,completed=true,leased_until=NULL WHERE portal=_portal AND environment=_environment AND external_id=_external AND owner_id=_owner AND EXISTS(SELECT 1 FROM leads l WHERE l.id=_lead AND l.organization_id=partner_api_lead_receipts.organization_id AND l.deleted_at IS NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead receipt could not complete'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.partner_api_email_claim(_portal text,_environment text,_lead uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_portal||':'||_environment||':'||_lead::text,0));
 IF EXISTS(SELECT 1 FROM partner_api_lead_receipts WHERE portal=_portal AND environment=_environment AND lead_id=_lead AND last_email_notified_at>now()-interval '10 minutes') THEN RETURN false; END IF;
 UPDATE partner_api_lead_receipts SET last_email_notified_at=now() WHERE portal=_portal AND environment=_environment AND lead_id=_lead AND completed;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.partner_api_write_allowed(text,text,uuid),public.partner_api_listing_allowed(text,text,uuid,boolean),public.partner_api_publication_apply(text,text,uuid,jsonb),public.partner_api_stats_apply(text,text,jsonb),public.partner_api_lead_claim(text,text,text,uuid,uuid),public.partner_api_lead_finish(text,text,text,uuid,uuid),public.partner_api_email_claim(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_write_allowed(text,text,uuid),public.partner_api_listing_allowed(text,text,uuid,boolean),public.partner_api_publication_apply(text,text,uuid,jsonb),public.partner_api_stats_apply(text,text,jsonb),public.partner_api_lead_claim(text,text,text,uuid,uuid),public.partner_api_lead_finish(text,text,text,uuid,uuid),public.partner_api_email_claim(text,text,uuid) TO service_role;