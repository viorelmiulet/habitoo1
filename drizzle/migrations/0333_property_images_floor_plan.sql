ALTER TABLE public.property_images ADD COLUMN IF NOT EXISTS is_floor_plan boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS property_images_one_floor_plan ON public.property_images (property_id) WHERE is_floor_plan;

CREATE OR REPLACE FUNCTION public.property_images_floor_plan_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_floor_plan AND NEW.is_primary THEN
    IF TG_OP = 'INSERT' OR NOT OLD.is_floor_plan THEN
      RAISE EXCEPTION 'Poza de copertă nu poate fi marcată ca releveu.' USING ERRCODE = '22023';
    END IF;
    -- poza releveu a devenit copertă: renunță la marcare
    NEW.is_floor_plan := false;
  END IF;
  IF NEW.is_floor_plan AND (TG_OP = 'INSERT' OR NOT OLD.is_floor_plan) THEN
    UPDATE public.property_images SET is_floor_plan = false
     WHERE property_id = NEW.property_id AND id <> NEW.id AND is_floor_plan;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_property_images_floor_plan ON public.property_images;
CREATE TRIGGER t_property_images_floor_plan BEFORE INSERT OR UPDATE OF is_floor_plan, is_primary ON public.property_images
FOR EACH ROW EXECUTE FUNCTION public.property_images_floor_plan_guard();