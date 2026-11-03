ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS assigned_to uuid DEFAULT auth.uid();
UPDATE public.contracts SET assigned_to = created_by WHERE assigned_to IS NULL;
CREATE TABLE public.contract_number_counters (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 year integer NOT NULL, last_number bigint NOT NULL DEFAULT 0,
 PRIMARY KEY (organization_id, year)
);
GRANT ALL ON public.contract_number_counters TO service_role;
ALTER TABLE public.contract_number_counters ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.contracts_c1_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE y integer; n bigint;
BEGIN
 y := extract(year FROM now() AT TIME ZONE 'Europe/Bucharest')::integer;
 INSERT INTO public.contract_number_counters(organization_id,year,last_number) VALUES(NEW.organization_id,y,1)
 ON CONFLICT(organization_id,year) DO UPDATE SET last_number=contract_number_counters.last_number+1 RETURNING last_number INTO n;
 NEW.number := 'CT-'||y||'-'||CASE WHEN n<10000 THEN lpad(n::text,4,'0') ELSE n::text END;
 NEW.assigned_to := coalesce(NEW.assigned_to,NEW.created_by,auth.uid());
 NEW.data := jsonb_set(coalesce(NEW.data,'{}'::jsonb),'{contractNumber}',to_jsonb(NEW.number));
 NEW.body := replace(coalesce(NEW.body,''),'{{contract.numar}}',NEW.number);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contracts_c1_number() FROM PUBLIC;
CREATE TRIGGER contracts_c1_number BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contracts_c1_number();
CREATE UNIQUE INDEX contracts_c1_number_uidx ON public.contracts(organization_id,number) WHERE number IS NOT NULL;
CREATE OR REPLACE FUNCTION public.can_access_contract(_contract_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.contracts c WHERE c.id=_contract_id AND (public.is_superadmin() OR (c.organization_id=public.current_org() AND (public.is_org_admin() OR c.created_by=auth.uid() OR c.assigned_to=auth.uid()))));
$$;
ALTER POLICY contracts_select ON public.contracts USING (public.can_access_contract(id));
ALTER POLICY contracts_update ON public.contracts USING (public.can_access_contract(id)) WITH CHECK (public.can_access_contract(id));
ALTER POLICY contracts_delete ON public.contracts USING (public.can_access_contract(id));
ALTER POLICY contracts_insert ON public.contracts WITH CHECK (public.is_superadmin() OR (organization_id=public.current_org() AND created_by=auth.uid() AND (assigned_to=auth.uid() OR public.is_org_admin())));
ALTER POLICY parties_insert ON public.contract_parties WITH CHECK (public.can_access_contract(contract_id) AND organization_id=(SELECT c.organization_id FROM public.contracts c WHERE c.id=contract_id));
CREATE OR REPLACE FUNCTION public.contracts_c1_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.number IS DISTINCT FROM OLD.number OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Identitatea contractului nu poate fi modificată.' USING ERRCODE='42501'; END IF;
 IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND auth.uid() IS NOT NULL AND NOT public.is_superadmin() AND NOT public.is_org_admin() THEN RAISE EXCEPTION 'Doar administratorul poate atribui contractul.' USING ERRCODE='42501'; END IF;
 IF NEW.assigned_to IS NOT NULL AND (TG_OP='UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Agentul trebuie să aparțină agenției.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contracts_c1_guard BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contracts_c1_guard();
CREATE TABLE public.contact_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
 doc_type text NOT NULL DEFAULT 'ci' CHECK(doc_type IN ('ci','cei','pasaport','permis_sedere','altul')),
 full_name text NOT NULL DEFAULT '', birth_date date, birth_place text, citizenship text, sex text,
 cnp_enc text, id_series_enc text, id_number_enc text,
 id_issuer text, id_issued_on date, expires_at date, address text,
 address_source text NOT NULL DEFAULT 'act' CHECK(address_source IN ('act','certificat_domiciliu','manual')),
 extracted_at timestamptz, confirmed_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contact_identities TO authenticated;
GRANT ALL ON public.contact_identities TO service_role;
ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_access_contact_identity(_contact_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=_contact_id AND c.organization_id=public.current_org() AND (c.assigned_to=auth.uid() OR EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.organization_id=c.organization_id AND r.role='agency_admin')));
$$;
REVOKE ALL ON FUNCTION public.can_access_contact_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_contact_identity(uuid) TO authenticated,service_role;
CREATE POLICY contact_identities_select ON public.contact_identities FOR SELECT TO authenticated USING(public.can_access_contact_identity(contact_id));
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS doc_type text;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS birth_place text;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS sex text;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS expires_at date;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS address_source text;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS extracted_at timestamptz;
ALTER TABLE public.contract_parties ADD COLUMN IF NOT EXISTS confirmed_by uuid;
