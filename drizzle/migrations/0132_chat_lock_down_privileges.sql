revoke all on public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_presence from anon, authenticated;
grant select on public.chat_conversations to authenticated;
grant select on public.chat_participants to authenticated;
grant update (last_read_at, blocked_at) on public.chat_participants to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant all on public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_presence to service_role;

create or replace function public.chat_participants_guard_keys()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id then
    raise exception 'Conversația și participantul nu pot fi modificate' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger chat_participants_guard_keys before update on public.chat_participants
  for each row execute function public.chat_participants_guard_keys();