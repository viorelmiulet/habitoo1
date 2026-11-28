INSERT INTO public.organizations (
  id, name, slug, email, status, is_demo, public_hidden_by_admin,
  public_profile_enabled, demo_seeded_at, demo_seed_version
) VALUES (
  'a7b50000-0000-4000-8000-000000000001',
  'Habitoo Partner API Sandbox',
  'partner-api-sandbox',
  'demo@example.invalid',
  'active',
  true,
  true,
  false,
  now(),
  'partner-api-v1'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  email = EXCLUDED.email,
  status = 'active',
  is_demo = true,
  archived_at = NULL,
  public_hidden_by_admin = true,
  public_profile_enabled = false,
  demo_seeded_at = COALESCE(public.organizations.demo_seeded_at, EXCLUDED.demo_seeded_at),
  demo_seed_version = EXCLUDED.demo_seed_version;

INSERT INTO public.partner_api_test_agencies (organization_id)
VALUES ('a7b50000-0000-4000-8000-000000000001')
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.partner_api_sandbox_organization_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.id = 'a7b50000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'Agenția demo a Partner API nu poate fi ștearsă.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id = 'a7b50000-0000-4000-8000-000000000001'
    AND (
      NEW.is_demo IS NOT TRUE
      OR NEW.archived_at IS NOT NULL
      OR NEW.status IN ('suspended', 'cancelled')
    ) THEN
    RAISE EXCEPTION 'Agenția demo a Partner API nu poate fi ștearsă.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_api_sandbox_organization_guard ON public.organizations;
CREATE TRIGGER partner_api_sandbox_organization_guard
BEFORE UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.partner_api_sandbox_organization_guard();

SELECT public.partner_api_sandbox_reset('cauta-ro');
SELECT public.partner_api_sandbox_reset('propri-ro');