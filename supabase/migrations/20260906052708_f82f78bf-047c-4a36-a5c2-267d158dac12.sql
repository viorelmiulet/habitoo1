CREATE TABLE public.site_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Feed portaluri',
  token_prefix text NOT NULL,
  token_hash text NOT NULL,
  last_used_at timestamptz,
  request_count bigint NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX site_feed_tokens_hash_key ON public.site_feed_tokens (token_hash);
CREATE INDEX site_feed_tokens_org_idx ON public.site_feed_tokens (organization_id) WHERE revoked_at IS NULL;

GRANT SELECT (id, organization_id, name, token_prefix, last_used_at, request_count, revoked_at, created_at, updated_at, created_by, updated_by) ON public.site_feed_tokens TO authenticated;
GRANT ALL ON public.site_feed_tokens TO service_role;
ALTER TABLE public.site_feed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_feed_tokens_select ON public.site_feed_tokens FOR SELECT TO authenticated
  USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE TRIGGER site_feed_tokens_touch BEFORE UPDATE ON public.site_feed_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.site_feed_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_prefix text,
  endpoint text NOT NULL,
  method text NOT NULL,
  status integer NOT NULL,
  items integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_feed_access_logs_org_idx ON public.site_feed_access_logs (organization_id, created_at DESC);

GRANT SELECT ON public.site_feed_access_logs TO authenticated;
GRANT ALL ON public.site_feed_access_logs TO service_role;
ALTER TABLE public.site_feed_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_feed_access_logs_select ON public.site_feed_access_logs FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE TABLE public.site_feed_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  views integer NOT NULL DEFAULT 0,
  source text,
  occurred_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX site_feed_visits_unique ON public.site_feed_visits (organization_id, property_id, occurred_on, coalesce(source, ''));

GRANT SELECT ON public.site_feed_visits TO authenticated;
GRANT ALL ON public.site_feed_visits TO service_role;
ALTER TABLE public.site_feed_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_feed_visits_select ON public.site_feed_visits FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE TRIGGER site_feed_visits_touch BEFORE UPDATE ON public.site_feed_visits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();