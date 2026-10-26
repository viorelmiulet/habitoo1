CREATE TABLE public.onboarding_guide_settings (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 auto_start boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_guide_settings TO authenticated;
GRANT ALL ON public.onboarding_guide_settings TO service_role;
ALTER TABLE public.onboarding_guide_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_settings_own ON public.onboarding_guide_settings TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE TABLE public.onboarding_guide_progress (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 guide_id text NOT NULL CHECK (length(guide_id) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'seen' CHECK (status IN ('seen','skipped','completed')),
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, guide_id)
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_guide_progress TO authenticated;
GRANT ALL ON public.onboarding_guide_progress TO service_role;
ALTER TABLE public.onboarding_guide_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_progress_own ON public.onboarding_guide_progress TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE FUNCTION public.claim_onboarding_guide(p_guide_id text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE claimed integer;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 INSERT INTO public.onboarding_guide_settings(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.onboarding_guide_settings WHERE user_id = auth.uid() AND auto_start FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.onboarding_guide_progress(user_id,guide_id) VALUES(auth.uid(),p_guide_id) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS claimed = ROW_COUNT;
 RETURN claimed = 1;
END $$;
REVOKE ALL ON FUNCTION public.claim_onboarding_guide(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_onboarding_guide(text) TO authenticated;
CREATE FUNCTION public.finish_onboarding_guide(p_guide_id text, p_completed boolean) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
 INSERT INTO public.onboarding_guide_progress(user_id,guide_id,status,completed_at)
 VALUES(auth.uid(),p_guide_id,CASE WHEN p_completed THEN 'completed' ELSE 'skipped' END,CASE WHEN p_completed THEN now() ELSE NULL END)
 ON CONFLICT(user_id,guide_id) DO UPDATE SET
 status = CASE WHEN onboarding_guide_progress.status = 'completed' OR p_completed THEN 'completed' ELSE 'skipped' END,
 completed_at = COALESCE(onboarding_guide_progress.completed_at,EXCLUDED.completed_at), updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.finish_onboarding_guide(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_onboarding_guide(text,boolean) TO authenticated;