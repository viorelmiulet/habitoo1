ALTER TABLE public.portal_agent_links ADD COLUMN external_account_id text;
COMMENT ON COLUMN public.portal_agent_links.external_account_id IS 'VDI account on which this agent was successfully created; NULL means unknown and requires add. Immutable external_id is preserved across account changes.';

CREATE OR REPLACE FUNCTION public.reset_vdi_agent_links_on_account_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.portal = 'vdi' AND NEW.external_account_id IS DISTINCT FROM OLD.external_account_id THEN
    UPDATE public.portal_agent_links
    SET synced_at = NULL, sent_fingerprint = NULL, last_error = NULL, updated_at = now()
    WHERE organization_id = NEW.organization_id AND portal = 'vdi';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_vdi_agent_links_on_account_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER portal_connections_reset_vdi_agents
AFTER UPDATE OF external_account_id ON public.portal_connections
FOR EACH ROW EXECUTE FUNCTION public.reset_vdi_agent_links_on_account_change();