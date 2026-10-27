-- Atomic queue starts: every start writes all rows and arms its worker in one transaction.
-- Safety nets close work left "running" for over 15 minutes without active jobs.

CREATE OR REPLACE FUNCTION public.close_stale_portal_publish_jobs(_org uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH s AS (
    SELECT id FROM public.portal_publish_jobs
     WHERE status = 'running' AND locked_at < now() - interval '15 minutes' AND attempts >= 4
       AND (_org IS NULL OR organization_id = _org)
     FOR UPDATE SKIP LOCKED)
  UPDATE public.portal_publish_jobs j SET status = 'error', locked_at = NULL, result_ok = false,
         result_message = coalesce(j.result_message, 'Oprit automat: fără progres de peste 15 minute.'), finished_at = now()
    FROM s WHERE j.id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.close_stale_portal_publish_jobs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_portal_publish_jobs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.close_stale_status_withdrawals(_org uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH s AS (
    SELECT id FROM public.portal_status_withdraw_items
     WHERE status = 'running' AND coalesce(locked_until, created_at) < now() - interval '15 minutes'
       AND attempts >= max_attempts AND (_org IS NULL OR organization_id = _org)
     FOR UPDATE SKIP LOCKED)
  UPDATE public.portal_status_withdraw_items i SET status = 'failed', locked_until = NULL, finished_at = now(),
         last_error = coalesce(i.last_error, 'Oprit automat: fără progres de peste 15 minute.')
    FROM s WHERE i.id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.close_stale_status_withdrawals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_status_withdrawals(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.start_status_withdrawals(
  _org uuid, _actor uuid, _reason text, _queued jsonb, _manual jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _inserted integer; _q integer := jsonb_array_length(coalesce(_queued,'[]'));
BEGIN
  PERFORM public.close_stale_status_withdrawals(_org);

  WITH m AS (SELECT * FROM jsonb_to_recordset(coalesce(_manual,'[]')) AS x(property_id uuid, portal_key text, message text))
  UPDATE public.portal_publications p SET enabled = false, status = 'disabled', withdrawn_at = now(),
         withdraw_reason = _reason, updated_by = _actor
    FROM m WHERE p.organization_id = _org AND p.property_id = m.property_id AND p.portal_key = m.portal_key;

  INSERT INTO public.portal_status_withdraw_items (organization_id, property_id, portal_key, reason, status, message, requested_by, finished_at)
  SELECT _org, m.property_id, m.portal_key, _reason, 'manual_required', m.message, _actor, now()
    FROM jsonb_to_recordset(coalesce(_manual,'[]')) AS m(property_id uuid, portal_key text, message text)
    JOIN public.properties pr ON pr.id = m.property_id AND pr.organization_id = _org;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  SELECT _org, _actor, 'portal_auto_withdraw_manual_required', 'property', m.property_id,
         jsonb_build_object('portal', m.portal_key, 'reason', _reason)
    FROM jsonb_to_recordset(coalesce(_manual,'[]')) AS m(property_id uuid, portal_key text);

  WITH src AS (
    SELECT DISTINCT q.property_id, q.portal_key
      FROM jsonb_to_recordset(coalesce(_queued,'[]')) AS q(property_id uuid, portal_key text)
      JOIN public.properties pr ON pr.id = q.property_id AND pr.organization_id = _org
     WHERE NOT EXISTS (SELECT 1 FROM public.portal_status_withdraw_items i
                        WHERE i.property_id = q.property_id AND i.portal_key = q.portal_key AND i.status IN ('queued','running'))
  ), ins AS (
    INSERT INTO public.portal_status_withdraw_items (organization_id, property_id, portal_key, reason, status, requested_by)
    SELECT _org, property_id, portal_key, _reason, 'queued', _actor FROM src
    RETURNING property_id, portal_key
  ), aud AS (
    INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
    SELECT _org, _actor, 'portal_auto_withdraw_queued', 'property', property_id,
           jsonb_build_object('portal', portal_key, 'reason', _reason) FROM ins
    RETURNING 1
  )
  SELECT count(*) INTO _inserted FROM aud;

  IF _q > 0 THEN PERFORM public.portal_status_withdraw_arm(); END IF;
  RETURN jsonb_build_object('queued', _inserted, 'manual', jsonb_array_length(coalesce(_manual,'[]')));
END; $$;
REVOKE ALL ON FUNCTION public.start_status_withdrawals(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_status_withdrawals(uuid, uuid, text, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.start_portal_contact_updates(_org uuid, _actor uuid, _superadmin boolean, _pairs jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; n integer := 0;
BEGIN
  PERFORM public.close_stale_portal_publish_jobs(_org);
  FOR p IN SELECT x.* FROM jsonb_to_recordset(coalesce(_pairs,'[]')) AS x(property_id uuid, portal_key text, next_attempt_at timestamptz)
             JOIN public.properties pr ON pr.id = x.property_id AND pr.organization_id = _org
  LOOP
    PERFORM public.enqueue_portal_contact_update(_org, p.property_id, p.portal_key, _actor, _superadmin, coalesce(p.next_attempt_at, now()));
    n := n + 1;
  END LOOP;
  IF n > 0 THEN PERFORM public.portal_publish_arm(); END IF;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.start_portal_contact_updates(uuid, uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_portal_contact_updates(uuid, uuid, boolean, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.close_stale_portal_bulk_jobs(_org uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH s AS (
    SELECT bj.id FROM public.portal_bulk_jobs bj
     WHERE bj.status IN ('queued','running') AND bj.created_at < now() - interval '15 minutes'
       AND (_org IS NULL OR bj.organization_id = _org)
       AND NOT EXISTS (SELECT 1 FROM public.portal_bulk_items i WHERE i.job_id = bj.id AND i.status IN ('queued','running'))
     FOR UPDATE SKIP LOCKED)
  UPDATE public.portal_bulk_jobs bj SET status = 'done', finished_at = now(),
         done = (SELECT count(*) FROM public.portal_bulk_items i WHERE i.job_id = bj.id AND i.status IN ('ok','skipped')),
         failed = (SELECT count(*) FROM public.portal_bulk_items i WHERE i.job_id = bj.id AND i.status = 'failed')
    FROM s WHERE bj.id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.close_stale_portal_bulk_jobs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_portal_bulk_jobs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.start_portal_bulk_job(_org uuid, _requested_by uuid, _accepted jsonb, _skipped jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _job uuid; _a integer := jsonb_array_length(coalesce(_accepted,'[]')); _s integer := jsonb_array_length(coalesce(_skipped,'[]'));
BEGIN
  PERFORM public.close_stale_portal_bulk_jobs(_org);
  INSERT INTO public.portal_bulk_jobs (organization_id, requested_by, total, done, status, finished_at)
  VALUES (_org, _requested_by, _a + _s, _s, CASE WHEN _a = 0 THEN 'done' ELSE 'queued' END, CASE WHEN _a = 0 THEN now() END)
  RETURNING id INTO _job;
  INSERT INTO public.portal_bulk_items (job_id, property_id, portal_key, enabled, promoted)
  SELECT _job, x.property_id, x.portal_key, x.enabled, x.promoted
    FROM jsonb_to_recordset(coalesce(_accepted,'[]')) AS x(property_id uuid, portal_key text, enabled boolean, promoted boolean)
    JOIN public.properties pr ON pr.id = x.property_id AND pr.organization_id = _org
  ON CONFLICT (job_id, property_id, portal_key) DO NOTHING;
  INSERT INTO public.portal_bulk_items (job_id, property_id, portal_key, enabled, promoted, status, message, finished_at)
  SELECT _job, x.property_id, x.portal_key, x.enabled, x.promoted, 'skipped', x.message, now()
    FROM jsonb_to_recordset(coalesce(_skipped,'[]')) AS x(property_id uuid, portal_key text, enabled boolean, promoted boolean, message text)
    JOIN public.properties pr ON pr.id = x.property_id AND pr.organization_id = _org
  ON CONFLICT (job_id, property_id, portal_key) DO NOTHING;
  IF _a > 0 THEN PERFORM public.portal_bulk_arm(); END IF;
  RETURN jsonb_build_object('job_id', _job, 'queued', _a, 'skipped', _s);
END; $$;
REVOKE ALL ON FUNCTION public.start_portal_bulk_job(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_portal_bulk_job(uuid, uuid, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.start_portal_publish_jobs(_org uuid, _property uuid, _actor uuid, _superadmin boolean, _sync_existing boolean, _jobs jsonb)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _keys text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = _property AND organization_id = _org) THEN
    RAISE EXCEPTION 'property not in organization';
  END IF;
  PERFORM public.close_stale_portal_publish_jobs(_org);
  WITH ins AS (
    INSERT INTO public.portal_publish_jobs (organization_id, property_id, portal_key, enabled, promoted, imobiliare_promotions,
      imobiliare_mode, sync_existing, requested_by, superadmin)
    SELECT _org, _property, x.portal_key, x.enabled, x.promoted, x.imobiliare_promotions, x.imobiliare_mode, _sync_existing, _actor, _superadmin
      FROM jsonb_to_recordset(coalesce(_jobs,'[]')) AS x(portal_key text, enabled boolean, promoted boolean, imobiliare_promotions jsonb, imobiliare_mode text)
    ON CONFLICT (property_id, portal_key) WHERE status IN ('queued','running') DO NOTHING
    RETURNING portal_key)
  SELECT coalesce(array_agg(portal_key), '{}') INTO _keys FROM ins;
  IF cardinality(_keys) > 0 THEN PERFORM public.portal_publish_arm(); END IF;
  RETURN _keys;
END; $$;
REVOKE ALL ON FUNCTION public.start_portal_publish_jobs(uuid, uuid, uuid, boolean, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_portal_publish_jobs(uuid, uuid, uuid, boolean, boolean, jsonb) TO service_role;