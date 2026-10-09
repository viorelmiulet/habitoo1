create or replace function public.chat_is_platform_admin(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = 'superadmin')
     and exists (select 1 from public.profiles where id = _user and coalesce(is_active, true))
$$;
revoke execute on function public.chat_is_platform_admin(uuid) from public, anon;
grant execute on function public.chat_is_platform_admin(uuid) to authenticated, service_role;

create or replace function public.chat_user_eligible(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.chat_is_platform_admin(_user) or exists (
    select 1 from public.profiles p join public.organizations o on o.id = p.organization_id
    where p.id = _user and coalesce(p.is_active, true)
      and o.status in ('active','trial') and o.archived_at is null
  )
$$;

-- Superadminii apar în grupul platformei (organization_id = UUID zero, „Habitoo”).
create or replace function public.chat_directory()
returns table(user_id uuid, full_name text, avatar_path text, organization_id uuid, organization_name text, last_seen_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Agent'), p.avatar_url,
    case when public.chat_is_platform_admin(p.id) then '00000000-0000-0000-0000-000000000000'::uuid else o.id end,
    case when public.chat_is_platform_admin(p.id) then 'Habitoo' else o.name end,
    pr.last_seen_at
  from public.profiles p
  left join public.organizations o on o.id = p.organization_id
  left join public.chat_presence pr on pr.user_id = p.id
  where auth.uid() is not null and public.chat_user_eligible(auth.uid())
    and (public.chat_is_platform_admin(p.id)
      or (coalesce(p.is_active, true) and o.status in ('active','trial') and o.archived_at is null))
$$;