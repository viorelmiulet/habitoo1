-- Rulează într-o tranzacție anulată: psql -v ON_ERROR_STOP=1 -f tests/sql/user-notes-rls.sql
begin;
insert into public.user_notes(user_id, content) values
 ('00000000-0000-0000-0000-0000000000b1', 'Notița lui A'),
 ('00000000-0000-0000-0000-0000000000b2', 'Notița lui B');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.user_notes where user_id = '00000000-0000-0000-0000-0000000000b2';
  if n <> 0 then raise exception 'FAIL: A citește notița lui B'; end if;
  select count(*) into n from public.user_notes;
  if n <> 1 then raise exception 'FAIL: A vede % notițe (aștept 1)', n; end if;
  update public.user_notes set content = 'hack' where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A a modificat notița lui B'; end if;
  delete from public.user_notes where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A a șters notița lui B'; end if;
  begin insert into public.user_notes(user_id, content) values ('00000000-0000-0000-0000-0000000000b3', 'x');
    raise exception 'FAIL: A a scris notița altcuiva'; exception when insufficient_privilege then null; end;
  begin update public.user_notes set content = repeat('a', 2001) where user_id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'FAIL: peste 2000 caractere'; exception when check_violation then null; end;
  update public.user_notes set content = 'nou' where user_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL: A nu își poate edita notița'; end if;
  raise notice 'OK: user_notes RLS';
end $$;
rollback;
