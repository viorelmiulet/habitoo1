CREATE TABLE public.ai_media_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo_enhance', 'photo_video', 'marketing_image')),
  prompt text NOT NULL DEFAULT '',
  source_url text,
  model text NOT NULL,
  prediction_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  output_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_media_generations_org_idx
  ON public.ai_media_generations (organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_media_generations TO authenticated;
GRANT ALL ON public.ai_media_generations TO service_role;

ALTER TABLE public.ai_media_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin vede toate generarile media"
  ON public.ai_media_generations FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Agentia vede generarile proprii"
  ON public.ai_media_generations FOR SELECT TO authenticated
  USING (organization_id = public.current_org());

CREATE POLICY "Utilizatorul creeaza generari in agentia lui"
  ON public.ai_media_generations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org() AND created_by = auth.uid());

CREATE POLICY "Utilizatorul actualizeaza generarile lui"
  ON public.ai_media_generations FOR UPDATE TO authenticated
  USING (organization_id = public.current_org() AND created_by = auth.uid())
  WITH CHECK (organization_id = public.current_org() AND created_by = auth.uid());

CREATE POLICY "Utilizatorul sterge generarile lui"
  ON public.ai_media_generations FOR DELETE TO authenticated
  USING (organization_id = public.current_org() AND created_by = auth.uid());

CREATE TRIGGER ai_media_generations_touch
  BEFORE UPDATE ON public.ai_media_generations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();