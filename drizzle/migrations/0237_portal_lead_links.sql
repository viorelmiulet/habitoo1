CREATE TABLE public.portal_lead_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  external_lead_id text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  last_message_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT portal_lead_links_unique UNIQUE (portal, organization_id, external_lead_id)
);
CREATE INDEX portal_lead_links_lead_idx ON public.portal_lead_links (lead_id);

GRANT SELECT ON public.portal_lead_links TO authenticated;
GRANT ALL ON public.portal_lead_links TO service_role;

ALTER TABLE public.portal_lead_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read portal lead links"
ON public.portal_lead_links FOR SELECT TO authenticated
USING (
  public.is_superadmin()
  OR (
    organization_id = public.current_org()
    AND (
      public.is_org_admin()
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = portal_lead_links.lead_id AND l.assigned_to = auth.uid())
    )
  )
);