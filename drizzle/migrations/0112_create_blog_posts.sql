CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  category TEXT NOT NULL DEFAULT 'CRM',
  author_name TEXT NOT NULL DEFAULT 'Echipa Habitoo',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  reading_minutes INTEGER NOT NULL DEFAULT 1 CHECK (reading_minutes >= 1),
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published blog posts are public"
ON public.blog_posts
FOR SELECT
TO anon, authenticated
USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());

CREATE POLICY "Superadmins can read all blog posts"
ON public.blog_posts
FOR SELECT
TO authenticated
USING (public.is_superadmin());

CREATE POLICY "Superadmins can create blog posts"
ON public.blog_posts
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can update blog posts"
ON public.blog_posts
FOR UPDATE
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can delete blog posts"
ON public.blog_posts
FOR DELETE
TO authenticated
USING (public.is_superadmin());

CREATE INDEX blog_posts_publication_idx
ON public.blog_posts (status, published_at DESC);

CREATE INDEX blog_posts_category_idx
ON public.blog_posts (category);

CREATE OR REPLACE FUNCTION public.set_blog_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_posts_set_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_blog_posts_updated_at();