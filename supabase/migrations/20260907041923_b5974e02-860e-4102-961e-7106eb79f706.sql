create or replace function public.can_access_ticket(_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_tickets t
    where t.id = _ticket_id
      and (
        public.is_superadmin()
        or t.created_by = auth.uid()
        or (t.organization_id = public.current_org() and public.is_org_admin())
      )
  )
$$;

grant execute on function public.can_access_ticket(uuid) to authenticated;

drop policy if exists "read messages of visible tickets" on public.support_ticket_messages;
create policy "read messages of visible tickets"
on public.support_ticket_messages
for select
to authenticated
using (
  (public.is_superadmin() or is_internal_note = false)
  and public.can_access_ticket(ticket_id)
);

drop policy if exists "reply on visible tickets" on public.support_ticket_messages;
create policy "reply on visible tickets"
on public.support_ticket_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and is_internal_note = false
  and is_staff = false
  and public.can_access_ticket(ticket_id)
  and exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and t.status <> 'closed'
  )
);