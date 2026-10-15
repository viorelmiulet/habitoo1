CREATE TABLE public.video_music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  style text NOT NULL CHECK (style IN ('Elegant','Modern','Corporate','Calm','Lux','Energic')),
  artist text,
  source_url text NOT NULL CHECK (source_url ~* '^https://([a-z0-9-]+\.)*pixabay\.com(/|$)'),
  license text NOT NULL DEFAULT 'Pixabay Content License',
  storage_path text NOT NULL,
  duration_sec numeric,
  certificate_path text,
  content_id_checked boolean NOT NULL DEFAULT false CHECK (content_id_checked),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_music_tracks TO authenticated;
GRANT ALL ON public.video_music_tracks TO service_role;
ALTER TABLE public.video_music_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "music read" ON public.video_music_tracks FOR SELECT TO authenticated USING (active OR public.is_superadmin());
CREATE POLICY "music insert" ON public.video_music_tracks FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
CREATE POLICY "music update" ON public.video_music_tracks FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "music delete" ON public.video_music_tracks FOR DELETE TO authenticated USING (public.is_superadmin());
CREATE TRIGGER video_music_tracks_touch BEFORE UPDATE ON public.video_music_tracks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.meta_posts ADD COLUMN music_track_id uuid REFERENCES public.video_music_tracks(id) ON DELETE SET NULL;
CREATE POLICY "video-music read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'video-music' AND (public.is_superadmin() OR (name NOT LIKE 'certificates/%' AND EXISTS (SELECT 1 FROM public.video_music_tracks t WHERE t.storage_path = storage.objects.name AND t.active))));
CREATE POLICY "video-music insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'video-music' AND public.is_superadmin());
CREATE POLICY "video-music update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'video-music' AND public.is_superadmin());
CREATE POLICY "video-music delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'video-music' AND public.is_superadmin());