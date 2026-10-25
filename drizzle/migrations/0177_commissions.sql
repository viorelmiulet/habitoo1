CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  allocated_by_admin boolean NOT NULL DEFAULT false,
  transaction_date date NOT NULL DEFAULT current_date,
  transaction_kind public.transaction_kind NOT NULL,
  property_type text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  location_text text,
  transaction_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (transaction_value >= 0),
  agency_commission numeric(14,2) NOT NULL DEFAULT 0 CHECK (agency_commission >= 0),
  agent_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (agent_amount >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','RON')),
  payer text NOT NULL CHECK (payer IN ('buyer','seller','owner','tenant')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected','cancelled')),
  collected_at date,
  notes text CHECK (notes IS NULL OR length(notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commissions_org_date_idx ON public.commissions(organization_id, transaction_date DESC);
CREATE INDEX commissions_agent_idx ON public.commissions(agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Admin = agency_admin of the caller's own agency (not superadmin cross-agency).
CREATE OR REPLACE FUNCTION public.is_commission_admin(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org IS NOT NULL AND _org = public.current_org() AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
      AND role = 'agency_admin' AND organization_id = _org);
$$;
REVOKE EXECUTE ON FUNCTION public.is_commission_admin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_commission_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.commissions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.allocated_by_admin := public.is_commission_admin(NEW.organization_id) AND NEW.agent_id <> auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.organization_id := OLD.organization_id;
    IF NOT public.is_commission_admin(OLD.organization_id) THEN
      NEW.agent_id := OLD.agent_id;
      NEW.allocated_by_admin := OLD.allocated_by_admin;
    ELSIF NEW.agent_id <> OLD.agent_id THEN
      NEW.allocated_by_admin := NEW.agent_id <> OLD.created_by OR OLD.allocated_by_admin;
    ELSE
      NEW.allocated_by_admin := OLD.allocated_by_admin;
    END IF;
    NEW.updated_at := now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.agent_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Agentul nu face parte din agenție';
  END IF;
  IF NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.properties WHERE id = NEW.property_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Proprietatea nu aparține agenției';
  END IF;
  IF NEW.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = NEW.contact_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Clientul nu aparține agenției';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commissions_guard BEFORE INSERT OR UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.commissions_guard();

CREATE POLICY "Commissions read" ON public.commissions FOR SELECT TO authenticated
  USING (organization_id = public.current_org()
    AND (public.is_commission_admin(organization_id) OR agent_id = auth.uid()));
CREATE POLICY "Commissions insert" ON public.commissions FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org()
    AND (public.is_commission_admin(organization_id) OR agent_id = auth.uid()));
CREATE POLICY "Commissions update" ON public.commissions FOR UPDATE TO authenticated
  USING (organization_id = public.current_org()
    AND (public.is_commission_admin(organization_id)
      OR (agent_id = auth.uid() AND created_by = auth.uid() AND NOT allocated_by_admin)))
  WITH CHECK (organization_id = public.current_org()
    AND (public.is_commission_admin(organization_id)
      OR (agent_id = auth.uid() AND created_by = auth.uid() AND NOT allocated_by_admin)));
CREATE POLICY "Commissions delete" ON public.commissions FOR DELETE TO authenticated
  USING (organization_id = public.current_org()
    AND (public.is_commission_admin(organization_id)
      OR (agent_id = auth.uid() AND created_by = auth.uid() AND NOT allocated_by_admin)));