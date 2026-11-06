-- Rulează cu un rol care poate face `set role authenticated` (ex. instrumentul SQL al proiectului).
-- Totul se anulează la final (excepția „ALL_OK”).
do $$ declare n int; sa uuid; nid uuid; begin
  select user_id into sa from public.user_roles where role = 'superadmin' limit 1;
  if sa is null then raise exception 'SKIP: niciun superadmin'; end if;
  set local role authenticated;

  -- Utilizator obișnuit: nu poate crea sau publica.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  begin insert into public.habitoo_news(title, body, published, published_at) values ('x','y',true,now());
    raise exception 'FAIL: utilizatorul a creat'; exception when insufficient_privilege then null; end;

  -- Superadmin: creează ciornă, apoi publică.
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  insert into public.habitoo_news(title, body) values ('Test A4','text') returning id into nid;
  update public.habitoo_news set published = true, published_at = now() where id = nid;

  -- Utilizatorul vede noutatea publicată, dar nu o poate modifica.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  select count(*) into n from public.habitoo_news where id = nid;
  if n <> 1 then raise exception 'FAIL: noutatea publicată nu se vede'; end if;
  update public.habitoo_news set published = false where id = nid;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: utilizatorul a retras'; end if;
  insert into public.habitoo_news_reads(user_id, news_id) values ('00000000-0000-0000-0000-0000000000c1', nid);
  begin insert into public.habitoo_news_reads(user_id, news_id) values ('00000000-0000-0000-0000-0000000000c2', nid);
    raise exception 'FAIL: citire în numele altuia'; exception when insufficient_privilege then null; end;

  -- Superadmin retrage; utilizatorul nu o mai vede.
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  update public.habitoo_news set published = false where id = nid;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  select count(*) into n from public.habitoo_news where id = nid;
  if n <> 0 then raise exception 'FAIL: noutatea retrasă încă se vede'; end if;

  raise exception 'ALL_OK';
end $$;
