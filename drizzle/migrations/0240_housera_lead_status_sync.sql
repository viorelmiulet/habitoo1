ALTER TABLE public.portal_lead_links ADD COLUMN IF NOT EXISTS status_desired text;
ALTER TABLE public.portal_lead_links ADD COLUMN IF NOT EXISTS status_sent text;
ALTER TABLE public.portal_lead_links ADD COLUMN IF NOT EXISTS status_remote text;
ALTER TABLE public.portal_lead_links ADD COLUMN IF NOT EXISTS status_sync_error text;
ALTER TABLE public.portal_lead_links ADD COLUMN IF NOT EXISTS status_synced_at timestamptz;

CREATE OR REPLACE FUNCTION public.housera_lead_status_for_stage(_stage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _stage
    WHEN 'new' THEN 'new'
    WHEN 'contacted' THEN 'contacted' WHEN 'qualified' THEN 'contacted'
    WHEN 'viewing' THEN 'viewing'
    WHEN 'offer' THEN 'offer' WHEN 'negotiation' THEN 'offer'
    WHEN 'transaction' THEN 'closed' WHEN 'won' THEN 'closed' WHEN 'lost' THEN 'closed'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.leads_housera_status_enqueue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    UPDATE public.portal_lead_links
       SET status_desired = public.housera_lead_status_for_stage(NEW.stage::text), updated_at = now()
     WHERE portal = 'housera' AND lead_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.leads_housera_status_enqueue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_leads_housera_status ON public.leads;
CREATE TRIGGER t_leads_housera_status AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_housera_status_enqueue();

CREATE INDEX IF NOT EXISTS portal_lead_links_status_pending_idx ON public.portal_lead_links (portal, organization_id) WHERE status_desired IS NOT NULL;