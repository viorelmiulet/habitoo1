REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.video_narrations FROM authenticated, anon;
REVOKE SELECT ON public.video_narrations FROM anon;
GRANT SELECT ON public.video_narrations TO authenticated;
GRANT ALL ON public.video_narrations TO service_role;