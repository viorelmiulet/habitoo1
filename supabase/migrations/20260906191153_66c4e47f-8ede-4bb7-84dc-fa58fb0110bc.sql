CREATE TABLE public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  agency text NOT NULL,
  interest text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  source_path text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view contact requests"
  ON public.contact_requests FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can update contact requests"
  ON public.contact_requests FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE INDEX contact_requests_created_at_idx ON public.contact_requests (created_at DESC);