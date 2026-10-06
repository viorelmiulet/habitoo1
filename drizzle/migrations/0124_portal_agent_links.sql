CREATE SEQUENCE IF NOT EXISTS public.portal_agent_external_seq START 1000;
CREATE TABLE public.portal_agent_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  user_id uuid NOT NULL,
  external_id bigint NOT NULL DEFAULT nextval('public.portal_agent_external_seq'),
  synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, portal, user_id),
  UNIQUE (portal, external_id)
);
GRANT ALL ON public.portal_agent_links TO service_role;
GRANT SELECT ON public.portal_agent_links TO authenticated;
ALTER TABLE public.portal_agent_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads portal agent links" ON public.portal_agent_links
  FOR SELECT TO authenticated USING (public.is_superadmin());
COMMENT ON TABLE public.portal_agent_links IS 'CRM agent -> numeric agent id sent to push portals (e.g. VDI idintern). Immutable external_id.';