CREATE OR REPLACE FUNCTION public.request_storia_development(_id uuid,_withdraw boolean DEFAULT false,_confirmed uuid[] DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.developments; c uuid; BEGIN
 IF NOT public.can_access_development(_id,true) THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 SELECT * INTO d FROM public.developments WHERE id=_id FOR UPDATE;
 SELECT id INTO c FROM public.portal_connections WHERE organization_id=d.organization_id AND portal='storia_developer' AND portal_credentials_encrypted IS NOT NULL AND status='connected';
 IF c IS NULL THEN RAISE EXCEPTION 'Conectează contul dezvoltator Storia pentru ansambluri.'; END IF;
 IF NOT _withdraw AND (d.status<>'active' OR d.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Ansamblul trebuie să fie activ.'; END IF;
 INSERT INTO public.development_portal_publications(development_id,organization_id,connection_id,desired_active) VALUES(_id,d.organization_id,c,NOT _withdraw) ON CONFLICT(development_id,portal) DO UPDATE SET desired_active=NOT _withdraw,updated_at=now();
 PERFORM public.queue_storia_development(_id,CASE WHEN _withdraw THEN 'withdraw' ELSE 'publish' END,auth.uid());END $$;
CREATE OR REPLACE FUNCTION public.claim_storia_development_job() RETURNS SETOF public.storia_development_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.storia_development_jobs SET status='error',last_error='Operațiune întreruptă; verifică notificarea Storia înainte de retrimitere.',updated_at=now() WHERE status='running' AND updated_at<now()-interval '5 minutes';
 RETURN QUERY UPDATE public.storia_development_jobs SET status='running',updated_at=now() WHERE id=(SELECT j.id FROM public.storia_development_jobs j WHERE j.status='queued' AND j.operation<>'old_withdraw' AND NOT EXISTS(SELECT 1 FROM public.storia_development_jobs r WHERE r.development_id=j.development_id AND r.status='running') ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;END $$;
COMMENT ON COLUMN public.development_portal_publications.confirmed_property_ids IS 'DEPRECATED: development units are clones; agency adverts are never moved';
COMMENT ON COLUMN public.storia_development_units.old_agency_uuid IS 'DEPRECATED: agency advert is never withdrawn by development publishing';
COMMENT ON COLUMN public.storia_development_units.old_withdrawn_at IS 'DEPRECATED: old_withdraw operation removed';