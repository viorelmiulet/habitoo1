CREATE OR REPLACE FUNCTION public.notify_republish_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.kind='republish' AND NEW.status='done' AND OLD.status IS DISTINCT FROM 'done' THEN
 INSERT INTO public.notifications(id,organization_id,user_id,created_by,type,title,body,link)
 VALUES(NEW.id,NEW.organization_id,NEW.requested_by,NEW.requested_by,'portal_republish_done',format('Republicare terminată: %s reușite, %s erori',NEW.succeeded,NEW.failed),format('%s reușite, %s erori, %s sărite.',NEW.succeeded,NEW.failed,NEW.skipped),'/app/properties?republicare=' || NEW.id::text)
 ON CONFLICT(id) DO NOTHING;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER notify_republish_completion AFTER UPDATE OF status ON public.portal_republish_batches FOR EACH ROW EXECUTE FUNCTION public.notify_republish_completion();