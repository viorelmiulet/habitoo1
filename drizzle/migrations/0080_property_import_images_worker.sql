-- lovable-cron-fallback-reviewed: queue worker armed on enqueue and unscheduled after drain (same pattern as promotion_withdraw)
CREATE OR REPLACE FUNCTION public.claim_property_import_images(_batch_size integer, _lease_seconds integer)
RETURNS SETOF public.property_import_images
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  update public.property_import_images i
     set locked_until = now() + make_interval(secs => greatest(_lease_seconds, 1)),
         attempts = i.attempts + 1,
         updated_at = now()
   where i.id in (
     select id from public.property_import_images
      where status = 'pending'
        and attempts < 3
        and (locked_until is null or locked_until < now())
      order by created_at, ordering
      limit greatest(least(_batch_size, 50), 1)
      for update skip locked
   )
  returning i.*;
$$;
REVOKE ALL ON FUNCTION public.claim_property_import_images(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_property_import_images(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.property_import_images_arm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
begin
  if not exists (select 1 from cron.job where jobname = 'property-import-images-worker') then
    perform cron.schedule('property-import-images-worker', '* * * * *', 'select public.property_import_images_tick()');
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.property_import_images_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
declare
  _pending integer;
begin
  select count(*) into _pending from public.property_import_images where status = 'pending';
  if _pending = 0 then
    perform cron.unschedule('property-import-images-worker');
    select count(*) into _pending from public.property_import_images where status = 'pending';
    if _pending > 0 then
      perform public.property_import_images_arm();
    end if;
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/property-import-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('property_import_images')
    ),
    body := '{}'::jsonb
  );
end;
$$;
REVOKE ALL ON FUNCTION public.property_import_images_arm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_import_images_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_images_arm() TO service_role;