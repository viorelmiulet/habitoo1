CREATE OR REPLACE FUNCTION public.portal_publish_kick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
begin
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-publish',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('portal_publish')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end; $function$;