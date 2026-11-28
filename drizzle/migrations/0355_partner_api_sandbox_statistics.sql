CREATE OR REPLACE FUNCTION public.superadmin_agency_stats(_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; m date := date_trunc('month', now() at time zone 'Europe/Bucharest')::date;
begin
  if not coalesce(public.is_superadmin(), false) then raise exception 'Acces refuzat: doar superadmin' using errcode = '42501'; end if;
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
    from organizations o where o.archived_at is null and o.id <> 'a7b50000-0000-4000-8000-000000000001'
      and (_include_demo or not coalesce(o.is_demo,false))
      and public.agency_stats_inactive_reason(o.status::text,o.subscription_expires_at) is null) t;
  return r;
end $$;

CREATE OR REPLACE FUNCTION public.superadmin_platform_totals(_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not coalesce(public.is_superadmin(), false) then raise exception 'Acces refuzat: doar superadmin' using errcode = '42501'; end if;
  with o as (select id, status::text st, is_trial, created_at from organizations where archived_at is null
    and id <> 'a7b50000-0000-4000-8000-000000000001' and (_include_demo or not coalesce(is_demo,false))
    and public.agency_stats_inactive_reason(status::text,subscription_expires_at) is null)
  select jsonb_build_object(
    'agencies_active', (select count(*) from o where st='active' and not coalesce(is_trial,false)),
    'agencies_trial', (select count(*) from o where st='trial' or (st='active' and coalesce(is_trial,false))),
    'agencies_suspended', 0,
    'agencies_new_30d', (select count(*) from o where created_at > now()-interval '30 days'),
    'users_active', (select count(*) from profiles p where p.is_active and p.organization_id in (select id from o)),
    'listings_active', (select count(*) from properties x where x.deleted_at is null and x.status='active' and x.organization_id in (select id from o)),
    'listings_published', (select count(*) from properties x where x.deleted_at is null and x.status='active' and x.organization_id in (select id from o)
        and exists (select 1 from portal_publications pp where pp.property_id=x.id and pp.enabled and pp.status='synced')),
    'leads_30d', (select count(*) from leads l where l.deleted_at is null and l.created_at > now()-interval '30 days' and l.organization_id in (select id from o))
  ) into r;
  return r;
end $$;

CREATE OR REPLACE FUNCTION public.superadmin_inactive_agencies(_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not coalesce(public.is_superadmin(), false) then raise exception 'Acces refuzat: doar superadmin' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.name),'[]'::jsonb) into r from (
    select o.id,o.name,o.status::text status,o.plan,o.is_demo,o.subscription_expires_at,
      public.agency_stats_inactive_reason(o.status::text,o.subscription_expires_at) inactive_reason,
      (select count(*) from profiles pr where pr.organization_id=o.id) users_total,
      (select count(*) from properties x where x.organization_id=o.id and x.deleted_at is null) listings_total,
      greatest(
        (select max(u.last_sign_in_at) from auth.users u join profiles pr on pr.id=u.id where pr.organization_id=o.id),
        (select max(greatest(x.created_at,x.updated_at)) from properties x where x.organization_id=o.id),
        (select max(l.created_at) from leads l where l.organization_id=o.id)) last_activity_at
    from organizations o where o.archived_at is null and o.id <> 'a7b50000-0000-4000-8000-000000000001'
      and (_include_demo or not coalesce(o.is_demo,false))
      and public.agency_stats_inactive_reason(o.status::text,o.subscription_expires_at) is not null) t;
  return r;
end $$;

CREATE OR REPLACE FUNCTION public.superadmin_agency_agent_stats(_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not coalesce(public.is_superadmin(), false) then raise exception 'Acces refuzat: doar superadmin' using errcode = '42501'; end if;
  if _org = 'a7b50000-0000-4000-8000-000000000001' then return '[]'::jsonb; end if;
  if not exists(select 1 from organizations o where o.id=_org and o.archived_at is null
    and public.agency_stats_inactive_reason(o.status::text,o.subscription_expires_at) is null) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into r from (
    select pr.id, pr.full_name, pr.is_active,
      (select string_agg(ur.role::text, ',') from user_roles ur where ur.user_id=pr.id) roles,
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to=pr.id and x.deleted_at is null and x.status='active') listings_active,
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to=pr.id and x.deleted_at is null) listings_total,
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to=pr.id and x.deleted_at is null and x.created_at > now()-interval '30 days') listings_added_30d,
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to=pr.id and x.deleted_at is null and x.status='active'
         and exists (select 1 from portal_publications pp where pp.property_id=x.id and pp.enabled and pp.status='synced')) listings_published,
      (select count(*) from leads l where l.organization_id=_org and l.assigned_to=pr.id and l.deleted_at is null and l.stage not in ('won','lost')) leads_open,
      (select count(*) from activities a where a.organization_id=_org and a.assigned_to=pr.id and a.created_at > now()-interval '7 days') activities_7d,
      (select u.last_sign_in_at from auth.users u where u.id=pr.id) last_sign_in_at
    from profiles pr where pr.organization_id=_org
    union all
    select null, 'Neatribuite', null, null,
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to is null and x.deleted_at is null and x.status='active'),
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to is null and x.deleted_at is null),
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to is null and x.deleted_at is null and x.created_at > now()-interval '30 days'),
      (select count(*) from properties x where x.organization_id=_org and x.assigned_to is null and x.deleted_at is null and x.status='active'
         and exists (select 1 from portal_publications pp where pp.property_id=x.id and pp.enabled and pp.status='synced')),
      (select count(*) from leads l where l.organization_id=_org and l.assigned_to is null and l.deleted_at is null and l.stage not in ('won','lost')),
      null, null) t;
  return r;
end $$;

revoke all on function public.superadmin_inactive_agencies(boolean) from public, anon;
grant execute on function public.superadmin_inactive_agencies(boolean) to authenticated;
revoke all on function public.superadmin_agency_stats(boolean),public.superadmin_platform_totals(boolean),public.superadmin_agency_agent_stats(uuid) from public,anon;
grant execute on function public.superadmin_agency_stats(boolean),public.superadmin_platform_totals(boolean),public.superadmin_agency_agent_stats(uuid) to authenticated;