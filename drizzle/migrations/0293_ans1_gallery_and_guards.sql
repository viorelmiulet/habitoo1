CREATE FUNCTION public.development_image_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.developments d WHERE d.id=NEW.development_id AND d.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Agenție invalidă'; END IF;
 IF TG_OP='UPDATE' AND (NEW.development_id IS DISTINCT FROM OLD.development_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN RAISE EXCEPTION 'Fotografia nu poate fi mutată'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER development_image_guard BEFORE INSERT OR UPDATE ON public.development_images FOR EACH ROW EXECUTE FUNCTION public.development_image_guard();
CREATE FUNCTION public.reorder_development_images(_id uuid, _images uuid[]) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT public.can_access_development(_id,true) THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 PERFORM id FROM public.developments WHERE id=_id FOR UPDATE;
 IF (SELECT count(*) FROM public.development_images WHERE development_id=_id)<>(SELECT count(DISTINCT x) FROM unnest(_images) x) OR EXISTS(SELECT 1 FROM unnest(_images) x WHERE NOT EXISTS(SELECT 1 FROM public.development_images i WHERE i.id=x AND i.development_id=_id)) THEN RAISE EXCEPTION 'Lista fotografiilor s-a schimbat'; END IF;
 UPDATE public.development_images i SET position=u.n-1,is_primary=(u.n=1),updated_at=now() FROM unnest(_images) WITH ORDINALITY u(id,n) WHERE i.id=u.id AND i.development_id=_id;
END $$;
REVOKE ALL ON FUNCTION public.reorder_development_images(uuid,uuid[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.reorder_development_images(uuid,uuid[]) TO authenticated;
CREATE FUNCTION public.development_author_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.created_by=auth.uid(); NEW.deleted_at=NULL;
 ELSE NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at; END IF; RETURN NEW;
END $$;
CREATE TRIGGER development_author_guard BEFORE INSERT OR UPDATE ON public.developments FOR EACH ROW EXECUTE FUNCTION public.development_author_guard();