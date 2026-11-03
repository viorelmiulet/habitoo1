CREATE FUNCTION public.contracts_c3_combined_number() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE formatted text;
BEGIN
 formatted:=CASE WHEN NEW.doc_number IS NULL THEN '' WHEN coalesce(NEW.doc_series,'')='' THEN 'nr. '||NEW.doc_number ELSE 'seria '||NEW.doc_series||' nr. '||NEW.doc_number END;
 NEW.body:=replace(NEW.body,'{{contract.serie_numar}}',formatted);
 NEW.data:=coalesce(NEW.data,'{}'::jsonb)||jsonb_build_object('printedContractNumber',formatted);
 RETURN NEW;
END $$;
CREATE TRIGGER contracts_c3_combined_number BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contracts_c3_combined_number();