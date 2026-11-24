-- Lucrările din fundal: pg_net așteaptă cât durează ruta (implicit 5 s tăia execuția). Logica neschimbată.
CREATE OR REPLACE FUNCTION public.account_deletion_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
DECLARE _pending integer;
BEGIN
  SELECT count(*) INTO _pending FROM public.account_deletion_jobs WHERE status IN ('queued','running');
  IF _pending = 0 THEN
    PERFORM cron.unschedule('account-deletion-worker');
    SELECT count(*) INTO _pending FROM public.account_deletion_jobs WHERE status IN ('queued','running');
    IF _pending > 0 THEN PERFORM public.account_deletion_arm(); END IF;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/account-deletion',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('account_deletion')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
END $function$;

CREATE OR REPLACE FUNCTION public.chat_email_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare _pending integer;
begin
  select count(*) into _pending from public.chat_messages m
   join public.chat_participants r on r.conversation_id = m.conversation_id and r.user_id <> m.sender_id
   where m.emailed_at is null and m.created_at > now() - interval '2 days' and m.created_at > r.last_read_at;
  if _pending = 0 then
    perform cron.unschedule('chat-email-worker');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/chat-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-nonce', public.cron_nonce_issue('chat_email')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end $function$;

CREATE OR REPLACE FUNCTION public.collector_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare
  _enabled integer;
begin
  select count(*) into _enabled from public.collector_sources where enabled = true;
  -- Nimic nu rulează automat până când un superadmin activează o sursă.
  if _enabled = 0 then
    perform cron.unschedule('listing-collector-worker');
    select count(*) into _enabled from public.collector_sources where enabled = true;
    if _enabled > 0 then
      perform public.collector_arm();
    end if;
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/listing-collector',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('listing_collector')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.development_clone_kick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/development-clone',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-nonce', public.cron_nonce_issue('development_clone')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'development_clone_kick: %', SQLERRM;
END $function$;

CREATE OR REPLACE FUNCTION public.lacheie_resend_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  _pending integer;
BEGIN
  SELECT count(*) INTO _pending FROM public.lacheie_resend_jobs WHERE status IN ('queued', 'running');
  IF _pending = 0 THEN
    PERFORM cron.unschedule('lacheie-resend-worker');
    -- Re-check after unscheduling: a job inserted in between must not be orphaned.
    SELECT count(*) INTO _pending FROM public.lacheie_resend_jobs WHERE status IN ('queued', 'running');
    IF _pending > 0 THEN
      PERFORM public.lacheie_resend_arm();
    END IF;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/lacheie-resend',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('lacheie_resend')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
END;
$function$;

