CREATE TABLE public.portal_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portal text NOT NULL,
  organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  http_method text NOT NULL,
  signature_present boolean NOT NULL DEFAULT false,
  signature_valid boolean NULL,
  signature_note text NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload text NULL,
  parsed_payload jsonb NULL,
  processed boolean NOT NULL DEFAULT false,
  process_note text NULL
);

CREATE INDEX portal_webhook_events_portal_received_idx
  ON public.portal_webhook_events (portal, received_at DESC);

GRANT ALL ON public.portal_webhook_events TO service_role;
GRANT SELECT ON public.portal_webhook_events TO authenticated;

ALTER TABLE public.portal_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read portal webhook events"
  ON public.portal_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());