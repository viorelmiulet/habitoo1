CREATE TABLE public.listing_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  org_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.listing_comments TO authenticated;
GRANT ALL ON public.listing_comments TO service_role;

ALTER TABLE public.listing_comments ENABLE ROW LEVEL SECURITY;

-- Comentariile sunt vizibile tuturor agenților autentificați, din orice agenție.
CREATE POLICY "Agents can read listing comments"
  ON public.listing_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Agents can add own listing comments"
  ON public.listing_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE INDEX listing_comments_listing_created_idx ON public.listing_comments (listing_id, created_at);