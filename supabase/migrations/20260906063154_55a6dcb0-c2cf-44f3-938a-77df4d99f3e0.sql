-- ============ portal_connections ============
CREATE TABLE public.portal_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured','ready','connected','error','disconnected')),
  authentication_mode text NOT NULL DEFAULT 'none'
    CHECK (authentication_mode IN ('portal_api_key','habitoo_api_key','oauth','basic_auth','username_password','query_parameter','none')),
  direction text NOT NULL DEFAULT 'habitoo_to_portal'
    CHECK (direction IN ('habitoo_to_portal','portal_to_habitoo','bidirectional')),
  external_account_id text,
  portal_credentials_encrypted text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (organization_id, portal)
);

GRANT SELECT ON public.portal_connections TO authenticated;
REVOKE SELECT (portal_credentials_encrypted) ON public.portal_connections FROM authenticated;
GRANT ALL ON public.portal_connections TO service_role;
ALTER TABLE public.portal_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_connections_select ON public.portal_connections
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE TRIGGER portal_connections_touch BEFORE UPDATE ON public.portal_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ portal_api_keys ============
CREATE TABLE public.portal_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_connection_id uuid REFERENCES public.portal_connections(id) ON DELETE CASCADE,
  portal text NOT NULL,
  label text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  scopes text[] NOT NULL DEFAULT ARRAY['feed:read']::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  request_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  revoked_at timestamptz,
  revoked_by uuid
);

GRANT SELECT ON public.portal_api_keys TO authenticated;
REVOKE SELECT (key_hash) ON public.portal_api_keys FROM authenticated;
GRANT ALL ON public.portal_api_keys TO service_role;
ALTER TABLE public.portal_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_api_keys_select ON public.portal_api_keys
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE INDEX portal_api_keys_org_idx ON public.portal_api_keys (organization_id, portal);

CREATE TRIGGER portal_api_keys_touch BEFORE UPDATE ON public.portal_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ portal_listings ============
CREATE TABLE public.portal_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  external_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','published','updated','withdrawn','error')),
  published_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (organization_id, portal, property_id)
);

GRANT SELECT ON public.portal_listings TO authenticated;
GRANT ALL ON public.portal_listings TO service_role;
ALTER TABLE public.portal_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_listings_select ON public.portal_listings
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE INDEX portal_listings_property_idx ON public.portal_listings (organization_id, property_id);

CREATE TRIGGER portal_listings_touch BEFORE UPDATE ON public.portal_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ portal_operation_logs ============
CREATE TABLE public.portal_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  operation text NOT NULL,
  success boolean NOT NULL,
  error_code text,
  error_message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_operation_logs TO authenticated;
GRANT ALL ON public.portal_operation_logs TO service_role;
ALTER TABLE public.portal_operation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_operation_logs_select ON public.portal_operation_logs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE INDEX portal_operation_logs_org_idx ON public.portal_operation_logs (organization_id, created_at DESC);