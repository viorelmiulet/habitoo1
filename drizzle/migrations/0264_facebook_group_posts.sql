ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS listing_phone text CHECK (listing_phone IS NULL OR length(listing_phone) <= 40),
  ADD COLUMN IF NOT EXISTS whatsapp text CHECK (whatsapp IS NULL OR length(whatsapp) <= 40);

CREATE TABLE public.facebook_group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  group_url text NOT NULL CHECK (length(group_url) <= 2048),
  group_key text NOT NULL CHECK (length(group_key) <= 2048),
  group_name text CHECK (group_name IS NULL OR length(group_name) <= 300),
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX facebook_group_posts_property_idx ON public.facebook_group_posts(property_id, posted_at DESC);
CREATE INDEX facebook_group_posts_group_idx ON public.facebook_group_posts(property_id, group_key, posted_at DESC);
GRANT SELECT ON public.facebook_group_posts TO authenticated;
GRANT ALL ON public.facebook_group_posts TO service_role;
ALTER TABLE public.facebook_group_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Facebook group posts follow property visibility" ON public.facebook_group_posts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = facebook_group_posts.property_id));