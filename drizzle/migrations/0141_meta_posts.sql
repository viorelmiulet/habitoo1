ALTER TABLE public.meta_connections DROP CONSTRAINT IF EXISTS meta_connections_status_check;
ALTER TABLE public.meta_connections ADD CONSTRAINT meta_connections_status_check CHECK (status IN ('connected','disconnected','expired'));

CREATE TABLE public.meta_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  page_name text,
  kind text NOT NULL CHECK (kind IN ('photos','poster','video','link')),
  post_id text,
  permalink_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  error text,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
GRANT ALL ON public.meta_posts TO service_role;
ALTER TABLE public.meta_posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX meta_posts_property_idx ON public.meta_posts(property_id, created_at DESC);