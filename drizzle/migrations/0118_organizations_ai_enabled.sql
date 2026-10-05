ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_org_ai_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_superadmin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.ai_enabled := false;
    ELSIF NEW.ai_enabled IS DISTINCT FROM OLD.ai_enabled THEN
      RAISE EXCEPTION 'Doar administratorul platformei poate activa sau dezactiva funcțiile AI.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_guard_org_ai_enabled ON public.organizations;
CREATE TRIGGER t_guard_org_ai_enabled BEFORE INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_org_ai_enabled();