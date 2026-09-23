CREATE OR REPLACE FUNCTION public.property_import_images_close_dead()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with closed as (
    update public.property_import_images
       set status = 'failed',
           last_error = 'Întrerupt la ultima încercare.',
           locked_until = null,
           updated_at = now()
     where status = 'pending'
       and attempts >= 3
       and (locked_until is null or locked_until < now())
    returning 1
  )
  select count(*)::integer from closed;
$$;
REVOKE ALL ON FUNCTION public.property_import_images_close_dead() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_images_close_dead() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_property_import_images(_batch_size integer, _lease_seconds integer)
RETURNS SETOF public.property_import_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  perform public.property_import_images_close_dead();
  return query
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
end;
$$;
REVOKE ALL ON FUNCTION public.claim_property_import_images(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_property_import_images(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.property_import_images_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-nonce', public.cron_nonce_issue('property_import_images')
    ),
    body := '{}'::jsonb
  );
end;
$$;
REVOKE ALL ON FUNCTION public.property_import_images_tick() FROM PUBLIC, anon, authenticated;