-- lovable-cron-fallback-reviewed: wake-on-enqueue worker, runs once a minute only while a deletion job is pending and unschedules itself after drain (same as portal_bulk_arm/tick).
CREATE TABLE public.account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('user','organization')),
  target_id uuid NOT NULL,
  target_label text,
  mode text NOT NULL CHECK (mode IN ('reassign','delete')),
  reassign_to_user_id uuid,
  delete_target boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','cancelled')),
  phase text NOT NULL DEFAULT 'properties',
  total integer NOT NULL DEFAULT 0,
  done integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked_until timestamptz,
  next_attempt_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CHECK (mode <> 'reassign' OR reassign_to_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX account_deletion_jobs_one_active ON public.account_deletion_jobs (kind, target_id) WHERE status IN ('queued','running');
CREATE INDEX account_deletion_jobs_pending ON public.account_deletion_jobs (status, next_attempt_at);

GRANT SELECT ON public.account_deletion_jobs TO authenticated;
GRANT ALL ON public.account_deletion_jobs TO service_role;
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read account deletion jobs" ON public.account_deletion_jobs
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE OR REPLACE FUNCTION public.account_deletion_move_property(_property uuid, _to_user uuid, _actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org_from uuid; _org_to uuid; _ref text; _new_ref text; _source text; _ext text;
BEGIN
  SELECT organization_id, reference, source, external_id INTO _org_from, _ref, _source, _ext
    FROM public.properties WHERE id = _property FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proprietatea nu există.'; END IF;
  SELECT organization_id INTO _org_to FROM public.profiles WHERE id = _to_user;
  IF _org_to IS NULL THEN RAISE EXCEPTION 'Utilizatorul destinație nu are agenție.'; END IF;

  DELETE FROM public.portal_publications WHERE property_id = _property;
  DELETE FROM public.portal_listing_versions WHERE property_id = _property;
  DELETE FROM public.portal_listings WHERE property_id = _property;
  DELETE FROM public.portal_status_withdraw_items WHERE property_id = _property;
  DELETE FROM public.portal_slot_withdraw_items WHERE property_id = _property;
  DELETE FROM public.promotion_withdraw_items WHERE property_id = _property;
  DELETE FROM public.lacheie_resend_items WHERE property_id = _property;
  DELETE FROM public.portal_bulk_items WHERE property_id = _property AND status IN ('queued','running');
  DELETE FROM public.property_favorites WHERE property_id = _property;

  IF _org_from IS DISTINCT FROM _org_to THEN
    IF _ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.properties WHERE organization_id = _org_to AND reference = _ref AND id <> _property) THEN
      _new_ref := public.next_property_reference();
    END IF;
    IF _ext IS NOT NULL AND _source IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.properties WHERE organization_id = _org_to AND source = _source AND external_id = _ext AND id <> _property) THEN
      _ext := NULL;
    END IF;
    UPDATE public.property_images SET organization_id = _org_to WHERE property_id = _property;
    UPDATE public.marketing_drafts SET organization_id = _org_to WHERE property_id = _property;
    DELETE FROM public.site_feed_visits WHERE property_id = _property;
    DELETE FROM public.postal_code_resolution_attempts WHERE property_id = _property;
  END IF;

  UPDATE public.properties
     SET organization_id = _org_to, assigned_to = _to_user,
         reference = coalesce(_new_ref, reference), external_id = _ext, updated_at = now()
   WHERE id = _property;

  IF _org_from IS DISTINCT FROM _org_to THEN
    INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
    VALUES (_org_to, _actor, 'property.moved_organization', 'properties', _property,
      jsonb_build_object('organization_id', _org_from, 'reference', _ref),
      jsonb_build_object('organization_id', _org_to, 'assigned_to', _to_user, 'reference', coalesce(_new_ref, _ref),
        'reference_changed', _new_ref IS NOT NULL), _actor);
  END IF;
  RETURN jsonb_build_object('organization_from', _org_from, 'organization_to', _org_to, 'new_reference', _new_ref);
END $$;

