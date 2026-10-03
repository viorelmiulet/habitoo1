ALTER TABLE public.site_feed_tokens
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'site',
  ADD COLUMN IF NOT EXISTS token_encrypted text;
ALTER TABLE public.site_feed_tokens
  ADD CONSTRAINT site_feed_tokens_scope_check CHECK (scope IN ('site','facebook_catalog'));
CREATE INDEX IF NOT EXISTS site_feed_tokens_org_scope_idx
  ON public.site_feed_tokens (organization_id, scope) WHERE revoked_at IS NULL;