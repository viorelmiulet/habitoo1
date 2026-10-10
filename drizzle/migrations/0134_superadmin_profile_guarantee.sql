create or replace function public.ensure_superadmin_profile(_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, is_active, organization_id)
  select u.id, coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), u.email), u.email, true, null
  from auth.users u where u.id = _user
  on conflict (id) do nothing;
end $$;
revoke execute on function public.ensure_superadmin_profile(uuid) from public, anon, authenticated;
grant execute on function public.ensure_superadmin_profile(uuid) to service_role;

create or replace function public.user_roles_ensure_superadmin_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'superadmin' then
    perform public.ensure_superadmin_profile(new.user_id);
  end if;
  return new;
end $$;
revoke execute on function public.user_roles_ensure_superadmin_profile() from public, anon, authenticated;
create trigger user_roles_ensure_superadmin_profile after insert or update of role on public.user_roles
  for each row execute function public.user_roles_ensure_superadmin_profile();

-- Superadmin fără profil = activ; doar un profil explicit inactiv îl exclude.
create or replace function public.chat_is_platform_admin(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = 'superadmin')
     and not exists (select 1 from public.profiles where id = _user and is_active is false)
$$;