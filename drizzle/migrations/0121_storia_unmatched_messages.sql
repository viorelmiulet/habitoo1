ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS conversation_id text;
CREATE INDEX IF NOT EXISTS portal_messages_conversation_idx
  ON public.portal_messages (portal, conversation_id) WHERE conversation_id IS NOT NULL;

CREATE TABLE public.portal_unmatched_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal text NOT NULL,
  webhook_event_id uuid,
  ad_ref text,
  conversation_id text,
  external_message_id text,
  sender_name text,
  sender_email text,
  sender_phone text,
  body text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned')),
  assigned_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  assigned_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  assigned_lead_id uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX portal_unmatched_messages_ext_key
  ON public.portal_unmatched_messages (portal, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX portal_unmatched_messages_status_idx ON public.portal_unmatched_messages (status, created_at DESC);

GRANT SELECT ON public.portal_unmatched_messages TO authenticated;
GRANT ALL ON public.portal_unmatched_messages TO service_role;
ALTER TABLE public.portal_unmatched_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads unmatched portal messages"
  ON public.portal_unmatched_messages FOR SELECT TO authenticated
  USING (public.is_superadmin());