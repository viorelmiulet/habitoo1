ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS trashed_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_status text;

ALTER TABLE public.email_threads
  ADD CONSTRAINT email_threads_previous_status_check
  CHECK (previous_status IS NULL OR previous_status IN ('open','archived','spam'));

-- Move to trash, remembering where each conversation came from.
CREATE OR REPLACE FUNCTION public.email_threads_trash(_thread_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.email_threads
     SET previous_status = status, status = 'trash', trashed_at = now()
   WHERE id = ANY(_thread_ids) AND status <> 'trash';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- Restore to the remembered status (or open when unknown).
CREATE OR REPLACE FUNCTION public.email_threads_restore(_thread_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.email_threads
     SET status = COALESCE(previous_status, 'open'), previous_status = NULL, trashed_at = NULL
   WHERE id = ANY(_thread_ids) AND status = 'trash';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- Permanent delete, all-or-nothing. Refuses any thread not in trash.
-- Returns the storage paths of the deleted attachment rows.
CREATE OR REPLACE FUNCTION public.email_threads_purge(_thread_ids uuid[], _actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  locked integer;
  bad integer;
  paths text[];
  msg_total integer;
  r record;
BEGIN
  IF _thread_ids IS NULL OR array_length(_thread_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_threads';
  END IF;

  PERFORM 1 FROM public.email_threads WHERE id = ANY(_thread_ids) FOR UPDATE;
  SELECT count(*) INTO locked FROM public.email_threads WHERE id = ANY(_thread_ids);
  IF locked <> (SELECT count(DISTINCT x) FROM unnest(_thread_ids) x) THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;
  SELECT count(*) INTO bad FROM public.email_threads
   WHERE id = ANY(_thread_ids) AND status <> 'trash';
  IF bad > 0 THEN RAISE EXCEPTION 'thread_not_in_trash'; END IF;

  SELECT COALESCE(array_agg(a.storage_path) FILTER (WHERE a.storage_path IS NOT NULL), '{}')
    INTO paths
    FROM public.email_attachments a
    JOIN public.email_messages m ON m.id = a.message_id
   WHERE m.thread_id = ANY(_thread_ids);

  msg_total := 0;
  FOR r IN
    SELECT t.id, t.subject, t.mailbox_id,
           (SELECT count(*) FROM public.email_messages m WHERE m.thread_id = t.id)::int AS n
      FROM public.email_threads t WHERE t.id = ANY(_thread_ids)
  LOOP
    msg_total := msg_total + r.n;
    INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, created_by)
    VALUES (NULL, _actor, 'mail.thread.purge', 'email_thread', r.id,
            jsonb_build_object('subject', r.subject, 'message_count', r.n, 'mailbox_id', r.mailbox_id),
            _actor);
  END LOOP;

  DELETE FROM public.email_attachments a USING public.email_messages m
   WHERE a.message_id = m.id AND m.thread_id = ANY(_thread_ids);
  DELETE FROM public.email_messages WHERE thread_id = ANY(_thread_ids);
  DELETE FROM public.email_threads WHERE id = ANY(_thread_ids);

  RETURN jsonb_build_object('threads', locked, 'messages', msg_total, 'paths', to_jsonb(paths));
END; $$;

REVOKE ALL ON FUNCTION public.email_threads_trash(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_threads_restore(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_threads_purge(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_threads_trash(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_threads_restore(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_threads_purge(uuid[], uuid) TO service_role;