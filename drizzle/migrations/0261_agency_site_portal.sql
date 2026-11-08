CREATE TABLE public.agency_site_portals (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_url text CHECK (site_url IS NULL OR site_url ~ '^https://[^\s/]+'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  first_activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.agency_site_portals TO authenticated;
GRANT ALL ON public.agency_site_portals TO service_role;
ALTER TABLE public.agency_site_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_site_portals_select ON public.agency_site_portals
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());
CREATE TRIGGER agency_site_portals_touch BEFORE UPDATE ON public.agency_site_portals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Agențiile cu cheie de site activă: site activ, cu toate anunțurile publicate bifate.
INSERT INTO public.agency_site_portals (organization_id, display_name, active, first_activated_at)
SELECT o.id, left(coalesce(nullif(btrim(o.name), ''), 'Site-ul agenției'), 80), true, now()
FROM public.organizations o
WHERE EXISTS (SELECT 1 FROM public.site_feed_tokens t WHERE t.organization_id = o.id AND t.scope = 'site' AND t.revoked_at IS NULL);

INSERT INTO public.portal_publications (organization_id, property_id, portal_key, enabled, status)
SELECT p.organization_id, p.id, 'agency_site', true, 'synced'
FROM public.properties p
JOIN public.agency_site_portals s ON s.organization_id = p.organization_id
WHERE p.publish_status = 'published' AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.portal_publications pp WHERE pp.property_id = p.id AND pp.portal_key = 'agency_site');

-- Anunțurile noi sunt bifate implicit pentru site-ul activ al agenției.
CREATE OR REPLACE FUNCTION public.agency_site_default_selection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agency_site_portals s WHERE s.organization_id = NEW.organization_id AND s.active) THEN
    INSERT INTO public.portal_publications (organization_id, property_id, portal_key, enabled, status, created_by)
    SELECT NEW.organization_id, NEW.id, 'agency_site', true, 'synced', NEW.created_by
    WHERE NOT EXISTS (SELECT 1 FROM public.portal_publications pp WHERE pp.property_id = NEW.id AND pp.portal_key = 'agency_site');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agency_site_default_selection() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER properties_agency_site_default AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.agency_site_default_selection();