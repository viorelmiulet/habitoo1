-- Rulează într-o tranzacție anulată: psql -v ON_ERROR_STOP=1 -f tests/sql/chat-participants-guard.sql
begin;
insert into public.chat_conversations(id, user_a, user_b) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3');
insert into public.chat_participants(conversation_id, user_id) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int;
begin
  begin
    update public.chat_participants set conversation_id = '00000000-0000-0000-0000-0000000000c2'
     where user_id = auth.uid();
    raise exception 'FAIL: conversation_id schimbat';
  exception when insufficient_privilege then null; end;
  begin
    update public.chat_participants set user_id = '00000000-0000-0000-0000-0000000000a9'
     where user_id = auth.uid();
    raise exception 'FAIL: user_id schimbat';
  exception when insufficient_privilege then null; end;
  begin
    update public.chat_participants set last_email_at = now() where user_id = auth.uid();
    raise exception 'FAIL: last_email_at schimbat';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.chat_messages;
    raise exception 'FAIL: delete pe mesaje';
  exception when insufficient_privilege then null; end;
  begin
    update public.chat_conversations set user_b = auth.uid();
    raise exception 'FAIL: update pe conversații';
  exception when insufficient_privilege then null; end;

  update public.chat_participants set last_read_at = now(), blocked_at = now()
   where conversation_id = '00000000-0000-0000-0000-0000000000c1' and user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: last_read_at/blocare nu funcționează'; end if;

  select count(*) into n from public.chat_participants where conversation_id = '00000000-0000-0000-0000-0000000000c2';
  if n <> 0 then raise exception 'FAIL: vede conversația străină'; end if;
  raise notice 'OK: toate verificările au trecut';
end $$;
rollback;
