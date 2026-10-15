ALTER TABLE public.video_music_tracks DROP CONSTRAINT video_music_tracks_content_id_checked_check;
ALTER TABLE public.video_music_tracks DROP CONSTRAINT video_music_tracks_source_url_check;
ALTER TABLE public.video_music_tracks ADD CONSTRAINT video_music_tracks_source_url_check CHECK (source_url IS NULL OR btrim(source_url) = '' OR source_url ~ '^https://');
COMMENT ON COLUMN public.video_music_tracks.content_id_checked IS 'DEPRECATED: nu se mai foloseste in formular; coloana pastrata pentru istoric.';