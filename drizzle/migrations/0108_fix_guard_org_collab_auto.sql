CREATE OR REPLACE FUNCTION public.guard_org_collab_auto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.collaboration_auto_enabled IS DISTINCT FROM OLD.collaboration_auto_enabled THEN
    IF auth.uid() IS NOT NULL AND NOT (public.is_org_admin() AND public.current_org() = NEW.id) THEN
      RAISE EXCEPTION 'Doar administratorul agenției poate schimba activarea automată a colaborării.';
    END IF;
  END IF;
  RETURN NEW;
END $$;