CREATE TABLE public.mva_initial_syncs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL,
 credential_hash text NOT NULL,
 phase text NOT NULL DEFAULT 'waiting' CHECK (phase IN ('waiting','scanning','withdrawing','done','error')),
 page integer NOT NULL DEFAULT 1,
 remote_listings jsonb NOT NULL DEFAULT '[]'::jsonb,
 remote_total integer,
 withdrawal_cursor integer NOT NULL DEFAULT 0,
 withdrawn integer NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 claim_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE (organization_id, credential_hash)
);
GRANT ALL ON public.mva_initial_syncs TO service_role;
ALTER TABLE public.mva_initial_syncs ENABLE ROW LEVEL SECURITY;
CREATE INDEX mva_initial_syncs_pending ON public.mva_initial_syncs(next_attempt_at) WHERE phase NOT IN ('done','error');
ALTER TABLE public.portal_publish_jobs ADD COLUMN mva_sync_id uuid REFERENCES public.mva_initial_syncs(id) ON DELETE SET NULL;
CREATE INDEX portal_publish_jobs_mva_sync ON public.portal_publish_jobs(mva_sync_id) WHERE mva_sync_id IS NOT NULL;

CREATE FUNCTION public.start_mva_initial_sync(_org uuid, _actor uuid, _hash text, _encrypted text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run_id uuid;
BEGIN
 PERFORM 1 FROM public.portal_connections WHERE organization_id=_org AND portal='mvaimobiliare' AND activated=true AND portal_credentials_encrypted=_encrypted FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conexiunea mvaimobiliare.ro s-a schimbat. Repetă testul.'; END IF;
 INSERT INTO public.mva_initial_syncs(organization_id,requested_by,credential_hash) VALUES(_org,_actor,_hash)
 ON CONFLICT(organization_id,credential_hash) DO NOTHING RETURNING id INTO run_id;
 IF run_id IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,mva_sync_id,next_attempt_at)
 SELECT _org,p.id,'mvaimobiliare',true,true,_actor,false,'apply',run_id,now()+interval '1 second'*(row_number() OVER(ORDER BY p.id)-1)
 FROM public.properties p JOIN public.portal_publications pp ON pp.property_id=p.id AND pp.organization_id=_org AND pp.portal_key='mvaimobiliare' AND pp.enabled=true
 WHERE p.organization_id=_org AND p.deleted_at IS NULL
 ON CONFLICT(property_id,portal_key) WHERE status IN ('queued','running') DO NOTHING;
 PERFORM public.portal_publish_arm();
 RETURN run_id;
END $$;
REVOKE ALL ON FUNCTION public.start_mva_initial_sync(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_mva_initial_sync(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION public.claim_mva_initial_sync() RETURNS SETOF public.mva_initial_syncs
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.mva_initial_syncs s SET locked_until=now()+interval '120 seconds',claim_token=gen_random_uuid()
 WHERE s.id=(SELECT r.id FROM public.mva_initial_syncs r WHERE r.phase NOT IN ('done','error') AND r.next_attempt_at<=now()
 AND (r.locked_until IS NULL OR r.locked_until<now())
 AND NOT EXISTS(SELECT 1 FROM public.portal_publish_jobs j WHERE j.organization_id=r.organization_id AND j.portal_key='mvaimobiliare' AND j.status IN ('queued','running'))
 ORDER BY r.created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING s.*;
$$;
REVOKE ALL ON FUNCTION public.claim_mva_initial_sync() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mva_initial_sync() TO service_role;

CREATE FUNCTION public.finish_mva_initial_sync(_id uuid,_token uuid,_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.mva_initial_syncs; success_count integer; failed_count integer;
BEGIN
 SELECT * INTO r FROM public.mva_initial_syncs WHERE id=_id AND claim_token=_token AND phase NOT IN ('done','error') FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE mva_sync_id=_id AND status IN ('queued','running')) THEN RETURN false; END IF;
 SELECT count(*) FILTER(WHERE status='done' AND result_action<>'skipped'),count(*) FILTER(WHERE status='error') INTO success_count,failed_count FROM public.portal_publish_jobs WHERE mva_sync_id=_id;
 UPDATE public.mva_initial_syncs SET phase=CASE WHEN _error IS NULL THEN 'done' ELSE 'error' END,finished_at=now(),last_error=_error,locked_until=NULL WHERE id=_id;
 INSERT INTO public.notifications(organization_id,user_id,created_by,type,title,body,link)
 VALUES(r.organization_id,r.requested_by,r.requested_by,'portal_republish_done','Sincronizarea mvaimobiliare.ro s-a terminat',
 success_count||' publicate, '||r.withdrawn||' retrase, '||failed_count||' erori de publicare.'||CASE WHEN _error IS NULL THEN '' ELSE ' '||_error END,'/app/properties');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_mva_initial_sync(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_mva_initial_sync(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.portal_publish_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,cron AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE status IN ('queued','running') OR contact_update_requested_by IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.storia_development_jobs WHERE status IN ('queued','running'))
 AND NOT EXISTS(SELECT 1 FROM public.mva_initial_syncs WHERE phase NOT IN ('done','error'))
 THEN PERFORM cron.unschedule('portal-publish-worker');RETURN;END IF;
 PERFORM public.portal_publish_kick();END $$;
REVOKE ALL ON FUNCTION public.portal_publish_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_publish_tick() TO service_role;