CREATE TABLE public.portal_index_state (
  portal text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  active boolean NOT NULL,
  last_active_at timestamptz,
  inactive_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portal, organization_id)
);
GRANT ALL ON public.portal_index_state TO service_role;
ALTER TABLE public.portal_index_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read portal index state" ON public.portal_index_state
  FOR SELECT TO authenticated USING (public.is_superadmin());