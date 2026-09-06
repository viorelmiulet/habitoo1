-- 1. Câmpuri de colaborare pe proprietate
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS collab_commission_percent numeric,
  ADD COLUMN IF NOT EXISTS collab_terms text;

-- 2. Participare la rețeaua de colaborare, per agenție (opt-out)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS collaboration_enabled boolean NOT NULL DEFAULT true;

-- 3. Propuneri de colaborare între agenții
CREATE TABLE public.collaboration_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  client_label text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'viewing', 'declined', 'closed')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.collaboration_proposals TO authenticated;
GRANT ALL ON public.collaboration_proposals TO service_role;
ALTER TABLE public.collaboration_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collab_proposals_select_involved"
  ON public.collaboration_proposals FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR owner_organization_id = public.current_org()
    OR requester_organization_id = public.current_org()
  );

CREATE POLICY "collab_proposals_insert_requester"
  ON public.collaboration_proposals FOR INSERT TO authenticated
  WITH CHECK (
    requester_organization_id = public.current_org()
    AND requester_user_id = auth.uid()
    AND owner_organization_id <> public.current_org()
  );

CREATE POLICY "collab_proposals_update_involved"
  ON public.collaboration_proposals FOR UPDATE TO authenticated
  USING (
    owner_organization_id = public.current_org()
    OR requester_organization_id = public.current_org()
  )
  WITH CHECK (
    owner_organization_id = public.current_org()
    OR requester_organization_id = public.current_org()
  );

CREATE INDEX collaboration_proposals_owner_idx
  ON public.collaboration_proposals (owner_organization_id, created_at DESC);
CREATE INDEX collaboration_proposals_requester_idx
  ON public.collaboration_proposals (requester_organization_id, created_at DESC);

CREATE TRIGGER collaboration_proposals_touch
  BEFORE UPDATE ON public.collaboration_proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Fir de mesaje legat de o propunere
CREATE TABLE public.collaboration_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.collaboration_proposals(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.collaboration_messages TO authenticated;
GRANT ALL ON public.collaboration_messages TO service_role;
ALTER TABLE public.collaboration_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collab_messages_select_involved"
  ON public.collaboration_messages FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.collaboration_proposals p
      WHERE p.id = proposal_id
        AND (p.owner_organization_id = public.current_org()
             OR p.requester_organization_id = public.current_org())
    )
  );

CREATE POLICY "collab_messages_insert_involved"
  ON public.collaboration_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_organization_id = public.current_org()
    AND EXISTS (
      SELECT 1 FROM public.collaboration_proposals p
      WHERE p.id = proposal_id
        AND (p.owner_organization_id = public.current_org()
             OR p.requester_organization_id = public.current_org())
    )
  );

CREATE INDEX collaboration_messages_proposal_idx
  ON public.collaboration_messages (proposal_id, created_at);

-- 5. Index pentru descoperirea ofertelor de colaborare
CREATE INDEX IF NOT EXISTS properties_collaboration_idx
  ON public.properties (collaboration, status)
  WHERE collaboration = true AND deleted_at IS NULL;