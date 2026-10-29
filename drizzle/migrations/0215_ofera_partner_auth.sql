CREATE TABLE public.ofera_partner_auth (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token_encrypted text,
  expires_at timestamptz,
  scope text,
  revision uuid,
  lock_owner uuid,
  lock_until timestamptz
);
GRANT ALL ON public.ofera_partner_auth TO service_role;
ALTER TABLE public.ofera_partner_auth ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ofera_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  path text NOT NULL,
  http_status integer,
  body_status integer,
  success boolean NOT NULL,
  message text NOT NULL,
  log_track_id text,
  raw_response text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ofera_api_logs TO service_role;
ALTER TABLE public.ofera_api_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ofera_api_logs_created_at_idx ON public.ofera_api_logs (created_at);

CREATE FUNCTION public.ofera_token_claim(p_owner uuid, p_rejected_revision uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed boolean;
BEGIN
  INSERT INTO public.ofera_partner_auth(singleton) VALUES (true) ON CONFLICT DO NOTHING;
  UPDATE public.ofera_partner_auth SET lock_owner = p_owner, lock_until = now() + interval '45 seconds'
  WHERE singleton = true AND (lock_until IS NULL OR lock_until < now())
    AND (token_encrypted IS NULL OR expires_at <= now() + interval '5 minutes'
      OR (p_rejected_revision IS NOT NULL AND revision = p_rejected_revision));
  claimed := FOUND;
  RETURN claimed;
END $$;
REVOKE ALL ON FUNCTION public.ofera_token_claim(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ofera_token_claim(uuid, uuid) TO service_role;
COMMENT ON TABLE public.ofera_partner_auth IS 'Server-only encrypted global Ofera partner token, fenced renewal lease; never stores partner credentials.';
COMMENT ON TABLE public.ofera_api_logs IS 'Server-only Ofera per-call redacted diagnostics; credentials and tokens must be removed before insert.';