CREATE TABLE public.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  meta_user_id text,
  user_token_enc text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected')),
  default_page_id text,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.meta_connections TO service_role;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX meta_connections_user_idx ON public.meta_connections(meta_user_id);

CREATE TABLE public.meta_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  name text NOT NULL,
  picture_url text,
  tasks text[] NOT NULL DEFAULT '{}',
  page_token_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, page_id)
);
GRANT ALL ON public.meta_pages TO service_role;
ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meta_instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_row_id uuid NOT NULL REFERENCES public.meta_pages(id) ON DELETE CASCADE,
  ig_user_id text NOT NULL,
  username text,
  picture_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, ig_user_id)
);
GRANT ALL ON public.meta_instagram_accounts TO service_role;
ALTER TABLE public.meta_instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meta_data_deletion_requests (
  confirmation_code text PRIMARY KEY,
  meta_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT ALL ON public.meta_data_deletion_requests TO service_role;
ALTER TABLE public.meta_data_deletion_requests ENABLE ROW LEVEL SECURITY;