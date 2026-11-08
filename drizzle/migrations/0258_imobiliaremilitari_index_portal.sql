CREATE OR REPLACE FUNCTION public.guard_portal_index_key_portal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (NEW.portal=ANY(ARRAY['clickimob','imobli','imobiliaremilitari','locuit','imobiliareplus','imove','bazaruldecase'])) AND NOT EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE slug=NEW.portal) THEN RAISE EXCEPTION 'Unknown index portal'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_dynamic_feed_portal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.slug<>OLD.slug OR NEW.key_prefix<>OLD.key_prefix) THEN RAISE EXCEPTION 'Portal identity is immutable'; END IF;
 IF TG_OP='INSERT' AND (NEW.slug=ANY(ARRAY['clickimob','imobli','imobiliaremilitari','locuit','imobiliareplus','imove','bazaruldecase','properstar','storia','olx','olx_direct','romimo','publi24','imobiliare_ro','imospot','imo24','imopedia','lacheie','primulanunt','homepitch','vdi','zonata','homedirect','vumsi','ofera','zup','housera','facebook_catalog']) OR NEW.key_prefix=ANY(ARRAY['hbci_','hbim_','hbmi_','hblo_','hbip_','hbmv_','hbbc_','hbps_'])) THEN RAISE EXCEPTION 'Reserved portal identity'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;