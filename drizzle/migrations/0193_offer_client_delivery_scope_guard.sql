CREATE OR REPLACE FUNCTION public.guard_offer_client_delivery_scope() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.agent_id IS DISTINCT FROM auth.uid() OR NEW.organization_id IS DISTINCT FROM public.current_org() THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id=NEW.property_id AND organization_id=NEW.organization_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Proprietate indisponibilă'; END IF;
 IF NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Contact indisponibil'; END IF;
 IF NEW.lead_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads WHERE id=NEW.lead_id AND organization_id=NEW.organization_id AND deleted_at IS NULL AND contact_id IS NOT DISTINCT FROM NEW.contact_id) THEN RAISE EXCEPTION 'Lead indisponibil'; END IF;
 IF TG_OP='UPDATE' AND (NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.recipient IS DISTINCT FROM OLD.recipient OR NEW.agent_id IS DISTINCT FROM OLD.agent_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN RAISE EXCEPTION 'Destinatarul trimiterii nu se poate schimba'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offer_client_delivery_scope BEFORE INSERT OR UPDATE ON public.offer_client_deliveries FOR EACH ROW EXECUTE FUNCTION public.guard_offer_client_delivery_scope();
REVOKE ALL ON FUNCTION public.guard_offer_client_delivery_scope() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guard_offer_client_delivery_scope() TO authenticated,service_role;