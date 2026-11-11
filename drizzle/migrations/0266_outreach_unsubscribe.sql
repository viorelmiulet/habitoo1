CREATE FUNCTION public.outreach_new_token() RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
 SELECT translate(encode(decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex'),'base64'),'+/','-_') $$;
ALTER TABLE public.outreach_recipients ADD COLUMN unsubscribe_token text NOT NULL DEFAULT public.outreach_new_token();
ALTER TABLE public.outreach_recipients ADD CONSTRAINT outreach_recipients_unsubscribe_token_key UNIQUE (unsubscribe_token);
CREATE TABLE public.outreach_unsubscribe_hits (bucket text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX outreach_unsubscribe_hits_idx ON public.outreach_unsubscribe_hits(bucket, created_at);
GRANT ALL ON public.outreach_unsubscribe_hits TO service_role;
ALTER TABLE public.outreach_unsubscribe_hits ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.outreach_unsubscribe_rate(_ip text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := 'ip:'||left(coalesce(nullif(btrim(_ip),''),'unknown'),100); c integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(b,0));
 DELETE FROM public.outreach_unsubscribe_hits WHERE created_at < now() - interval '1 hour';
 SELECT count(*) INTO c FROM public.outreach_unsubscribe_hits WHERE bucket=b AND created_at > now() - interval '10 minutes';
 IF c >= 30 THEN RETURN false; END IF;
 INSERT INTO public.outreach_unsubscribe_hits(bucket) VALUES(b); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.outreach_unsubscribe_rate(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.outreach_unsubscribe_preview(_token text, _ip text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text; l text; d text;
BEGIN
 IF NOT public.outreach_unsubscribe_rate(_ip) THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
 IF _token IS NULL OR _token !~ '^[A-Za-z0-9_-]{64}$' THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT email INTO e FROM public.outreach_recipients WHERE unsubscribe_token=_token;
 IF e IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
 l := split_part(e,'@',1); d := split_part(e,'@',2);
 RETURN jsonb_build_object('status','ok','masked_email',left(l,2)||'***@'||d);
END $$;
CREATE FUNCTION public.outreach_unsubscribe(_token text, _ip text, _channel text DEFAULT 'page') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.outreach_recipients; n integer; was boolean;
BEGIN
 IF NOT public.outreach_unsubscribe_rate(_ip) THEN RETURN 'rate_limited'; END IF;
 IF _token IS NULL OR _token !~ '^[A-Za-z0-9_-]{64}$' THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('outreach_suppressions',0));
 SELECT * INTO r FROM public.outreach_recipients WHERE unsubscribe_token=_token;
 IF r.id IS NULL THEN RETURN 'invalid'; END IF;
 was := EXISTS(SELECT 1 FROM public.outreach_suppressions WHERE email=r.email);
 INSERT INTO public.outreach_suppressions(email,reason) VALUES(r.email,'unsubscribe_link') ON CONFLICT(email) DO NOTHING;
 UPDATE public.outreach_recipients SET status='unsubscribed' WHERE email=r.email AND status<>'unsubscribed';
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(NULL,'outreach.unsubscribe','outreach_recipients',r.id,jsonb_build_object('email',r.email,'channel',CASE WHEN _channel='one_click' THEN 'one_click' ELSE 'page' END,'already_suppressed',was,'affected_recipients',n));
 RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.outreach_unsubscribe_preview(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.outreach_unsubscribe(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outreach_unsubscribe_preview(text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_unsubscribe(text,text,text) TO anon, authenticated, service_role;