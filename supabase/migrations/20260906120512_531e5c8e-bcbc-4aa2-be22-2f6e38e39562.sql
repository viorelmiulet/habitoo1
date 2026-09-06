ALTER TABLE public.portal_connections
  ADD COLUMN IF NOT EXISTS activated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.portal_connections.activated IS
  'Superadmin a activat explicit acest portal pentru agenție (separat de starea tehnică a conexiunii).';