CREATE OR REPLACE FUNCTION public.olx_direct_refresh_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare _connected integer;
begin
  select count(*) into _connected from public.portal_connections
   where portal = 'olx_direct' and portal_credentials_encrypted is not null;
  if _connected = 0 then
    perform cron.unschedule('olx-direct-token-refresh');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/olx-token-refresh',
    headers := jsonb_build_object('Content-Type','application/json', 'x-cron-nonce', public.cron_nonce_issue('olx_token_refresh')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end; $function$;

CREATE OR REPLACE FUNCTION public.olx_direct_status_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
begin
  if not exists (select 1 from public.portal_listings
     where portal = 'olx_direct' and external_id is not null and status in ('pending','needs_packet')) then
    perform cron.unschedule('olx-direct-status');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/olx-status',
    headers := jsonb_build_object('Content-Type','application/json', 'x-cron-nonce', public.cron_nonce_issue('olx_status')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end; $function$;

CREATE OR REPLACE FUNCTION public.partner_webhook_wake()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
 PERFORM net.http_post(url:='https://www.habitoo.ro/api/public/jobs/partner-webhooks',headers:=jsonb_build_object('Content-Type','application/json','x-cron-nonce',public.cron_nonce_issue('partner_webhooks')),body:='{}'::jsonb,
    timeout_milliseconds := 60000);
END $function$;

CREATE OR REPLACE FUNCTION public.portal_bulk_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  _pending integer;
BEGIN
  SELECT count(*) INTO _pending FROM public.portal_bulk_items WHERE status IN ('queued','running');
  IF _pending = 0 THEN
    PERFORM cron.unschedule('portal-bulk-worker');
    SELECT count(*) INTO _pending FROM public.portal_bulk_items WHERE status IN ('queued','running');
    IF _pending > 0 THEN
      PERFORM public.portal_bulk_arm();
    END IF;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-bulk',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('portal_bulk')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_slot_withdraw_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare
  _pending integer;
begin
  select count(*) into _pending from public.portal_slot_withdraw_jobs where status in ('queued','running');
  if _pending = 0 then
    perform cron.unschedule('portal-slot-withdraw-worker');
    select count(*) into _pending from public.portal_slot_withdraw_jobs where status in ('queued','running');
    if _pending > 0 then
      perform public.portal_slot_withdraw_arm();
    end if;
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-slot-withdraw',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('portal_slot_withdraw')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_status_withdraw_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare
  _pending integer;
begin
  select count(*) into _pending from public.portal_status_withdraw_items where status in ('queued','running');
  if _pending = 0 then
    perform cron.unschedule('portal-status-withdraw-worker');
    select count(*) into _pending from public.portal_status_withdraw_items where status in ('queued','running');
    if _pending > 0 then
      perform public.portal_status_withdraw_arm();
    end if;
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/portal-status-withdraw',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('portal_status_withdraw')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.promotion_withdraw_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare
  _pending integer;
begin
  select count(*) into _pending from public.promotion_withdraw_jobs where status in ('queued','running');
  if _pending = 0 then
    perform cron.unschedule('promotion-withdraw-worker');
    select count(*) into _pending from public.promotion_withdraw_jobs where status in ('queued','running');
    if _pending > 0 then
      perform public.promotion_withdraw_arm();
    end if;
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/promotion-withdraw',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('promotion_withdraw')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.property_import_images_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare
  _pending integer;
  _closed integer;
begin
  -- Rândurile moarte se închid aici, altfel cron-ul s-ar dezarma fără ca jobul să fie finalizat.
  _closed := public.property_import_images_close_dead();
  select count(*) into _pending from public.property_import_images
   where status = 'pending' and (attempts < 3 or locked_until > now());
  if _pending = 0 and _closed = 0 then
    perform cron.unschedule('property-import-images-worker');
    select count(*) into _pending from public.property_import_images
     where status = 'pending' and (attempts < 3 or locked_until > now());
    if _pending > 0 then
      perform public.property_import_images_arm();
    end if;
    return;
  end if;
  -- Și când s-au închis doar rânduri moarte: worker-ul recalculează joburile.
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/property-import-images',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('property_import_images')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.storia_webhook_retry_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare _pending integer; _due integer;
begin
  select count(*) into _pending from public.portal_webhook_events
   where portal = 'storia' and processed = false and signature_valid = true and attempts < 5;
  if _pending = 0 then
    perform cron.unschedule('storia-webhook-retry-worker');
    return;
  end if;
  select count(*) into _due from public.portal_webhook_events
   where portal = 'storia' and processed = false and signature_valid = true and attempts < 5
     and (
       (next_attempt_at is null and received_at <= now() - interval '1 minute')
       or next_attempt_at <= now()
     );
  if _due = 0 then return; end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/storia-webhook-retry',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('storia_webhook_retry')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.subscription_cron_tick()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _res jsonb;
  _run uuid;
  _token text;
  _grace jsonb;
BEGIN
  BEGIN
    _res := public.subscription_enforce_daily();
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.subscription_cron_runs (ok, result, error)
    VALUES (false, '{}'::jsonb, SQLERRM)
    RETURNING id INTO _run;
    RETURN jsonb_build_object('ok', false, 'run_id', _run, 'error', SQLERRM);
  END;
  _grace := coalesce(_res -> 'grace', '[]'::jsonb);
  INSERT INTO public.subscription_cron_runs (ok, result)
  VALUES (true, _res)
  RETURNING id INTO _run;
  IF jsonb_array_length(_grace) > 0 THEN
    _token := public.cron_nonce_issue('subscriptions');
    PERFORM net.http_post(
      url := 'https://crm.habitoo.ro/api/public/cron/subscriptions',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', _token),
      body := jsonb_build_object('emailsOnly', true, 'grace', _grace),
      timeout_milliseconds := 60000);
  END IF;
  RETURN _res || jsonb_build_object('ok', true, 'run_id', _run);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vdi_leads_tick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare _pending integer; _keyed integer;
begin
  select count(*) into _pending from public.portal_webhook_events
   where portal = 'vdi' and processed = false and signature_valid = true and attempts < 5;
  select count(*) into _keyed from public.portal_connections
   where portal = 'vdi' and activated = true and portal_credentials_encrypted is not null;
  if _pending = 0 and _keyed = 0 then
    perform cron.unschedule('vdi-leads-worker');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/vdi-leads',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', public.cron_nonce_issue('vdi_leads')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end;
$function$;