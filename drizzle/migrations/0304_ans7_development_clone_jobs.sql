CREATE TABLE public.development_clone_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  development_id uuid NOT NULL REFERENCES public.developments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  property_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '{"copies":[],"skipped":[],"portalSkipped":[],"photoErrors":0}'::jsonb,
  current_item jsonb,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX development_clone_jobs_pending_idx ON public.development_clone_jobs (created_at) WHERE status IN ('queued','running');
CREATE INDEX development_clone_jobs_dev_idx ON public.development_clone_jobs (development_id, created_at DESC);
GRANT SELECT, INSERT ON public.development_clone_jobs TO authenticated;
GRANT ALL ON public.development_clone_jobs TO service_role;
ALTER TABLE public.development_clone_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_clone_jobs_select ON public.development_clone_jobs FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_superadmin() OR (organization_id = public.current_org() AND public.is_org_admin()));
CREATE POLICY development_clone_jobs_insert ON public.development_clone_jobs FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND status = 'queued' AND processed = 0 AND public.can_access_development(development_id, true));

-- Immediate kick on enqueue; the managed per-minute schedule is the backstop.
CREATE OR REPLACE FUNCTION public.development_clone_kick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/development-clone',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-nonce', public.cron_nonce_issue('development_clone')),
    body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'development_clone_kick: %', SQLERRM;
END $$;

