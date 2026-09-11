-- Staging area for outbound attachments (a ServerFn cannot carry a File).
CREATE TABLE public.mail_outbound_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '6 hours',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_outbound_uploads_owner ON public.mail_outbound_uploads (created_by, created_at DESC);
CREATE INDEX mail_outbound_uploads_expiry ON public.mail_outbound_uploads (expires_at) WHERE consumed_at IS NULL;
GRANT ALL ON public.mail_outbound_uploads TO service_role;
ALTER TABLE public.mail_outbound_uploads ENABLE ROW LEVEL SECURITY;