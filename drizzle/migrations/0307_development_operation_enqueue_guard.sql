CREATE FUNCTION public.guard_development_operation_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.operation<>'clone' AND current_setting('habitoo.development_enqueue',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Folosește operația din ansamblu.' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_development_operation_enqueue BEFORE INSERT ON public.development_clone_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_development_operation_enqueue();
DO $$ DECLARE def text; BEGIN
 def:=pg_get_functiondef('public.start_development_unit_operation(uuid,uuid[],text)'::regprocedure);
 def:=replace(def,'INSERT INTO public.development_clone_jobs','PERFORM set_config(''habitoo.development_enqueue'',''on'',true); INSERT INTO public.development_clone_jobs');
 def:=replace(def,'PERFORM public.development_clone_kick();','PERFORM set_config(''habitoo.development_enqueue'',''off'',true); PERFORM public.development_clone_kick();');
 EXECUTE def; END $$;