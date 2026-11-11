ALTER TYPE public.outreach_campaign_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE public.outreach_campaign_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE public.outreach_campaign_status ADD VALUE IF NOT EXISTS 'completed';

ALTER TABLE public.outreach_campaigns
  ADD COLUMN daily_limit integer NOT NULL DEFAULT 100 CHECK (daily_limit BETWEEN 1 AND 1500),
  ADD COLUMN window_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN window_end time NOT NULL DEFAULT '17:00',
  ADD COLUMN weekdays_only boolean NOT NULL DEFAULT true,
  ADD COLUMN delay_seconds integer NOT NULL DEFAULT 20 CHECK (delay_seconds BETWEEN 5 AND 3600),
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN last_sent_at timestamptz,
  ADD COLUMN last_error text,
  ADD COLUMN paused_reason text,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD CONSTRAINT outreach_campaigns_window CHECK (window_start < window_end);

ALTER TABLE public.outreach_recipients
  ADD COLUMN campaign_id uuid REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN send_claimed_at timestamptz;
CREATE INDEX outreach_recipients_pending ON public.outreach_recipients(list_id, created_at, id) WHERE status = 'pending' AND send_claimed_at IS NULL;
CREATE INDEX outreach_recipients_campaign_claimed ON public.outreach_recipients(campaign_id, send_claimed_at) WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.outreach_in_window(c public.outreach_campaigns, _at timestamptz) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE l timestamp := _at AT TIME ZONE 'Europe/Bucharest';
BEGIN
  IF c.weekdays_only AND extract(isodow FROM l) IN (6,7) THEN RETURN false; END IF;
  RETURN l::time >= c.window_start AND l::time < c.window_end;
END $$;

-- Campaigns the worker should look at right now (cheap idle exit).
CREATE OR REPLACE FUNCTION public.outreach_send_due() RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT c.id FROM public.outreach_campaigns c WHERE c.status::text = 'sending' ORDER BY c.started_at;
END $$;