-- Start: rights and visibility are checked as the caller (RLS), then only the job is created.
CREATE OR REPLACE FUNCTION public.start_development_clone_job(_development_id uuid, _property_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); org uuid; ids uuid[]; jid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Neautentificat.' USING ERRCODE='42501'; END IF;
  IF NOT public.can_access_development(_development_id, true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501'; END IF;
  SELECT organization_id INTO org FROM public.developments WHERE id=_development_id AND deleted_at IS NULL;
  IF org IS NULL THEN RAISE EXCEPTION 'Ansamblu inaccesibil' USING ERRCODE='42501'; END IF;
  SELECT array_agg(x ORDER BY first) INTO ids FROM (SELECT x, min(o) first FROM unnest(coalesce(_property_ids,'{}')) WITH ORDINALITY u(x,o) GROUP BY x) s;
  IF ids IS NULL THEN RAISE EXCEPTION 'Nu ai selectat anunțuri.' USING ERRCODE='22023'; END IF;
  IF array_length(ids,1) > 200 THEN RAISE EXCEPTION 'Maximum 200 de anunțuri pe operație.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.properties p WHERE p.id=ANY(ids) AND p.organization_id=org AND p.deleted_at IS NULL) <> array_length(ids,1) THEN
    RAISE EXCEPTION 'Unele anunțuri nu sunt accesibile sau sunt din altă agenție.' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.development_clone_jobs(organization_id, development_id, requested_by, property_ids, total)
    VALUES (org, _development_id, uid, ids, array_length(ids,1)) RETURNING id INTO jid;
  PERFORM public.development_clone_kick();
  RETURN jid;
END $$;
REVOKE ALL ON FUNCTION public.start_development_clone_job(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_development_clone_job(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_development_clone_job(_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.development_clone_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.development_clone_jobs j
     SET status='running', started_at=coalesce(j.started_at, now()), attempts=j.attempts+1,
         locked_until=now()+make_interval(secs => greatest(_lease_seconds,1))
   WHERE j.id = (SELECT id FROM public.development_clone_jobs
                  WHERE status IN ('queued','running') AND (locked_until IS NULL OR locked_until < now())
                  ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
$$;

-- One item: clones the next property as requested_by (rights rechecked). Resumable: returns the pending item unchanged.
CREATE OR REPLACE FUNCTION public.development_clone_job_step(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record; pid uuid; ref text; r jsonb;
BEGIN
  SELECT * INTO j FROM public.development_clone_jobs WHERE id=_job_id FOR UPDATE;
  IF j.id IS NULL OR j.status <> 'running' THEN RETURN NULL; END IF;
  IF j.current_item IS NOT NULL THEN RETURN j.current_item; END IF;
  IF j.processed >= j.total THEN RETURN NULL; END IF;
  pid := j.property_ids[j.processed + 1];
  PERFORM set_config('request.jwt.claims', json_build_object('sub', j.requested_by, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', j.requested_by::text, true);
  SELECT reference INTO ref FROM public.properties WHERE id=pid;
  IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id=pid AND p.organization_id=j.organization_id AND p.deleted_at IS NULL
      AND (public.is_superadmin() OR (p.organization_id=public.current_org() AND (public.is_org_admin() OR p.assigned_to=auth.uid()))
           OR (p.organization_id=public.current_org() AND EXISTS (SELECT 1 FROM public.private_listing_imports i WHERE i.property_id=p.id AND i.imported_by=auth.uid())))) THEN
    r := jsonb_build_object('copies','[]'::jsonb,'files','[]'::jsonb,'skipped',jsonb_build_array(jsonb_build_object('original_id',pid,'original_reference',ref,'reason','anunț inaccesibil')));
  ELSE
    r := public.clone_properties_to_development(j.development_id, ARRAY[pid]);
  END IF;
  r := r || jsonb_build_object('index', j.processed);
  UPDATE public.development_clone_jobs SET current_item=r WHERE id=_job_id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.development_clone_job_advance(_job_id uuid, _index integer, _portal_skipped jsonb, _photo_errors integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb;
BEGIN
  SELECT current_item INTO c FROM public.development_clone_jobs WHERE id=_job_id FOR UPDATE;
  IF c IS NULL OR (c->>'index')::int <> _index THEN RETURN; END IF;
  UPDATE public.development_clone_jobs SET
    result = jsonb_build_object(
      'copies', coalesce(result->'copies','[]'::jsonb) || coalesce(c->'copies','[]'::jsonb),
      'skipped', coalesce(result->'skipped','[]'::jsonb) || coalesce(c->'skipped','[]'::jsonb),
      'portalSkipped', coalesce(result->'portalSkipped','[]'::jsonb) || coalesce(_portal_skipped,'[]'::jsonb),
      'photoErrors', coalesce((result->>'photoErrors')::int,0) + coalesce(_photo_errors,0)),
    processed = _index + 1, current_item = NULL, attempts = 0
  WHERE id=_job_id;
END $$;

CREATE OR REPLACE FUNCTION public.development_clone_job_release(_job_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.development_clone_jobs SET locked_until=NULL WHERE id=_job_id AND status='running';
$$;

CREATE OR REPLACE FUNCTION public.development_clone_job_finish(_job_id uuid, _error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record; dname text; n int; m int; k int; p int; body text;
BEGIN
  UPDATE public.development_clone_jobs SET status = CASE WHEN _error IS NULL THEN 'done' ELSE 'error' END,
    last_error=_error, finished_at=now(), locked_until=NULL
   WHERE id=_job_id AND status IN ('queued','running') RETURNING * INTO j;
  IF j.id IS NULL THEN RETURN; END IF;
  SELECT name INTO dname FROM public.developments WHERE id=j.development_id;
  n := jsonb_array_length(coalesce(j.result->'copies','[]'::jsonb));
  m := jsonb_array_length(coalesce(j.result->'skipped','[]'::jsonb));
  k := jsonb_array_length(coalesce(j.result->'portalSkipped','[]'::jsonb));
  p := coalesce((j.result->>'photoErrors')::int, 0);
  IF _error IS NULL THEN
    body := format('Alocarea la ansamblul %s s-a terminat: %s copii create, %s sărite.', coalesce(dname,''), n, m);
    IF k > 0 THEN body := body || format(' %s portaluri nebifate.', k); END IF;
    IF p > 0 THEN body := body || format(' Erori la %s poze.', p); END IF;
  ELSE
    body := format('Alocarea la ansamblul %s a eșuat: %s. Până la oprire: %s copii create, %s sărite.', coalesce(dname,''), _error, n, m);
  END IF;
  INSERT INTO public.notifications(organization_id, user_id, type, title, body, link)
    VALUES (j.organization_id, j.requested_by, 'development_clone',
      CASE WHEN _error IS NULL THEN 'Alocare la ansamblu finalizată' ELSE 'Alocare la ansamblu eșuată' END,
      body, '/app/developments/' || j.development_id || '?tab=units');
END $$;

REVOKE ALL ON FUNCTION public.development_clone_kick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_development_clone_job(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.development_clone_job_step(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.development_clone_job_advance(uuid, integer, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.development_clone_job_release(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.development_clone_job_finish(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_development_clone_job(integer), public.development_clone_job_step(uuid),
  public.development_clone_job_advance(uuid, integer, jsonb, integer), public.development_clone_job_release(uuid),
  public.development_clone_job_finish(uuid, text), public.development_clone_kick() TO service_role;