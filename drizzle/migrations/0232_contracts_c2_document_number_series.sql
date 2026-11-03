CREATE TABLE public.contract_number_series (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('commission','viewing','exclusive_representation')),
 series text NOT NULL DEFAULT '' CHECK (length(series) <= 20 AND series = btrim(series) AND series !~ '[[:cntrl:]]'),
 next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,kind)
);
GRANT SELECT ON public.contract_number_series TO authenticated;
GRANT ALL ON public.contract_number_series TO service_role;
ALTER TABLE public.contract_number_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_number_series_read ON public.contract_number_series FOR SELECT TO authenticated USING (organization_id=public.current_org());
ALTER TABLE public.contracts ADD COLUMN doc_series text;
ALTER TABLE public.contracts ADD COLUMN doc_number integer;
CREATE UNIQUE INDEX contracts_c2_document_number_uidx ON public.contracts(organization_id,kind,coalesce(doc_series,''),doc_number) WHERE doc_number IS NOT NULL;
CREATE OR REPLACE FUNCTION public.save_contract_number_series(_kind text,_series text,_next_number integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; used integer; s text;
BEGIN
 org:=public.current_org();
 IF auth.uid() IS NULL OR org IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND organization_id=org AND role='agency_admin') THEN RAISE EXCEPTION 'Doar administratorul agenției poate modifica numerotarea.' USING ERRCODE='42501'; END IF;
 IF _kind IS NULL OR _kind NOT IN ('commission','viewing','exclusive_representation') OR _next_number IS NULL OR _next_number<1 THEN RAISE EXCEPTION 'Tip sau număr de început invalid.'; END IF;
 s:=btrim(coalesce(_series,''));
 IF length(s)>20 OR s ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Seria trebuie să aibă maximum 20 de caractere, fără caractere de control.'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=org FOR UPDATE;
 SELECT coalesce(max(doc_number),0) INTO used FROM public.contracts WHERE organization_id=org AND kind=_kind AND coalesce(doc_series,'')=s;
 IF _next_number<=used THEN RAISE EXCEPTION 'Numărul de început trebuie să fie mai mare decât % (ultimul număr folosit în această serie).',used; END IF;
 INSERT INTO public.contract_number_series(organization_id,kind,series,next_number,updated_by) VALUES(org,_kind,s,_next_number,auth.uid())
 ON CONFLICT(organization_id,kind) DO UPDATE SET series=excluded.series,next_number=excluded.next_number,updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_contract_number_series(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_contract_number_series(text,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.contracts_c1_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE y integer; n bigint;
BEGIN
 y := extract(year FROM now() AT TIME ZONE 'Europe/Bucharest')::integer;
 INSERT INTO public.contract_number_counters(organization_id,year,last_number) VALUES(NEW.organization_id,y,1)
 ON CONFLICT(organization_id,year) DO UPDATE SET last_number=contract_number_counters.last_number+1 RETURNING last_number INTO n;
 NEW.number := 'CT-'||y||'-'||CASE WHEN n<10000 THEN lpad(n::text,4,'0') ELSE n::text END;
 NEW.assigned_to := coalesce(NEW.assigned_to,NEW.created_by,auth.uid());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contracts_c1_number() FROM PUBLIC;
CREATE FUNCTION public.contracts_c2_document_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text; n integer; used integer;
BEGIN
 NEW.doc_series:=NULL; NEW.doc_number:=NULL;
 IF NEW.kind IN ('commission','viewing','exclusive_representation') THEN
  PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
  INSERT INTO public.contract_number_series(organization_id,kind) VALUES(NEW.organization_id,NEW.kind) ON CONFLICT DO NOTHING;
  SELECT series,next_number INTO s,n FROM public.contract_number_series WHERE organization_id=NEW.organization_id AND kind=NEW.kind;
  SELECT coalesce(max(doc_number),0) INTO used FROM public.contracts WHERE organization_id=NEW.organization_id AND kind=NEW.kind AND coalesce(doc_series,'')=s;
  n:=greatest(n,used+1);
  NEW.doc_series:=s; NEW.doc_number:=n;
  UPDATE public.contract_number_series SET next_number=n+1,updated_at=now() WHERE organization_id=NEW.organization_id AND kind=NEW.kind;
 END IF;
 NEW.data:=coalesce(NEW.data,'{}'::jsonb)||jsonb_build_object('contractNumber',coalesce(NEW.doc_number::text,''),'contractSeries',coalesce(NEW.doc_series,''),'internalContractNumber',NEW.number);
 NEW.body:=replace(replace(replace(coalesce(NEW.body,''),'{{contract.numar_intern}}',NEW.number),'{{contract.serie}}',coalesce(NEW.doc_series,'')),'{{contract.numar}}',coalesce(NEW.doc_number::text,''));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contracts_c2_document_number() FROM PUBLIC;
CREATE TRIGGER contracts_c2_document_number BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contracts_c2_document_number();
CREATE FUNCTION public.contracts_c2_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.doc_series IS DISTINCT FROM OLD.doc_series OR NEW.doc_number IS DISTINCT FROM OLD.doc_number OR NEW.kind IS DISTINCT FROM OLD.kind THEN RAISE EXCEPTION 'Tipul, seria și numărul tipărit nu pot fi modificate.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contracts_c2_document_guard BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contracts_c2_document_guard();
COMMENT ON COLUMN public.contracts.number IS 'Internal Habitoo identifier only; never printed on documents.';
COMMENT ON COLUMN public.contracts.doc_number IS 'Agency/type/series printed number, allocated atomically at creation; null for rental and loan for use.';