CREATE OR REPLACE FUNCTION public.outreach_send_claim(_campaign_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.outreach_campaigns; _day timestamptz; _today integer; r public.outreach_recipients; _wait numeric;
BEGIN
  SELECT * INTO c FROM public.outreach_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF NOT FOUND OR c.status::text <> 'sending' THEN RETURN jsonb_build_object('state','not_sending'); END IF;
  UPDATE public.outreach_recipients x SET status = CASE WHEN s.reason = 'bounce' THEN 'bounced'::public.outreach_recipient_status ELSE 'unsubscribed'::public.outreach_recipient_status END
    FROM public.outreach_suppressions s WHERE x.list_id = c.list_id AND x.status = 'pending' AND x.send_claimed_at IS NULL AND s.email = x.email;
  UPDATE public.outreach_recipients SET status = 'failed', error = 'Trimitere întreruptă; folosește „Retrimite”.'
   WHERE campaign_id = c.id AND status = 'pending' AND send_claimed_at < now() - interval '10 minutes';
  IF NOT EXISTS(SELECT 1 FROM public.outreach_recipients WHERE list_id = c.list_id AND status = 'pending') THEN
    UPDATE public.outreach_campaigns SET status = 'completed', completed_at = now() WHERE id = c.id;
    INSERT INTO public.audit_logs(action,entity,entity_id,new_values) VALUES('outreach.campaign_completed','outreach_campaigns',c.id,jsonb_build_object('at',now()));
    RETURN jsonb_build_object('state','completed');
  END IF;
  IF NOT public.outreach_in_window(c, now()) THEN RETURN jsonb_build_object('state','outside_window'); END IF;
  _day := (date_trunc('day', now() AT TIME ZONE 'Europe/Bucharest')) AT TIME ZONE 'Europe/Bucharest';
  SELECT count(*) INTO _today FROM public.outreach_recipients WHERE campaign_id = c.id AND send_claimed_at >= _day;
  IF _today >= c.daily_limit THEN RETURN jsonb_build_object('state','daily_limit'); END IF;
  IF EXISTS(SELECT 1 FROM public.outreach_recipients WHERE campaign_id = c.id AND status = 'pending' AND send_claimed_at IS NOT NULL) THEN
    RETURN jsonb_build_object('state','wait','wait_seconds', c.delay_seconds);
  END IF;
  _wait := extract(epoch FROM (c.last_sent_at + make_interval(secs => c.delay_seconds)) - now());
  IF _wait > 0 THEN RETURN jsonb_build_object('state','wait','wait_seconds', ceil(_wait)); END IF;
  UPDATE public.outreach_recipients x SET send_claimed_at = now(), campaign_id = c.id
   WHERE x.id = (SELECT y.id FROM public.outreach_recipients y
                  WHERE y.list_id = c.list_id AND y.status = 'pending' AND y.send_claimed_at IS NULL
                    AND NOT EXISTS(SELECT 1 FROM public.outreach_suppressions s WHERE s.email = y.email)
                  ORDER BY y.created_at, y.id LIMIT 1 FOR UPDATE SKIP LOCKED)
     AND x.status = 'pending' AND x.send_claimed_at IS NULL
  RETURNING x.* INTO r;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','idle'); END IF;
  UPDATE public.outreach_campaigns SET last_sent_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('state','claimed','recipient', jsonb_build_object('id',r.id,'email',r.email,'agency_name',r.agency_name,'city',r.city,'unsubscribe_token',r.unsubscribe_token),
    'campaign', jsonb_build_object('subject',c.subject,'body_text',c.body_text,'sender_name',c.sender_name,'footer_text',c.footer_text,'name',c.name));
END $$;

CREATE OR REPLACE FUNCTION public.outreach_send_recheck(_recipient_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.outreach_recipients; _ok boolean;
BEGIN
  SELECT * INTO r FROM public.outreach_recipients WHERE id = _recipient_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  _ok := r.status = 'pending' AND r.send_claimed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.outreach_suppressions s WHERE s.email = r.email);
  IF NOT _ok AND r.status = 'pending' THEN
    UPDATE public.outreach_recipients SET status = 'unsubscribed', send_claimed_at = NULL WHERE id = r.id;
  END IF;
  RETURN _ok;
END $$;

CREATE OR REPLACE FUNCTION public.outreach_send_result(_recipient_id uuid, _campaign_id uuid, _ok boolean, _error text, _fatal boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.outreach_campaigns; _reason text;
BEGIN
  SELECT * INTO c FROM public.outreach_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF _ok THEN
    UPDATE public.outreach_recipients SET status = 'sent', sent_at = now(), error = NULL WHERE id = _recipient_id AND status = 'pending';
    UPDATE public.outreach_campaigns SET consecutive_failures = 0, last_sent_at = now() WHERE id = _campaign_id;
  ELSE
    UPDATE public.outreach_recipients SET status = 'failed', error = left(coalesce(_error,'Eroare necunoscută'),500) WHERE id = _recipient_id AND status = 'pending';
    UPDATE public.outreach_campaigns SET consecutive_failures = consecutive_failures + 1, last_error = left(coalesce(_error,'Eroare necunoscută'),500), last_sent_at = now()
     WHERE id = _campaign_id RETURNING * INTO c;
    IF c.status::text = 'sending' AND (_fatal OR c.consecutive_failures >= 5) THEN
      _reason := CASE WHEN _fatal THEN 'Oprire automată: ' || left(coalesce(_error,''),300) ELSE 'Oprire automată după 5 eșecuri consecutive.' END;
      UPDATE public.outreach_campaigns SET status = 'paused', paused_reason = _reason WHERE id = _campaign_id;
      INSERT INTO public.audit_logs(action,entity,entity_id,new_values) VALUES('outreach.campaign_safety_stop','outreach_campaigns',_campaign_id,jsonb_build_object('reason',_reason,'consecutive_failures',c.consecutive_failures,'fatal',_fatal));
      RETURN 'paused';
    END IF;
  END IF;
  SELECT * INTO c FROM public.outreach_campaigns WHERE id = _campaign_id;
  IF c.status::text = 'sending' AND NOT EXISTS(SELECT 1 FROM public.outreach_recipients WHERE list_id = c.list_id AND status = 'pending') THEN
    UPDATE public.outreach_campaigns SET status = 'completed', completed_at = now() WHERE id = _campaign_id;
    INSERT INTO public.audit_logs(action,entity,entity_id,new_values) VALUES('outreach.campaign_completed','outreach_campaigns',_campaign_id,jsonb_build_object('at',now()));
    RETURN 'completed';
  END IF;
  RETURN c.status::text;
END $$;

CREATE OR REPLACE FUNCTION public.outreach_campaign_control(_campaign_id uuid, _action text, _settings jsonb DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.outreach_campaigns; _new text;
BEGIN
  IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.outreach_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF _action = 'settings' THEN
    IF c.status::text IN ('sending','completed') THEN RAISE EXCEPTION 'Setările se pot schimba doar când trimiterea nu rulează.'; END IF;
    UPDATE public.outreach_campaigns SET daily_limit = (_settings->>'daily_limit')::int, window_start = (_settings->>'window_start')::time,
      window_end = (_settings->>'window_end')::time, weekdays_only = (_settings->>'weekdays_only')::boolean, delay_seconds = (_settings->>'delay_seconds')::int
     WHERE id = c.id;
    INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(auth.uid(),'outreach.campaign_settings','outreach_campaigns',c.id,_settings);
    RETURN c.status::text;
  ELSIF _action = 'start' THEN
    IF c.status::text <> 'ready' THEN RAISE EXCEPTION 'Trimiterea poate porni doar pentru o campanie „Gata”.'; END IF;
    IF EXISTS(SELECT 1 FROM public.outreach_campaigns WHERE list_id = c.list_id AND id <> c.id AND status::text IN ('sending','paused')) THEN RAISE EXCEPTION 'O altă campanie a acestei liste este deja în trimitere.'; END IF;
    _new := 'sending';
    UPDATE public.outreach_campaigns SET status = 'sending', started_at = now(), consecutive_failures = 0, paused_reason = NULL WHERE id = c.id;
  ELSIF _action = 'pause' THEN
    IF c.status::text <> 'sending' THEN RAISE EXCEPTION 'Campania nu este în trimitere.'; END IF;
    _new := 'paused';
    UPDATE public.outreach_campaigns SET status = 'paused', paused_reason = 'Pauză manuală.' WHERE id = c.id;
  ELSIF _action = 'resume' THEN
    IF c.status::text <> 'paused' THEN RAISE EXCEPTION 'Campania nu este în pauză.'; END IF;
    _new := 'sending';
    UPDATE public.outreach_campaigns SET status = 'sending', consecutive_failures = 0, paused_reason = NULL WHERE id = c.id;
  ELSE RAISE EXCEPTION 'Unknown action';
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(auth.uid(),'outreach.campaign_'||_action,'outreach_campaigns',c.id,jsonb_build_object('from',c.status::text,'to',_new));
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.outreach_recipient_action(_recipient_id uuid, _action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.outreach_recipients;
BEGIN
  IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.outreach_recipients WHERE id = _recipient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not found'; END IF;
  IF _action = 'retry' THEN
    IF r.status <> 'failed' THEN RAISE EXCEPTION 'Doar destinatarii eșuați pot fi retrimiși.'; END IF;
    IF EXISTS(SELECT 1 FROM public.outreach_suppressions WHERE email = r.email) THEN RAISE EXCEPTION 'Adresa este exclusă și nu mai poate primi mesaje.'; END IF;
    UPDATE public.outreach_recipients SET status = 'pending', error = NULL, send_claimed_at = NULL WHERE id = r.id;
  ELSIF _action = 'bounce' THEN
    UPDATE public.outreach_recipients SET status = 'bounced', send_claimed_at = NULL WHERE id = r.id;
    INSERT INTO public.outreach_suppressions(email, reason) VALUES (r.email, 'bounce') ON CONFLICT (email) DO NOTHING;
  ELSE RAISE EXCEPTION 'Unknown action';
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(auth.uid(),'outreach.recipient_'||_action,'outreach_recipients',r.id,jsonb_build_object('email',r.email,'from',r.status));
END $$;

CREATE OR REPLACE FUNCTION public.outreach_campaign_progress(_campaign_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.outreach_campaigns; _day timestamptz; _counts jsonb; _today integer; _total integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.outreach_campaigns WHERE id = _campaign_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  _day := (date_trunc('day', now() AT TIME ZONE 'Europe/Bucharest')) AT TIME ZONE 'Europe/Bucharest';
  SELECT coalesce(jsonb_object_agg(st, n), '{}'::jsonb), coalesce(sum(n),0) INTO _counts, _total FROM (SELECT status::text st, count(*) n FROM public.outreach_recipients WHERE list_id = c.list_id GROUP BY status) t;
  SELECT count(*) INTO _today FROM public.outreach_recipients WHERE campaign_id = c.id AND send_claimed_at >= _day;
  RETURN jsonb_build_object('status', c.status::text, 'daily_limit', c.daily_limit, 'window_start', to_char(c.window_start,'HH24:MI'), 'window_end', to_char(c.window_end,'HH24:MI'),
    'weekdays_only', c.weekdays_only, 'delay_seconds', c.delay_seconds, 'counts', _counts, 'total', _total, 'sent_today', _today,
    'last_sent_at', c.last_sent_at, 'last_error', c.last_error, 'paused_reason', c.paused_reason);
END $$;

REVOKE ALL ON FUNCTION public.outreach_in_window(public.outreach_campaigns, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_send_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_send_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_send_recheck(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_send_result(uuid, uuid, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_campaign_control(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_recipient_action(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_campaign_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_in_window(public.outreach_campaigns, timestamptz) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_send_due() TO service_role;
GRANT EXECUTE ON FUNCTION public.outreach_send_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.outreach_send_recheck(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.outreach_send_result(uuid, uuid, boolean, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.outreach_campaign_control(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_recipient_action(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_campaign_progress(uuid) TO authenticated, service_role;