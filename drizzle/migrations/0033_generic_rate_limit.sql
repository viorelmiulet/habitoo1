CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_created_idx
  ON public.rate_limit_hits (bucket, created_at DESC);

GRANT ALL ON public.rate_limit_hits TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(_bucket text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  DELETE FROM public.rate_limit_hits
   WHERE created_at < now() - make_interval(secs => _window_seconds * 4);
  SELECT count(*) INTO _count FROM public.rate_limit_hits
   WHERE bucket = _bucket AND created_at > now() - make_interval(secs => _window_seconds);
  IF _count >= _limit THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_hits (bucket) VALUES (_bucket);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;