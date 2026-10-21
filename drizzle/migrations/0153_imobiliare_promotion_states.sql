CREATE TABLE public.imobiliare_promotion_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reference text NOT NULL,
  promotion_id text NOT NULL,
  value_boolean boolean,
  value_numeric integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT imobiliare_promotion_states_value_check CHECK (value_boolean IS NOT NULL OR value_numeric IS NOT NULL),
  CONSTRAINT imobiliare_promotion_states_unique UNIQUE (organization_id, property_id, promotion_id)
);
GRANT SELECT ON public.imobiliare_promotion_states TO authenticated;
GRANT ALL ON public.imobiliare_promotion_states TO service_role;
ALTER TABLE public.imobiliare_promotion_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read imobiliare promotion states" ON public.imobiliare_promotion_states
  FOR SELECT USING (organization_id = current_org() OR is_superadmin());