ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in';
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS delivery_error text;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS sent_by uuid;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.portal_messages ADD CONSTRAINT portal_messages_direction_check CHECK (direction IN ('in','out'));
ALTER TABLE public.portal_messages ADD CONSTRAINT portal_messages_delivery_status_check CHECK (delivery_status IS NULL OR delivery_status IN ('sending','sent','failed'));
CREATE INDEX IF NOT EXISTS portal_messages_outbox_idx ON public.portal_messages (portal, delivery_status, next_attempt_at) WHERE direction = 'out';