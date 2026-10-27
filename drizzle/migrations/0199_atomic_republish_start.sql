-- Closes running republish/imoradar batches older than 15 minutes with no queued/running jobs.
CREATE OR REPLACE FUNCTION public.close_stale_republish_batches(_org uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b record; n integer := 0;
BEGIN
  FOR b IN
    SELECT rb.* FROM public.portal_republish_batches rb
     WHERE rb.status = 'running' AND rb.created_at < now() - interval '15 minutes'
       AND (_org IS NULL OR rb.organization_id = _org)
       AND NOT EXISTS (SELECT 1 FROM public.portal_publish_jobs j WHERE j.republish_batch_id = rb.id AND j.status IN ('queued','running'))
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.portal_republish_batches SET
      succeeded = (SELECT count(*) FROM public.portal_publish_jobs j WHERE j.republish_batch_id = b.id AND j.status = 'done' AND coalesce(j.result_action,'') <> 'skipped'),
      failed = (SELECT count(*) FROM public.portal_publish_jobs j WHERE j.republish_batch_id = b.id AND j.status = 'error'),
      skipped = jsonb_array_length(coalesce(b.skipped_items,'[]'::jsonb)) + (SELECT count(*) FROM public.portal_publish_jobs j WHERE j.republish_batch_id = b.id AND j.status = 'done' AND j.result_action = 'skipped'),
      status = 'done', finished_at = now()
    WHERE id = b.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.close_stale_republish_batches(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_republish_batches(uuid) TO service_role;

-- One transaction: stale cleanup, batch row, all jobs (set-based), audit, worker arm.
CREATE OR REPLACE FUNCTION public.start_portal_republish_batch(
  _org uuid, _requested_by uuid, _scope text, _portal_keys text[], _kind text, _operation text,
  _superadmin boolean, _sync_existing boolean, _skipped_items jsonb, _pairs jsonb, _busy_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _batch uuid; _total integer; _inserted integer; _busy jsonb;
BEGIN
  IF _operation NOT IN ('republish','imoradar') THEN RAISE EXCEPTION 'invalid operation'; END IF;
  PERFORM public.close_stale_republish_batches(_org);
  IF EXISTS (SELECT 1 FROM public.portal_republish_batches WHERE organization_id = _org AND status = 'running') THEN
    RAISE EXCEPTION 'republish_running' USING ERRCODE = '23505';
  END IF;
  _total := jsonb_array_length(coalesce(_pairs,'[]')) + jsonb_array_length(coalesce(_skipped_items,'[]'));
  INSERT INTO public.portal_republish_batches (organization_id, requested_by, scope, kind, portal_keys, total, skipped, skipped_items)
  VALUES (_org, _requested_by, _scope, _kind, coalesce(_portal_keys,'{}'), _total,
          jsonb_array_length(coalesce(_skipped_items,'[]')), coalesce(_skipped_items,'[]'))
  RETURNING id INTO _batch;

  WITH src AS (
    SELECT p.property_id, p.portal_key, p.next_attempt_at
      FROM jsonb_to_recordset(coalesce(_pairs,'[]')) AS p(property_id uuid, portal_key text, next_attempt_at timestamptz)
      JOIN public.properties pr ON pr.id = p.property_id AND pr.organization_id = _org
  ), ins AS (
    INSERT INTO public.portal_publish_jobs (organization_id, property_id, portal_key, enabled, promoted, sync_existing,
      requested_by, superadmin, operation, republish_batch_id, next_attempt_at)
    SELECT _org, property_id, portal_key, true, NULL, _sync_existing, _requested_by, _superadmin, _operation, _batch, next_attempt_at FROM src
    ON CONFLICT (property_id, portal_key) WHERE status IN ('queued','running') DO NOTHING
    RETURNING property_id, portal_key
  )
  SELECT (SELECT count(*) FROM ins),
         coalesce((SELECT jsonb_agg(jsonb_build_object('propertyId', p.property_id, 'portalId', p.portal_key, 'message', _busy_message))
                     FROM jsonb_to_recordset(coalesce(_pairs,'[]')) AS p(property_id uuid, portal_key text)
                    WHERE NOT EXISTS (SELECT 1 FROM ins WHERE ins.property_id = p.property_id AND ins.portal_key = p.portal_key)), '[]')
    INTO _inserted, _busy;

  IF jsonb_array_length(_busy) > 0 THEN
    UPDATE public.portal_republish_batches SET skipped = skipped + jsonb_array_length(_busy), skipped_items = skipped_items || _busy WHERE id = _batch;
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, _requested_by, CASE WHEN _kind = 'imoradar' THEN 'imoradar_backfill_started' ELSE 'portal_republish_started' END,
          'portal_republish_batch', _batch,
          jsonb_build_object('scope', _scope, 'portals', to_jsonb(coalesce(_portal_keys,'{}')), 'queued', _inserted));

  IF _inserted > 0 THEN
    PERFORM public.portal_publish_arm();
  ELSE
    UPDATE public.portal_republish_batches SET status = 'done', finished_at = now() WHERE id = _batch;
  END IF;
  RETURN jsonb_build_object('batch_id', _batch, 'queued', _inserted, 'busy', jsonb_array_length(_busy));
END; $$;
REVOKE ALL ON FUNCTION public.start_portal_republish_batch(uuid, uuid, text, text[], text, text, boolean, boolean, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_portal_republish_batch(uuid, uuid, text, text[], text, text, boolean, boolean, jsonb, jsonb, text) TO service_role;