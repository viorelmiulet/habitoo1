CREATE OR REPLACE FUNCTION public.cron_nonce_issue(_purpose text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _token text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM public.cron_job_nonces WHERE created_at < now() - interval '1 hour';
  INSERT INTO public.cron_job_nonces (token, purpose) VALUES (_token, _purpose);
  RETURN _token;
END;
$function$;