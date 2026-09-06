CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'open',
  context_path text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_reply_by_staff boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  CONSTRAINT support_tickets_category_check
    CHECK (category IN ('technical', 'billing', 'feature_request', 'data_import', 'account_access', 'other'))
);

CREATE INDEX support_tickets_org_idx ON public.support_tickets (organization_id, created_at DESC);
CREATE INDEX support_tickets_status_idx ON public.support_tickets (status, last_message_at DESC);
CREATE INDEX support_tickets_creator_idx ON public.support_tickets (created_by, created_at DESC);

GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or agency tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND (created_by = auth.uid() OR public.is_org_admin())
    )
    OR created_by = auth.uid()
  );

CREATE POLICY "create own tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'open'
    AND (organization_id IS NULL OR organization_id = public.current_org())
  );

CREATE TRIGGER support_tickets_touch
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.support_ticket_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid,
  is_staff boolean NOT NULL DEFAULT false,
  is_internal_note boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_idx
  ON public.support_ticket_messages (ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read messages of visible tickets"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    (public.is_superadmin() OR is_internal_note = false)
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
    )
  );

CREATE POLICY "reply on visible tickets"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_internal_note = false
    AND is_staff = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.status <> 'closed'
    )
  );

CREATE TRIGGER support_ticket_messages_touch
  BEFORE UPDATE ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
