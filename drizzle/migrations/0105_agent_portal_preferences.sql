CREATE TABLE public.agent_portal_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portal_key text NOT NULL CHECK (char_length(portal_key) BETWEEN 1 AND 40),
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_portal_preferences_user_portal_key UNIQUE (user_id, portal_key)
);
CREATE INDEX agent_portal_preferences_org_idx ON public.agent_portal_preferences (organization_id);

GRANT SELECT, INSERT, UPDATE ON public.agent_portal_preferences TO authenticated;
GRANT ALL ON public.agent_portal_preferences TO service_role;

ALTER TABLE public.agent_portal_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prefs select" ON public.agent_portal_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.current_org());
CREATE POLICY "org admin reads org prefs" ON public.agent_portal_preferences
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY "own prefs insert" ON public.agent_portal_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org());
CREATE POLICY "own prefs update" ON public.agent_portal_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.current_org())
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org());