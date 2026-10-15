CREATE TABLE public.youtube_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id text,
  channel_title text,
  channel_thumbnail text,
  refresh_token_enc text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected','expired')),
  connected_by uuid,
  connected_at timestamptz,
  disconnected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.youtube_connections TO service_role;
ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_posts DROP CONSTRAINT meta_posts_platform_check;
ALTER TABLE public.meta_posts ADD CONSTRAINT meta_posts_platform_check CHECK (platform IN ('facebook','instagram','youtube'));
ALTER TABLE public.meta_posts DROP CONSTRAINT meta_posts_kind_check;
ALTER TABLE public.meta_posts ADD CONSTRAINT meta_posts_kind_check CHECK (kind IN ('photos','poster','video','link','ig_poster','ig_album','ig_photo','ig_reel','ig_story','yt_video'));