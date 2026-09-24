CREATE OR REPLACE FUNCTION public.email_messages_touch_thread()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.thread_id IS DISTINCT FROM OLD.thread_id THEN
    PERFORM public.email_thread_refresh(OLD.thread_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.email_thread_refresh(OLD.thread_id);
  ELSE
    -- An inbound message revives an archived conversation; outbound never does.
    IF TG_OP = 'INSERT' AND NEW.direction = 'inbound' AND NEW.thread_id IS NOT NULL THEN
      UPDATE public.email_threads SET status = 'open'
       WHERE id = NEW.thread_id AND status = 'archived';
    END IF;
    PERFORM public.email_thread_refresh(NEW.thread_id);
  END IF;
  RETURN NULL;
END; $function$;

-- Subject fallback: reuse a thread only when the counterpart is already a
-- participant and the thread saw activity within _max_age_days; otherwise a
-- new thread is created (suffixed key keeps the unique index intact).
CREATE OR REPLACE FUNCTION public.email_thread_resolve(
  _mailbox_id uuid, _subject_key text, _subject text, _participants text[],
  _counterpart text, _max_age_days integer DEFAULT 30)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _key text := _subject_key;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_mailbox_id::text || '|' || _subject_key));
  IF _counterpart IS NOT NULL AND length(trim(_counterpart)) > 0 THEN
    SELECT t.id INTO _id FROM public.email_threads t
     WHERE t.mailbox_id = _mailbox_id
       AND (t.subject_key = _subject_key
            OR (left(t.subject_key, length(_subject_key) + 1) = _subject_key || '#'
                AND substr(t.subject_key, length(_subject_key) + 2) ~ '^[0-9a-f-]{36}$'))
       AND lower(trim(_counterpart)) IN (SELECT lower(trim(p)) FROM unnest(t.participants) p)
       AND COALESCE(t.last_message_at, t.created_at) > now() - make_interval(days => _max_age_days)
     ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
     LIMIT 1;
  END IF;
  IF _id IS NOT NULL THEN
    UPDATE public.email_threads SET participants = ARRAY(
      SELECT DISTINCT unnest(participants || COALESCE(_participants, '{}')))
     WHERE id = _id;
    RETURN _id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.email_threads WHERE mailbox_id = _mailbox_id AND subject_key = _subject_key) THEN
    _key := _subject_key || '#' || gen_random_uuid()::text;
  END IF;
  INSERT INTO public.email_threads (mailbox_id, subject_key, subject, participants)
  VALUES (_mailbox_id, _key, _subject, COALESCE(_participants, '{}'))
  RETURNING id INTO _id;
  RETURN _id;
END; $function$;

REVOKE ALL ON FUNCTION public.email_thread_resolve(uuid, text, text, text[], text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_thread_resolve(uuid, text, text, text[], text, integer) TO service_role;