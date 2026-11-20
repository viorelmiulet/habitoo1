ALTER TABLE public.developments ADD COLUMN area_from numeric, ADD COLUMN area_to numeric, ADD COLUMN price_per_sqm_from numeric, ADD COLUMN estate_type text, ADD COLUMN construction_start_date date;
ALTER TABLE public.developments ADD CONSTRAINT development_investment_values CHECK((area_from IS NULL OR area_from>0) AND (area_to IS NULL OR area_to>0) AND (area_from IS NULL OR area_to IS NULL OR area_from<=area_to) AND (price_per_sqm_from IS NULL OR price_per_sqm_from>0) AND (estate_type IS NULL OR estate_type IN ('flats','houses','commercial-properties')));
CREATE TABLE public.development_portal_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), development_id uuid NOT NULL REFERENCES public.developments(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), portal text NOT NULL DEFAULT 'storia', connection_id uuid REFERENCES public.portal_connections(id), external_uuid text, status text NOT NULL DEFAULT 'draft', last_error text, payload_hash text, published_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), last_event_at timestamptz, desired_active boolean NOT NULL DEFAULT false, confirmed_property_ids uuid[] NOT NULL DEFAULT '{}', UNIQUE(development_id,portal));
GRANT SELECT ON public.development_portal_publications TO authenticated; GRANT ALL ON public.development_portal_publications TO service_role;
ALTER TABLE public.development_portal_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_publication_read ON public.development_portal_publications FOR SELECT TO authenticated USING(public.can_access_development(development_id));
CREATE TABLE public.storia_development_units(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), development_id uuid NOT NULL REFERENCES public.developments(id), property_id uuid NOT NULL REFERENCES public.properties(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), transaction_kind text NOT NULL CHECK(transaction_kind IN ('sale','rent')), connection_id uuid REFERENCES public.portal_connections(id), external_uuid text, old_agency_uuid text, status text NOT NULL DEFAULT 'queued', last_error text, last_event_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(property_id,transaction_kind));
GRANT SELECT ON public.storia_development_units TO authenticated; GRANT ALL ON public.storia_development_units TO service_role;
ALTER TABLE public.storia_development_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_unit_publication_read ON public.storia_development_units FOR SELECT TO authenticated USING(public.can_access_development(development_id));
CREATE TABLE public.storia_development_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), development_id uuid NOT NULL REFERENCES public.developments(id), unit_id uuid REFERENCES public.storia_development_units(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), operation text NOT NULL CHECK(operation IN ('publish','withdraw','unit','unit_withdraw','old_withdraw')), status text NOT NULL DEFAULT 'queued', requested_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_error text);
GRANT SELECT ON public.storia_development_jobs TO authenticated; GRANT ALL ON public.storia_development_jobs TO service_role;
ALTER TABLE public.storia_development_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_jobs_read ON public.storia_development_jobs FOR SELECT TO authenticated USING(public.can_access_development(development_id));
CREATE UNIQUE INDEX storia_development_job_active ON public.storia_development_jobs(development_id,coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid),operation) WHERE status IN ('queued','running');
CREATE FUNCTION public.queue_storia_development(_id uuid,_operation text,_actor uuid DEFAULT NULL,_unit uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO public.storia_development_jobs(development_id,organization_id,operation,requested_by,unit_id) SELECT id,organization_id,_operation,_actor,_unit FROM public.developments WHERE id=_id ON CONFLICT DO NOTHING;
 PERFORM public.portal_publish_arm();
END $$;
REVOKE ALL ON FUNCTION public.queue_storia_development(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.queue_storia_development(uuid,text,uuid,uuid) TO service_role;
CREATE FUNCTION public.request_storia_development(_id uuid,_withdraw boolean DEFAULT false,_confirmed uuid[] DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.developments; c uuid; BEGIN
 IF NOT public.can_access_development(_id,true) THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 SELECT * INTO d FROM public.developments WHERE id=_id FOR UPDATE;
 SELECT id INTO c FROM public.portal_connections WHERE organization_id=d.organization_id AND portal='storia_developer' AND portal_credentials_encrypted IS NOT NULL AND status='connected';
 IF c IS NULL THEN RAISE EXCEPTION 'Conectează contul dezvoltator Storia pentru ansambluri.'; END IF;
 IF NOT _withdraw AND (d.status<>'active' OR d.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Ansamblul trebuie să fie activ.'; END IF;
 IF NOT _withdraw AND EXISTS(SELECT 1 FROM public.properties p JOIN public.portal_publications pp ON pp.property_id=p.id AND pp.portal='storia' AND pp.enabled JOIN public.portal_listings l ON l.property_id=p.id AND l.portal='storia' WHERE p.development_id=_id AND l.external_id IS NOT NULL AND NOT(p.id=ANY(_confirmed)) AND NOT EXISTS(SELECT 1 FROM public.storia_development_units u WHERE u.property_id=p.id AND u.external_uuid IS NOT NULL)) THEN RAISE EXCEPTION 'Confirmă mutarea anunțurilor de pe contul agenției.'; END IF;
 INSERT INTO public.development_portal_publications(development_id,organization_id,connection_id,desired_active,confirmed_property_ids) VALUES(_id,d.organization_id,c,NOT _withdraw,_confirmed) ON CONFLICT(development_id,portal) DO UPDATE SET desired_active=NOT _withdraw,confirmed_property_ids=_confirmed,updated_at=now();
 PERFORM public.queue_storia_development(_id,CASE WHEN _withdraw THEN 'withdraw' ELSE 'publish' END,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.request_storia_development(uuid,boolean,uuid[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.request_storia_development(uuid,boolean,uuid[]) TO authenticated;
CREATE FUNCTION public.claim_storia_development_job() RETURNS SETOF public.storia_development_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.storia_development_jobs SET status='error',last_error='Operațiune întreruptă; verifică notificarea Storia înainte de retrimitere.',updated_at=now() WHERE status='running' AND updated_at<now()-interval '5 minutes';
 RETURN QUERY UPDATE public.storia_development_jobs SET status='running',updated_at=now() WHERE id=(SELECT id FROM public.storia_development_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_storia_development_job() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.claim_storia_development_job() TO service_role;
CREATE OR REPLACE FUNCTION public.portal_publish_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,cron AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE status IN ('queued','running') OR contact_update_requested_by IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.storia_development_jobs WHERE status IN ('queued','running')) THEN PERFORM cron.unschedule('portal-publish-worker');RETURN;END IF;
 PERFORM public.portal_publish_kick();END $$;
CREATE FUNCTION public.development_storia_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.development_portal_publications WHERE development_id=NEW.id AND desired_active) THEN
 IF NEW.deleted_at IS NOT NULL OR NEW.status<>'active' THEN UPDATE public.development_portal_publications SET desired_active=false WHERE development_id=NEW.id;PERFORM public.queue_storia_development(NEW.id,'withdraw',auth.uid());
 ELSE PERFORM public.queue_storia_development(NEW.id,'publish',auth.uid());END IF;END IF;RETURN NEW;END $$;
CREATE TRIGGER development_storia_change AFTER UPDATE ON public.developments FOR EACH ROW EXECUTE FUNCTION public.development_storia_change();
CREATE FUNCTION public.development_unit_storia_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u record;BEGIN
 FOR u IN SELECT * FROM public.storia_development_units WHERE property_id=NEW.id LOOP
 IF NEW.development_id IS DISTINCT FROM u.development_id OR NEW.deleted_at IS NOT NULL OR NEW.status NOT IN ('active','reserved','negotiation') THEN PERFORM public.queue_storia_development(u.development_id,'unit_withdraw',auth.uid(),u.id);
 ELSE PERFORM public.queue_storia_development(u.development_id,'unit',auth.uid(),u.id);END IF;END LOOP;RETURN NEW;END $$;
CREATE TRIGGER development_unit_storia_change AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.development_unit_storia_change();