CREATE TABLE public.organization_ai_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, feature_key)
);

CREATE INDEX organization_ai_features_org_idx ON public.organization_ai_features (organization_id);

GRANT SELECT ON public.organization_ai_features TO authenticated;
GRANT ALL ON public.organization_ai_features TO service_role;

ALTER TABLE public.organization_ai_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin manages ai features"
ON public.organization_ai_features
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

CREATE POLICY "members read own agency ai features"
ON public.organization_ai_features
FOR SELECT
TO authenticated
USING (organization_id = public.current_org());

CREATE TRIGGER organization_ai_features_touch
BEFORE UPDATE ON public.organization_ai_features
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();