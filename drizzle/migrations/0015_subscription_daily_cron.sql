CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Jeton de unică folosință prin care jobul programat își dovedește identitatea
-- către ruta HTTP care trimite emailurile (doar cine are acces la baza de date îl poate emite).
CREATE TABLE IF NOT EXISTS public.cron_job_nonces (
  token text PRIMARY KEY,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_job_nonces TO service_role;
ALTER TABLE public.cron_job_nonces ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cron_nonce_issue(_purpose text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _token text := encode(gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM public.cron_job_nonces WHERE created_at < now() - interval '1 hour';
  INSERT INTO public.cron_job_nonces (token, purpose) VALUES (_token, _purpose);
  RETURN _token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cron_nonce_claim(_purpose text, _token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ok boolean := false;
BEGIN
  DELETE FROM public.cron_job_nonces
   WHERE token = _token
     AND purpose = _purpose
     AND created_at > now() - interval '15 minutes'
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cron_nonce_claim(text, text) TO service_role;

-- Un singur pas zilnic: tranzițiile de stare în baza de date + apelul HTTP pentru emailuri.
CREATE OR REPLACE FUNCTION public.subscription_cron_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _token text;
BEGIN
  _token := public.cron_nonce_issue('subscriptions');
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/subscriptions',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', _token),
    body := '{}'::jsonb
  );
  RETURN jsonb_build_object('scheduled', true);
END;
$function$;