CREATE TABLE public.portal_oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX portal_oauth_states_lookup_idx ON public.portal_oauth_states (portal, state_hash);
CREATE INDEX portal_oauth_states_expires_idx ON public.portal_oauth_states (expires_at);

GRANT ALL ON public.portal_oauth_states TO service_role;

ALTER TABLE public.portal_oauth_states ENABLE ROW LEVEL SECURITY;