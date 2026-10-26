CREATE TABLE public.generated_video_clips (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 created_by uuid NOT NULL,
 property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
 property_title text NOT NULL,
 property_reference text,
 file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
 format text NOT NULL CHECK (format IN ('vertical','square','landscape')),
 duration_sec numeric NOT NULL CHECK (duration_sec > 0 AND duration_sec <= 60),
 music_kind text NOT NULL CHECK (music_kind IN ('none','own','track')),
 music_track_id uuid REFERENCES public.video_music_tracks(id) ON DELETE SET NULL,
 music_title text,
 music_style text,
 music_artist text,
 music_license text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.generated_video_clips TO authenticated;
GRANT ALL ON public.generated_video_clips TO service_role;
ALTER TABLE public.generated_video_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY generated_clips_read ON public.generated_video_clips FOR SELECT TO authenticated USING (created_by = auth.uid() AND organization_id = public.current_org());
CREATE POLICY generated_clips_insert ON public.generated_video_clips FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND organization_id = public.current_org() AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.organization_id = public.current_org()));
CREATE INDEX generated_clips_owner_created ON public.generated_video_clips (created_by, organization_id, created_at DESC, id DESC);
COMMENT ON TABLE public.generated_video_clips IS 'Metadata of completed browser video generations; no video or private audio files stored. Music snapshots survive track edits/deletion.';