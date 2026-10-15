ALTER TABLE public.meta_posts ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'facebook' CHECK (platform IN ('facebook','instagram'));
ALTER TABLE public.meta_posts ADD COLUMN IF NOT EXISTS error_code integer;
ALTER TABLE public.meta_posts ADD COLUMN IF NOT EXISTS error_message_raw text;
ALTER TABLE public.meta_posts ADD COLUMN IF NOT EXISTS container_id text;
ALTER TABLE public.meta_posts ADD COLUMN IF NOT EXISTS processing_until timestamptz;
ALTER TABLE public.meta_posts DROP CONSTRAINT IF EXISTS meta_posts_kind_check;
ALTER TABLE public.meta_posts ADD CONSTRAINT meta_posts_kind_check CHECK (kind IN ('photos','poster','video','link','ig_poster','ig_album','ig_photo','ig_reel','ig_story'));
ALTER TABLE public.meta_posts DROP CONSTRAINT IF EXISTS meta_posts_status_check;
ALTER TABLE public.meta_posts ADD CONSTRAINT meta_posts_status_check CHECK (status IN ('pending','processing','published','failed'));
CREATE INDEX IF NOT EXISTS meta_posts_processing_idx ON public.meta_posts(status) WHERE status = 'processing';

CREATE TABLE public.social_temp_files (
  path text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.social_temp_files TO service_role;
ALTER TABLE public.social_temp_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX social_temp_files_created_idx ON public.social_temp_files(created_at);