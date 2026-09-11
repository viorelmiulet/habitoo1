-- =====================================================================
-- MAIL CENTER — phase 1 schema (Mailgun backed), superadmin-only reads.
-- =====================================================================

CREATE TABLE public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','agency')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  address text NOT NULL,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailboxes_scope_org_ck CHECK (
    (scope = 'platform' AND organization_id IS NULL) OR (scope = 'agency' AND organization_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX mailboxes_address_key ON public.mailboxes (lower(address));
GRANT SELECT ON public.mailboxes TO authenticated;
GRANT ALL ON public.mailboxes TO service_role;
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read mailboxes" ON public.mailboxes
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  subject text,
  subject_key text NOT NULL,
  participants text[] NOT NULL DEFAULT '{}',
  message_count integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_direction text CHECK (last_direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','archived','spam','trash')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_threads_key ON public.email_threads (mailbox_id, subject_key);
CREATE INDEX email_threads_recent ON public.email_threads (mailbox_id, last_message_at DESC);
GRANT SELECT ON public.email_threads TO authenticated;
GRANT ALL ON public.email_threads TO service_role;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read threads" ON public.email_threads
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  provider text NOT NULL DEFAULT 'mailgun',
  provider_message_id text,
  in_reply_to text,
  message_references text[] NOT NULL DEFAULT '{}',
  from_email text NOT NULL,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  reply_to text,
  subject text,
  text_body text,
  stripped_text text,
  html_body text,
  has_attachments boolean NOT NULL DEFAULT false,
  size_bytes integer,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('draft','queued','sent','received','failed')),
  send_key text,
  last_error text,
  delivery_status text NOT NULL DEFAULT 'received'
    CHECK (delivery_status IN ('queued','accepted','delivered','received','temporary_fail','permanent_fail','complained','unsubscribed','failed')),
  delivered_at timestamptz,
  error_code text,
  is_read boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_messages_provider_key
  ON public.email_messages (mailbox_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX email_messages_send_key
  ON public.email_messages (send_key) WHERE send_key IS NOT NULL;
CREATE INDEX email_messages_thread ON public.email_messages (thread_id, created_at DESC);
CREATE INDEX email_messages_mailbox ON public.email_messages (mailbox_id, created_at DESC);
CREATE INDEX email_messages_mailbox_direction ON public.email_messages (mailbox_id, direction, created_at DESC);
CREATE INDEX email_messages_thread_unread ON public.email_messages (thread_id) WHERE is_read = false;
GRANT SELECT ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read messages" ON public.email_messages
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  storage_path text,
  checksum text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','stored','rejected','failed')),
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_attachments_message ON public.email_attachments (message_id);
GRANT SELECT ON public.email_attachments TO authenticated;
GRANT ALL ON public.email_attachments TO service_role;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read attachments" ON public.email_attachments
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'mailgun',
  event_key text NOT NULL,
  event_type text NOT NULL,
  message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  provider_message_id text,
  recipient_hash text,
  severity text,
  reason text,
  error_code text,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_events_key ON public.email_events (provider, event_key);
CREATE INDEX email_events_message ON public.email_events (message_id, received_at DESC);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read email events" ON public.email_events
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('inbound_attachments','outbound_retry')),
  message_id uuid REFERENCES public.email_messages(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_jobs_dedupe ON public.email_jobs (dedupe_key);
CREATE INDEX email_jobs_pending ON public.email_jobs (status, next_retry_at);
GRANT SELECT ON public.email_jobs TO authenticated;
GRANT ALL ON public.email_jobs TO service_role;
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read email jobs" ON public.email_jobs
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.mail_rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_rate_limit_hits_bucket ON public.mail_rate_limit_hits (bucket, created_at DESC);
GRANT ALL ON public.mail_rate_limit_hits TO service_role;
ALTER TABLE public.mail_rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mail_webhook_nonces (
  bucket text NOT NULL,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, token)
);
CREATE INDEX mail_webhook_nonces_created ON public.mail_webhook_nonces (created_at);
GRANT ALL ON public.mail_webhook_nonces TO service_role;
ALTER TABLE public.mail_webhook_nonces ENABLE ROW LEVEL SECURITY;

-- updated_at triggers (project helper)
CREATE TRIGGER mailboxes_touch_updated_at BEFORE UPDATE ON public.mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER email_threads_touch_updated_at BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER email_messages_touch_updated_at BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER email_attachments_touch_updated_at BEFORE UPDATE ON public.email_attachments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER email_jobs_touch_updated_at BEFORE UPDATE ON public.email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sliding-window limiter for the public mail webhooks.
CREATE OR REPLACE FUNCTION public.mail_rate_limit_hit(
  _bucket text, _limit integer, _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  DELETE FROM public.mail_rate_limit_hits
   WHERE created_at < now() - make_interval(secs => _window_seconds * 4);
  SELECT count(*) INTO _count FROM public.mail_rate_limit_hits
   WHERE bucket = _bucket AND created_at > now() - make_interval(secs => _window_seconds);
  IF _count >= _limit THEN RETURN false; END IF;
  INSERT INTO public.mail_rate_limit_hits (bucket) VALUES (_bucket);
  RETURN true;
END; $$;

-- Anti-replay: a Mailgun signing token is accepted exactly once.
CREATE OR REPLACE FUNCTION public.mail_webhook_nonce_claim(
  _bucket text, _token text, _ttl_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inserted integer;
BEGIN
  DELETE FROM public.mail_webhook_nonces
   WHERE created_at < now() - make_interval(secs => _ttl_seconds * 2);
  INSERT INTO public.mail_webhook_nonces (bucket, token) VALUES (_bucket, _token)
  ON CONFLICT (bucket, token) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted > 0;
END; $$;

-- Atomic thread resolution (concurrent callers converge on one row).
CREATE OR REPLACE FUNCTION public.email_thread_upsert(
  _mailbox_id uuid, _subject_key text, _subject text, _participants text[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.email_threads (mailbox_id, subject_key, subject, participants)
  VALUES (_mailbox_id, _subject_key, _subject, COALESCE(_participants, '{}'))
  ON CONFLICT (mailbox_id, subject_key) DO UPDATE
    SET participants = (
          SELECT ARRAY(SELECT DISTINCT unnest(public.email_threads.participants || COALESCE(_participants, '{}')))
        ),
        updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

-- Thread counters, maintained centrally.
CREATE OR REPLACE FUNCTION public.email_thread_refresh(_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _thread_id IS NULL THEN RETURN; END IF;
  UPDATE public.email_threads t SET
    message_count   = COALESCE(s.total, 0),
    unread_count    = COALESCE(s.unread, 0),
    last_message_at = s.last_at,
    last_direction  = s.last_direction,
    updated_at      = now()
  FROM (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE m.is_read = false AND m.direction = 'inbound')::int AS unread,
      max(COALESCE(m.received_at, m.sent_at, m.created_at)) AS last_at,
      (SELECT m2.direction FROM public.email_messages m2
        WHERE m2.thread_id = _thread_id
        ORDER BY COALESCE(m2.received_at, m2.sent_at, m2.created_at) DESC, m2.created_at DESC
        LIMIT 1) AS last_direction
    FROM public.email_messages m WHERE m.thread_id = _thread_id
  ) s
  WHERE t.id = _thread_id;
END; $$;

CREATE OR REPLACE FUNCTION public.email_messages_touch_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.thread_id IS DISTINCT FROM OLD.thread_id THEN
    PERFORM public.email_thread_refresh(OLD.thread_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.email_thread_refresh(OLD.thread_id);
  ELSE
    PERFORM public.email_thread_refresh(NEW.thread_id);
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER email_messages_thread_meta
AFTER INSERT OR DELETE OR UPDATE OF thread_id, is_read, direction, received_at, sent_at
ON public.email_messages
FOR EACH ROW EXECUTE FUNCTION public.email_messages_touch_thread();

-- Deferred job queue (attachment download).
CREATE OR REPLACE FUNCTION public.email_jobs_claim(_kind text, _limit integer DEFAULT 5)
RETURNS TABLE(id uuid, message_id uuid, payload jsonb, attempts integer, max_attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.email_jobs j
    WHERE j.kind = _kind AND j.status IN ('queued','running')
      AND j.next_retry_at <= now()
      AND (j.locked_until IS NULL OR j.locked_until < now())
      AND j.attempts < j.max_attempts
    ORDER BY j.next_retry_at
    LIMIT GREATEST(1, LEAST(_limit, 25))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_jobs j SET
    status = 'running', attempts = j.attempts + 1, locked_until = now() + interval '2 minutes'
  FROM picked p WHERE j.id = p.id
  RETURNING j.id, j.message_id, j.payload, j.attempts, j.max_attempts;
END; $$;

CREATE OR REPLACE FUNCTION public.email_job_finish(_job_id uuid, _ok boolean, _error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.email_jobs j SET
    status = CASE WHEN _ok THEN 'done' WHEN j.attempts >= j.max_attempts THEN 'dead' ELSE 'queued' END,
    locked_until = NULL,
    next_retry_at = CASE WHEN _ok THEN j.next_retry_at
      ELSE now() + make_interval(secs => LEAST(3600, 30 * power(2, GREATEST(j.attempts - 1, 0))::int)) END,
    last_error = CASE WHEN _ok THEN NULL ELSE left(COALESCE(_error, 'unknown'), 300) END
  WHERE j.id = _job_id;
END; $$;

-- One-round-trip thread list (last message + attachment flag joined laterally).
CREATE OR REPLACE FUNCTION public.mail_thread_list(
  _mailbox_id uuid, _status text, _limit integer, _offset integer,
  _unread_only boolean DEFAULT false, _has_attachments boolean DEFAULT NULL
)
RETURNS TABLE(id uuid, mailbox_id uuid, subject text, participants text[], message_count integer,
  unread_count integer, last_message_at timestamptz, last_direction text, status text,
  last_stripped_text text, last_text_body text, last_has_html boolean, has_attachments boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select t.id, t.mailbox_id, t.subject, t.participants, t.message_count, t.unread_count,
    t.last_message_at, t.last_direction, t.status,
    left(m.stripped_text, 400), left(m.text_body, 400),
    coalesce(length(coalesce(m.html_body, '')) > 0, false),
    coalesce(a.has_att, false)
  from public.email_threads t
  left join lateral (
    select em.stripped_text, em.text_body, em.html_body
    from public.email_messages em where em.thread_id = t.id
    order by em.created_at desc, em.id desc limit 1
  ) m on true
  left join lateral (
    select exists (
      select 1 from public.email_attachments ea
      join public.email_messages em2 on em2.id = ea.message_id
      where em2.thread_id = t.id
    ) as has_att
  ) a on true
  where t.status = _status
    and (_mailbox_id is null or t.mailbox_id = _mailbox_id)
    and (coalesce(_unread_only, false) = false or t.unread_count > 0)
    and (_has_attachments is null or coalesce(a.has_att, false) = _has_attachments)
  order by t.last_message_at desc nulls last, t.id desc
  limit greatest(1, least(coalesce(_limit, 50), 100))
  offset greatest(0, coalesce(_offset, 0))
$$;

REVOKE ALL ON FUNCTION public.mail_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mail_webhook_nonce_claim(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_thread_upsert(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_thread_refresh(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_messages_touch_thread() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_jobs_claim(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_job_finish(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mail_thread_list(uuid, text, integer, integer, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_rate_limit_hit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mail_webhook_nonce_claim(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_thread_upsert(uuid, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_thread_refresh(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_jobs_claim(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_job_finish(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mail_thread_list(uuid, text, integer, integer, boolean, boolean) TO service_role;