-- Locuri de publicare pe portal: total pe agenție și alocări per agent.
-- NULL = nelimitat; lipsa rândului = nelimitat.

CREATE TABLE public.portal_slot_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  total_slots integer,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_slot_limits_total_nonneg CHECK (total_slots IS NULL OR total_slots >= 0),
  CONSTRAINT portal_slot_limits_unique UNIQUE (organization_id, portal_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_slot_limits TO authenticated;
GRANT ALL ON public.portal_slot_limits TO service_role;

ALTER TABLE public.portal_slot_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin gestionează totalurile de locuri"
  ON public.portal_slot_limits FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Administratorul agenției gestionează totalurile agenției"
  ON public.portal_slot_limits FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org());

CREATE TRIGGER portal_slot_limits_touch
  BEFORE UPDATE ON public.portal_slot_limits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.portal_slot_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_key text NOT NULL,
  user_id uuid NOT NULL,
  slots integer,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_slot_allocations_nonneg CHECK (slots IS NULL OR slots >= 0),
  CONSTRAINT portal_slot_allocations_unique UNIQUE (organization_id, portal_key, user_id)
);

CREATE INDEX portal_slot_allocations_user_idx
  ON public.portal_slot_allocations (organization_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_slot_allocations TO authenticated;
GRANT ALL ON public.portal_slot_allocations TO service_role;

ALTER TABLE public.portal_slot_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin gestionează alocările de locuri"
  ON public.portal_slot_allocations FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Administratorul agenției gestionează alocările agenției"
  ON public.portal_slot_allocations FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org());

-- Agentul vede DOAR alocarea lui, fără drept de scriere.
CREATE POLICY "Agentul își vede propria alocare"
  ON public.portal_slot_allocations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER portal_slot_allocations_touch
  BEFORE UPDATE ON public.portal_slot_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Plasa de siguranță în baza de date: reasignarea unei proprietăți nu poate muta
-- consumul către un agent fără locuri libere pe un portal unde oferta e selectată.
CREATE OR REPLACE FUNCTION public.portal_slots_guard_reassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocked text;
BEGIN
  IF new.assigned_to IS NULL OR new.assigned_to IS NOT DISTINCT FROM old.assigned_to THEN
    RETURN new;
  END IF;

  SELECT string_agg(x.portal_key, ', ' ORDER BY x.portal_key)
    INTO blocked
  FROM (
    SELECT pp.portal_key,
           (SELECT a.slots
              FROM public.portal_slot_allocations a
             WHERE a.organization_id = new.organization_id
               AND a.portal_key = pp.portal_key
               AND a.user_id = new.assigned_to) AS allocated,
           (SELECT count(*)
              FROM public.portal_publications p2
              JOIN public.properties pr ON pr.id = p2.property_id
             WHERE p2.organization_id = new.organization_id
               AND p2.portal_key = pp.portal_key
               AND p2.enabled = true
               AND pr.assigned_to = new.assigned_to
               AND pr.id <> new.id) AS used
      FROM public.portal_publications pp
     WHERE pp.organization_id = new.organization_id
       AND pp.property_id = new.id
       AND pp.enabled = true
  ) x
  WHERE x.allocated IS NOT NULL AND x.used >= x.allocated;

  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION 'Agentul nu are locuri libere de publicare pe: %', blocked;
  END IF;

  RETURN new;
END;
$$;

CREATE TRIGGER properties_portal_slots_guard
  BEFORE UPDATE OF assigned_to ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.portal_slots_guard_reassign();