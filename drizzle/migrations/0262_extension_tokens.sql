CREATE TABLE public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  device_name text NOT NULL DEFAULT 'Browser necunoscut',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX extension_tokens_user_idx ON public.extension_tokens(user_id, created_at DESC);
GRANT SELECT ON public.extension_tokens TO authenticated;
GRANT ALL ON public.extension_tokens TO service_role;
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own extension tokens" ON public.extension_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.extension_rate_windows (
  token_id uuid NOT NULL REFERENCES public.extension_tokens(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (token_id, window_start)
);
GRANT ALL ON public.extension_rate_windows TO service_role;
ALTER TABLE public.extension_rate_windows ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.extension_rate_take(_token_id uuid, _limit integer DEFAULT 60) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w timestamptz := date_trunc('minute', now()); n integer;
BEGIN
  INSERT INTO public.extension_rate_windows(token_id, window_start, request_count) VALUES (_token_id, w, 1)
  ON CONFLICT (token_id, window_start) DO UPDATE SET request_count = extension_rate_windows.request_count + 1
  RETURNING request_count INTO n;
  IF random() < 0.01 THEN DELETE FROM public.extension_rate_windows WHERE window_start < now() - interval '1 hour'; END IF;
  RETURN jsonb_build_object('limit', _limit, 'remaining', greatest(0, _limit - n), 'reset', extract(epoch FROM w + interval '1 minute')::bigint, 'allowed', n <= _limit);
END $$;
REVOKE ALL ON FUNCTION public.extension_rate_take(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extension_rate_take(uuid, integer) TO service_role;