CREATE TABLE public.user_notes (
  user_id uuid PRIMARY KEY,
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notes TO authenticated;
GRANT ALL ON public.user_notes TO service_role;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own note only" ON public.user_notes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
COMMENT ON TABLE public.user_notes IS 'Notița personală de pe Acasă; vizibilă doar proprietarului (fără excepție pentru admin/superadmin).';