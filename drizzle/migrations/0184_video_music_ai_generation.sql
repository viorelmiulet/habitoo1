ALTER TABLE public.video_music_tracks DROP CONSTRAINT video_music_tracks_style_check;
ALTER TABLE public.video_music_tracks ADD CONSTRAINT video_music_tracks_style_check CHECK (length(btrim(style)) BETWEEN 1 AND 120);
ALTER TABLE public.ai_usage_events ALTER COLUMN organization_id DROP NOT NULL;