CREATE OR REPLACE FUNCTION public.account_deletion_apply_rest(_kind text, _target uuid, _mode text, _to_user uuid, _actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org_to uuid; _counts jsonb := '{}'::jsonb; _n bigint;
BEGIN
  IF _mode = 'reassign' THEN
    SELECT organization_id INTO _org_to FROM public.profiles WHERE id = _to_user;
    IF _org_to IS NULL THEN RAISE EXCEPTION 'Utilizatorul destinație nu are agenție.'; END IF;
  END IF;

  IF _kind = 'user' THEN
    IF _mode = 'reassign' THEN
      UPDATE public.lead_events e SET organization_id = _org_to FROM public.leads l WHERE e.lead_id = l.id AND l.assigned_to = _target;
      UPDATE public.leads SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('leads', _n);
      UPDATE public.contacts SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('contacts', _n);
      UPDATE public.requests SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('requests', _n);
      UPDATE public.activities SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('activities', _n);
      UPDATE public.goals SET organization_id = _org_to, user_id = _to_user, updated_at = now() WHERE user_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('goals', _n);
    ELSE
      DELETE FROM public.activities WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('activities', _n);
      DELETE FROM public.leads WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('leads', _n);
      DELETE FROM public.requests WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('requests', _n);
      DELETE FROM public.contacts WHERE assigned_to = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('contacts', _n);
      DELETE FROM public.goals WHERE user_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('goals', _n);
    END IF;
  ELSE
    IF _mode = 'reassign' THEN
      UPDATE public.lead_events SET organization_id = _org_to WHERE organization_id = _target;
      UPDATE public.leads SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE organization_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('leads', _n);
      UPDATE public.contacts SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE organization_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('contacts', _n);
      UPDATE public.requests SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE organization_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('requests', _n);
      UPDATE public.activities SET organization_id = _org_to, assigned_to = _to_user, updated_at = now() WHERE organization_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('activities', _n);
      UPDATE public.goals SET organization_id = _org_to, user_id = _to_user, updated_at = now() WHERE organization_id = _target;
      GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('goals', _n);
    END IF;
  END IF;
  RETURN _counts;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_reassign_user_data(_from uuid, _to uuid, _actor uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _who uuid := coalesce(_actor, auth.uid());
  _org_from uuid; _org_to uuid; _to_active boolean;
  _counts jsonb := '{}'::jsonb; _n bigint; _p record;
BEGIN
  IF _who IS NULL OR NOT public.has_role(_who, 'superadmin') THEN
    RAISE EXCEPTION 'Acces refuzat: doar un superadmin poate realoca datele unui utilizator.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'Sursa și destinația realocării trebuie să fie diferite.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT organization_id INTO _org_from FROM public.profiles WHERE id = _from;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizatorul sursă nu există.' USING ERRCODE = 'no_data_found'; END IF;
  SELECT organization_id, is_active INTO _org_to, _to_active FROM public.profiles WHERE id = _to;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizatorul destinație nu există.' USING ERRCODE = 'no_data_found'; END IF;
  IF _org_to IS NULL OR _to_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Utilizatorul destinație trebuie să fie activ și să aparțină unei agenții.' USING ERRCODE = 'check_violation';
  END IF;

  IF _org_from IS NOT DISTINCT FROM _org_to THEN
    UPDATE public.properties SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('properties', _n);
    UPDATE public.leads SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('leads', _n);
    UPDATE public.activities SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('activities', _n);
    UPDATE public.requests SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('requests', _n);
    UPDATE public.contacts SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('contacts', _n);
    UPDATE public.goals SET user_id = _to, updated_at = now() WHERE user_id = _from;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('goals', _n);
  ELSE
    _n := 0;
    FOR _p IN SELECT id FROM public.properties WHERE assigned_to = _from LOOP
      PERFORM public.account_deletion_move_property(_p.id, _to, _who);
      _n := _n + 1;
    END LOOP;
    _counts := jsonb_build_object('properties', _n) || public.account_deletion_apply_rest('user', _from, 'reassign', _to, _who);
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org_from, _who, 'user.data_reassigned', 'profiles', _from,
          jsonb_build_object('assigned_to', _from, 'organization_id', _org_from),
          jsonb_build_object('assigned_to', _to, 'organization_id', _org_to, 'moved', _counts, 'at', now()), _who);
  RETURN _counts;
END;
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_arm()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-deletion-worker') THEN
    PERFORM cron.schedule('account-deletion-worker', '* * * * *', 'select public.account_deletion_tick()');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.account_deletion_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE _pending integer;
BEGIN
  SELECT count(*) INTO _pending FROM public.account_deletion_jobs WHERE status IN ('queued','running');
  IF _pending = 0 THEN
    PERFORM cron.unschedule('account-deletion-worker');
    SELECT count(*) INTO _pending FROM public.account_deletion_jobs WHERE status IN ('queued','running');
    IF _pending > 0 THEN PERFORM public.account_deletion_arm(); END IF;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/account-deletion',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('account_deletion')),
    body := '{}'::jsonb
  );
END $$;

CREATE OR REPLACE FUNCTION public.account_deletion_claim(_ttl_seconds integer DEFAULT 120)
RETURNS SETOF public.account_deletion_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.account_deletion_jobs j
     SET locked_until = now() + make_interval(secs => _ttl_seconds),
         status = 'running', started_at = coalesce(j.started_at, now())
   WHERE j.id = (
     SELECT id FROM public.account_deletion_jobs
      WHERE status IN ('queued','running')
        AND (locked_until IS NULL OR locked_until < now())
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;

REVOKE ALL ON FUNCTION public.account_deletion_move_property(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_apply_rest(text, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_arm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_move_property(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_apply_rest(text, uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_arm() TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_claim(integer) TO service_role;