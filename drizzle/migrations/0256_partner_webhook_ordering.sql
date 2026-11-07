CREATE FUNCTION public.partner_webhook_sequence_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE env text;BEGIN
 env:=CASE WHEN NEW.organization_id='a7b50000-0000-4000-8000-000000000001' THEN 'test' ELSE 'live' END;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-webhook:'||NEW.portal||':'||env,0));
 -- Allocate after taking the portal/environment lock, including inserts made by simultaneous agency syncs.
 NEW.seq:=nextval('partner_api_events_seq_seq');RETURN NEW;
END $$;
CREATE TRIGGER partner_webhook_sequence BEFORE INSERT ON public.partner_api_events FOR EACH ROW EXECUTE FUNCTION public.partner_webhook_sequence_guard();
REVOKE ALL ON FUNCTION public.partner_webhook_sequence_guard() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_webhook_sequence_guard() TO service_role;