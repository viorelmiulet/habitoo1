CREATE TABLE public.habitoo_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  link_url text CHECK (link_url IS NULL OR link_url ~ '^https?://'),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habitoo_news TO authenticated;
GRANT ALL ON public.habitoo_news TO service_role;
ALTER TABLE public.habitoo_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read published news" ON public.habitoo_news FOR SELECT TO authenticated
  USING (published OR public.is_superadmin());
CREATE POLICY "Superadmin inserts news" ON public.habitoo_news FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin updates news" ON public.habitoo_news FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin deletes news" ON public.habitoo_news FOR DELETE TO authenticated USING (public.is_superadmin());
CREATE INDEX habitoo_news_published_idx ON public.habitoo_news (published_at DESC) WHERE published;

CREATE TABLE public.habitoo_news_reads (
  user_id uuid NOT NULL,
  news_id uuid NOT NULL REFERENCES public.habitoo_news(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, news_id)
);
GRANT SELECT, INSERT, DELETE ON public.habitoo_news_reads TO authenticated;
GRANT ALL ON public.habitoo_news_reads TO service_role;
ALTER TABLE public.habitoo_news_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own reads" ON public.habitoo_news_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());