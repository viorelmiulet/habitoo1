CREATE TABLE public.ai_model_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  fast_model text,
  standard_model text,
  fallback_model text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_model_settings TO authenticated;
GRANT ALL ON public.ai_model_settings TO service_role;
ALTER TABLE public.ai_model_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads AI models" ON public.ai_model_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin inserts AI models" ON public.ai_model_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin updates AI models" ON public.ai_model_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin')) WITH CHECK (public.has_role(auth.uid(), 'superadmin'));