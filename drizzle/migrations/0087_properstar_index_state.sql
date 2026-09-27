CREATE TABLE public.properstar_index_state (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  active boolean NOT NULL,
  last_active_at timestamptz,
  inactive_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.properstar_index_state TO service_role;
ALTER TABLE public.properstar_index_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads properstar index state" ON public.properstar_index_state
  FOR SELECT TO authenticated USING (public.is_superadmin());
GRANT SELECT ON public.properstar_index_state TO authenticated;