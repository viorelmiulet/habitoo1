CREATE TABLE public.daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  brief_date date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_sentence text,
  ai_attempted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brief_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_briefs TO authenticated;
GRANT ALL ON public.daily_briefs TO service_role;
ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_briefs own select" ON public.daily_briefs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "daily_briefs own insert" ON public.daily_briefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "daily_briefs own update" ON public.daily_briefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "daily_briefs own delete" ON public.daily_briefs FOR DELETE TO authenticated USING (user_id = auth.uid());