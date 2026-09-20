-- Administrarea promovărilor de portal la nivel de agenție (Imobiliare.ro).
--
-- promotion_service_settings: ce servicii folosește agenția și plafonul ei.
--   enabled = false (implicit) → serviciul nu se folosește în agenție;
--   agency_cap NULL → singurul plafon este rezerva agenției de la portal.
-- promotion_allocations: câte locuri (sau câte puncte, pentru Energy) are
--   fiecare utilizator. Rând absent sau amount NULL = nelimitat în limita agenției.

CREATE TABLE public.promotion_service_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  service_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  agency_cap integer,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_service_settings_cap_nonneg CHECK (agency_cap IS NULL OR agency_cap >= 0),
  CONSTRAINT promotion_service_settings_unique UNIQUE (organization_id, portal_key, service_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_service_settings TO authenticated;
GRANT ALL ON public.promotion_service_settings TO service_role;

ALTER TABLE public.promotion_service_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin gestionează serviciile de promovare"
  ON public.promotion_service_settings FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Administratorul agenției gestionează serviciile agenției"
  ON public.promotion_service_settings FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org());

CREATE TRIGGER promotion_service_settings_touch
  BEFORE UPDATE ON public.promotion_service_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.promotion_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  service_key text NOT NULL,
  user_id uuid NOT NULL,
  amount integer,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_allocations_amount_nonneg CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT promotion_allocations_unique UNIQUE (organization_id, portal_key, service_key, user_id)
);

CREATE INDEX promotion_allocations_user_idx
  ON public.promotion_allocations (organization_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_allocations TO authenticated;
GRANT ALL ON public.promotion_allocations TO service_role;

ALTER TABLE public.promotion_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin gestionează alocările de promovare"
  ON public.promotion_allocations FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Administratorul agenției gestionează alocările agenției"
  ON public.promotion_allocations FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org());

-- Agentul își vede DOAR propria alocare, fără drept de scriere.
CREATE POLICY "Agentul își vede propria alocare de promovare"
  ON public.promotion_allocations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER promotion_allocations_touch
  BEFORE UPDATE ON public.promotion_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
