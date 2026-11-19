
create or replace function public.superadmin_agency_stats(_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; m date := date_trunc('month', now() at time zone 'Europe/Bucharest')::date;
begin
  if not public.is_superadmin() then raise exception 'Acces refuzat: doar superadmin' using errcode = '42501'; end if;
  with o as (select * from organizations where archived_at is null and (_include_demo or not coalesce(is_demo,false))),
  p as (select organization_id, status::text st, created_at, updated_at, id from properties where deleted_at is null and organization_id in (select id from o)),
  ps as (select organization_id, count(*) filter (where st='active') active, count(*) total,
          jsonb_object_agg_strict_dummy from (select 1) x, lateral (select null::jsonb jsonb_object_agg_strict_dummy) y group by 1)
  select 1 into r; -- placeholder replaced below
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into r from (
    select o.id, o.name, o.plan, o.status::text status, o.is_trial, o.is_demo, o.max_users,
      o.subscription_expires_at, o.created_at, o.ai_enabled,
      (select count(*) from properties x where x.organization_id=o.id and x.deleted_at is null and x.status='active') listings_active,
      (select count(*) from properties x where x.organization_id=o.id and x.deleted_at is null) listings_total,
      (select coalesce(jsonb_object_agg(st, c),'{}'::jsonb) from (select status::text st, count(*) c from properties x where x.organization_id=o.id and x.deleted_at is null group by 1) s) listings_by_status,
      (select count(*) from properties x where x.organization_id=o.id and x.deleted_at is null and x.status='active'
         and exists (select 1 from portal_publications pp where pp.property_id=x.id and pp.enabled and pp.status='synced')) listings_published,
      (select count(distinct pp.property_id) from portal_publications pp join properties x on x.id=pp.property_id
         where pp.organization_id=o.id and x.deleted_at is null and pp.enabled and pp.status='error') listings_with_errors,
      (select count(*) from properties x where x.organization_id=o.id and x.deleted_at is null and x.created_at > now()-interval '30 days') listings_added_30d,
      (select count(*) from profiles pr where pr.organization_id=o.id and pr.is_active) users_active,
      (select count(*) from leads l where l.organization_id=o.id and l.deleted_at is null and l.created_at > now()-interval '30 days') leads_new_30d,
      (select count(*) from leads l where l.organization_id=o.id and l.deleted_at is null and l.stage not in ('won','lost')) leads_open,
      (select count(*) from requests q where q.organization_id=o.id and q.status='active') requests_active,
      (select count(*) from contacts c where c.organization_id=o.id) contacts,
      (select coalesce(jsonb_agg(pi.portal_key order by pi.portal_key),'[]'::jsonb) from portal_integrations pi where pi.organization_id=o.id and pi.enabled) portals,
      greatest(
        (select max(u.last_sign_in_at) from auth.users u join profiles pr on pr.id=u.id where pr.organization_id=o.id),
        (select max(greatest(x.created_at,x.updated_at)) from properties x where x.organization_id=o.id),
        (select max(l.created_at) from leads l where l.organization_id=o.id)) last_activity_at,
      exists (select 1 from extension_tokens e where e.organization_id=o.id and e.revoked_at is null) catch_enabled,
      (select count(*) from property_capture_sources cs where cs.organization_id=o.id and cs.created_at > now()-interval '30 days') catch_imports_30d,
      (select coalesce(sum(credits),0) from ai_credit_ledger a where a.organization_id=o.id and a.month_start=m and a.status <> 'refunded') ai_credits_month
    from o) t;
  return r;
end $$;
