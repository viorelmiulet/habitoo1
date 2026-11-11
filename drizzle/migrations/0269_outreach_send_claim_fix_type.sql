CREATE OR REPLACE FUNCTION public.outreach_send_claim(_campaign_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.outreach_campaigns; _day timestamptz; _today integer; r public.outreach_recipients; _wait numeric;
BEGIN
  SELECT * INTO c FROM public.outreach_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF NOT FOUND OR c.status::text <> 'sending' THEN RETURN jsonb_build_object('state','not_sending'); END IF;
  UPDATE public.outreach_recipients x SET status = CASE WHEN s.reason = 'bounce' THEN 'bounced'::public.outreach_status ELSE 'unsubscribed'::public.outreach_status END
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