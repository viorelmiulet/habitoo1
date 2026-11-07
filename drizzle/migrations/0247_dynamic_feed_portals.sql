CREATE TABLE public.dynamic_feed_portals (
 slug text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
 key_prefix text NOT NULL UNIQUE CHECK (key_prefix ~ '^hb[a-z]{2}_$'),
 website text NOT NULL CHECK (website ~ '^https://' AND length(website)<=500),
 logo_path text,
 xml_enabled boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 show_public boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dynamic_feed_portals TO authenticated;
GRANT SELECT ON public.dynamic_feed_portals TO anon;
GRANT ALL ON public.dynamic_feed_portals TO service_role;
ALTER TABLE public.dynamic_feed_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY dynamic_feed_portals_public ON public.dynamic_feed_portals FOR SELECT TO anon USING (active AND show_public);
CREATE POLICY dynamic_feed_portals_members ON public.dynamic_feed_portals FOR SELECT TO authenticated USING (active OR public.is_superadmin());
CREATE POLICY dynamic_feed_portals_superadmin_insert ON public.dynamic_feed_portals FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
CREATE POLICY dynamic_feed_portals_superadmin_update ON public.dynamic_feed_portals FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
ALTER TABLE public.portal_index_keys DROP CONSTRAINT portal_index_keys_portal_check;
CREATE FUNCTION public.guard_dynamic_feed_portal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.slug<>OLD.slug OR NEW.key_prefix<>OLD.key_prefix) THEN RAISE EXCEPTION 'Portal identity is immutable'; END IF;
 IF TG_OP='INSERT' AND (NEW.slug=ANY(ARRAY['clickimob','imobli','locuit','imobiliareplus','imove','bazaruldecase','properstar','storia','olx','olx_direct','romimo','publi24','imobiliare_ro','imospot','imo24','imopedia','lacheie','primulanunt','homepitch','vdi','zonata','homedirect','vumsi','ofera','zup','housera','facebook_catalog']) OR NEW.key_prefix=ANY(ARRAY['hbci_','hbim_','hblo_','hbip_','hbmv_','hbbc_','hbps_'])) THEN RAISE EXCEPTION 'Reserved portal identity'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER dynamic_feed_portals_guard BEFORE INSERT OR UPDATE ON public.dynamic_feed_portals FOR EACH ROW EXECUTE FUNCTION public.guard_dynamic_feed_portal();
CREATE FUNCTION public.guard_portal_index_key_portal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (NEW.portal=ANY(ARRAY['clickimob','imobli','locuit','imobiliareplus','imove','bazaruldecase'])) AND NOT EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE slug=NEW.portal) THEN RAISE EXCEPTION 'Unknown index portal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_index_keys_portal_guard BEFORE INSERT OR UPDATE OF portal ON public.portal_index_keys FOR EACH ROW EXECUTE FUNCTION public.guard_portal_index_key_portal();
CREATE FUNCTION public.create_dynamic_feed_portal(_slug text,_name text,_website text,_xml boolean,_public boolean,_logo text,_prefixes text[],_reserved text[],_reserved_prefixes text[],_key_hash text,_last4 text) RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p text;
BEGIN
 IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('dynamic_feed_portal_create'));
 IF _slug=ANY(_reserved) OR EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE slug=_slug) THEN RAISE EXCEPTION 'Identificatorul există deja'; END IF;
 SELECT candidate INTO p FROM unnest(_prefixes) WITH ORDINALITY AS choices(candidate,position) WHERE NOT candidate=ANY(_reserved_prefixes) AND NOT EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE key_prefix=candidate) ORDER BY position LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'Nu există prefix disponibil'; END IF;
 IF _logo IS NOT NULL AND (_logo !~ '^[a-z][a-z0-9-]{1,39}/[a-f0-9-]{36}\.(png|jpg|webp)$' OR split_part(_logo,'/',1)<>_slug) THEN RAISE EXCEPTION 'Logo invalid'; END IF;
 INSERT INTO public.dynamic_feed_portals(slug,display_name,website,xml_enabled,show_public,logo_path,key_prefix,created_by) VALUES(_slug,_name,_website,_xml,_public,_logo,p,auth.uid());
 INSERT INTO public.portal_index_keys(portal,prefix,last4,key_hash,created_by) VALUES(_slug,p,_last4,_key_hash,auth.uid());
 INSERT INTO public.audit_logs(actor_id,action,entity,new_values) VALUES(auth.uid(),'dynamic_feed_portal_created','dynamic_feed_portals',jsonb_build_object('slug',_slug,'xml_enabled',_xml,'show_public',_public));
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.create_dynamic_feed_portal(text,text,text,boolean,boolean,text,text[],text[],text[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_dynamic_feed_portal(text,text,text,boolean,boolean,text,text[],text[],text[],text,text) TO authenticated;
CREATE FUNCTION public.dynamic_feed_portal_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO public.audit_logs(actor_id,action,entity,new_values) VALUES(auth.uid(),'dynamic_feed_portal_updated','dynamic_feed_portals',jsonb_build_object('slug',NEW.slug,'active',NEW.active,'show_public',NEW.show_public)); RETURN NEW;
END $$;
CREATE TRIGGER dynamic_feed_portals_audit AFTER UPDATE ON public.dynamic_feed_portals FOR EACH ROW EXECUTE FUNCTION public.dynamic_feed_portal_audit();