-- Rulează într-o tranzacție anulată: psql -v ON_ERROR_STOP=1 -f tests/sql/video-music-rls.sql
begin;
insert into public.video_music_tracks(id,title,style,source_url,storage_path,content_id_checked,active) values
 ('00000000-0000-0000-0000-00000000f001','Activă','Calm','https://pixabay.com/music/a','tracks/a.mp3',true,true),
 ('00000000-0000-0000-0000-00000000f002','Inactivă','Lux','https://pixabay.com/music/b','tracks/b.mp3',true,false);
do $$ begin
  begin insert into public.video_music_tracks(title,style,source_url,storage_path,content_id_checked) values ('x','Calm','https://youtube.com/x','p',true);
    raise exception 'FAIL: link non-Pixabay acceptat'; exception when check_violation then null; end;
  begin insert into public.video_music_tracks(title,style,source_url,storage_path,content_id_checked) values ('x','Calm','https://pixabay.com/x','p',false);
    raise exception 'FAIL: fără bifa Content ID'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.video_music_tracks where id::text like '00000000-0000-0000-0000-00000000f00%';
  if n <> 1 then raise exception 'FAIL: agentul vede % piese (aștept doar cea activă)', n; end if;
  begin insert into public.video_music_tracks(title,style,source_url,storage_path,content_id_checked) values ('x','Calm','https://pixabay.com/x','p',true);
    raise exception 'FAIL: agentul a adăugat'; exception when insufficient_privilege then null; end;
  update public.video_music_tracks set title='hack' where id='00000000-0000-0000-0000-00000000f001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: agentul a modificat'; end if;
  delete from public.video_music_tracks where id='00000000-0000-0000-0000-00000000f001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: agentul a șters'; end if;
  begin insert into storage.objects(bucket_id,name) values ('video-music','tracks/hack.mp3');
    raise exception 'FAIL: agentul a încărcat fișier'; exception when insufficient_privilege then null; end;
  raise notice 'OK: video-music RLS';
end $$;
rollback;
