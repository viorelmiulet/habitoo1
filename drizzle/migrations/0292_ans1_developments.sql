CREATE TABLE public.developments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL CHECK(length(trim(name))>0), developer_name text, description text,
 city text, county text, district text, address text, street text, street_number text, county_siruta_code integer, uat_siruta_code integer, locality_siruta_code integer, lat double precision, lng double precision, location_precise boolean NOT NULL DEFAULT false,
 construction_stage text, delivery_date date, buildings_count integer, floors_count integer, total_units integer, amenities text[] NOT NULL DEFAULT '{}', price_from numeric, price_to numeric, currency text NOT NULL DEFAULT 'EUR', assigned_to uuid, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('active','draft','archived')), created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
GRANT SELECT,INSERT,UPDATE ON public.developments TO authenticated; GRANT ALL ON public.developments TO service_role;
ALTER TABLE public.developments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ADD COLUMN development_id uuid REFERENCES public.developments(id) ON DELETE SET NULL, ADD COLUMN market text CHECK(market IN ('primary','secondary'));
CREATE INDEX properties_development_idx ON public.properties(development_id);
CREATE INDEX developments_org_idx ON public.developments(organization_id);
CREATE FUNCTION public.can_access_development(_id uuid, _edit boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.developments d WHERE d.id=_id AND d.deleted_at IS NULL AND (public.is_superadmin() OR (d.organization_id=public.current_org() AND (public.has_role(auth.uid(),'agency_admin') OR d.assigned_to=auth.uid() OR (NOT _edit AND EXISTS(SELECT 1 FROM public.properties p WHERE p.development_id=d.id AND p.assigned_to=auth.uid() AND p.deleted_at IS NULL))))));
$$;
REVOKE ALL ON FUNCTION public.can_access_development(uuid,boolean) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.can_access_development(uuid,boolean) TO authenticated;
CREATE POLICY developments_read ON public.developments FOR SELECT TO authenticated USING(public.can_access_development(id));
CREATE POLICY developments_insert ON public.developments FOR INSERT TO authenticated WITH CHECK(public.is_superadmin() OR (organization_id=public.current_org() AND (assigned_to=auth.uid() OR public.has_role(auth.uid(),'agency_admin'))));
CREATE POLICY developments_update ON public.developments FOR UPDATE TO authenticated USING(public.can_access_development(id,true)) WITH CHECK(public.is_superadmin() OR (organization_id=public.current_org() AND (assigned_to=auth.uid() OR public.has_role(auth.uid(),'agency_admin'))));
CREATE FUNCTION public.development_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'Agenția nu poate fi schimbată'; END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT (public.is_superadmin() OR public.has_role(auth.uid(),'agency_admin')) THEN RAISE EXCEPTION 'Doar administratorul schimbă agentul'; END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND coalesce(current_setting('app.development_delete',true),'')<>OLD.id::text THEN RAISE EXCEPTION 'Folosește ștergerea ansamblului'; END IF;
 END IF;
 IF NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id AND is_active) THEN RAISE EXCEPTION 'Agentul nu aparține agenției'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER development_guard BEFORE INSERT OR UPDATE ON public.developments FOR EACH ROW EXECUTE FUNCTION public.development_guard();
CREATE FUNCTION public.property_development_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.development_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.development_id IS DISTINCT FROM OLD.development_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.developments WHERE id=NEW.development_id AND organization_id=NEW.organization_id AND deleted_at IS NULL) OR NOT public.can_access_development(NEW.development_id,true) THEN RAISE EXCEPTION 'Ansamblu inaccesibil'; END IF;
  NEW.market='primary';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER property_development_guard BEFORE INSERT OR UPDATE OF development_id ON public.properties FOR EACH ROW EXECUTE FUNCTION public.property_development_guard();
CREATE FUNCTION public.attach_development_units(_development uuid, _properties uuid[], _detach boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$ DECLARE n integer; BEGIN
 IF NOT public.can_access_development(_development,true) THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 PERFORM id FROM public.developments WHERE id=_development FOR UPDATE;
 IF EXISTS(SELECT 1 FROM unnest(_properties) x WHERE NOT EXISTS(SELECT 1 FROM public.properties p JOIN public.developments d ON d.id=_development WHERE p.id=x AND p.organization_id=d.organization_id AND p.deleted_at IS NULL AND (NOT _detach OR p.development_id=_development))) THEN RAISE EXCEPTION 'Proprietate inaccesibilă'; END IF;
 UPDATE public.properties SET development_id=CASE WHEN _detach THEN NULL ELSE _development END, market=CASE WHEN _detach THEN market ELSE 'primary' END WHERE id=ANY(_properties);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>(SELECT count(DISTINCT x) FROM unnest(_properties) x) THEN RAISE EXCEPTION 'Acces refuzat la proprietăți'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.attach_development_units(uuid,uuid[],boolean) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.attach_development_units(uuid,uuid[],boolean) TO authenticated;
CREATE FUNCTION public.delete_development(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.can_access_development(_id,true) THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 PERFORM id FROM public.developments WHERE id=_id FOR UPDATE;
 PERFORM set_config('app.development_delete',_id::text,true);
 UPDATE public.properties SET development_id=NULL WHERE development_id=_id;
 UPDATE public.developments SET deleted_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_development(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.delete_development(uuid) TO authenticated;
CREATE TABLE public.development_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), development_id uuid NOT NULL REFERENCES public.developments(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), url text NOT NULL, storage_path text NOT NULL, position integer NOT NULL DEFAULT 0, is_primary boolean NOT NULL DEFAULT false, width integer, height integer, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.development_images TO authenticated; GRANT ALL ON public.development_images TO service_role;
ALTER TABLE public.development_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_images_read ON public.development_images FOR SELECT TO authenticated USING(public.can_access_development(development_id));
CREATE POLICY development_images_write ON public.development_images FOR ALL TO authenticated USING(public.can_access_development(development_id,true)) WITH CHECK(public.can_access_development(development_id,true) AND EXISTS(SELECT 1 FROM public.developments d WHERE d.id=development_id AND d.organization_id=organization_id) AND storage_path LIKE organization_id::text||'/developments/'||development_id::text||'/%' AND url=storage_path);
CREATE INDEX development_images_parent_idx ON public.development_images(development_id,position);
CREATE FUNCTION public.development_unit_summary(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
 IF NOT public.can_access_development(_id) THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 SELECT jsonb_build_object('active',count(*) FILTER(WHERE status='active'),'total',count(*),'price_from',CASE WHEN count(DISTINCT coalesce(sale_currency,currency,'EUR')) FILTER(WHERE status='active' AND for_sale AND sale_price>0)=1 THEN min(sale_price) FILTER(WHERE status='active' AND for_sale AND sale_price>0) END,'price_to',CASE WHEN count(DISTINCT coalesce(sale_currency,currency,'EUR')) FILTER(WHERE status='active' AND for_sale AND sale_price>0)=1 THEN max(sale_price) FILTER(WHERE status='active' AND for_sale AND sale_price>0) END,'currency',min(coalesce(sale_currency,currency,'EUR')) FILTER(WHERE status='active' AND for_sale AND sale_price>0)) INTO result FROM public.properties WHERE development_id=_id AND deleted_at IS NULL;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.development_unit_summary(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.development_unit_summary(uuid) TO authenticated;
COMMENT ON COLUMN public.developments.price_from IS 'Optional manual override; automatic range is read through development_unit_summary';
COMMENT ON COLUMN public.developments.price_to IS 'Optional manual override; automatic range is read through development_unit_summary';