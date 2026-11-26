ALTER TABLE public.developments
  ADD COLUMN IF NOT EXISTS ceiling_height_from_cm integer,
  ADD COLUMN IF NOT EXISTS ceiling_height_to_cm integer,
  ADD COLUMN IF NOT EXISTS remote_services boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS net_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS number_of_rooms text,
  ADD COLUMN IF NOT EXISTS on_demand boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS virtual_tour_url text,
  ADD COLUMN IF NOT EXISTS storia_auto_extend boolean NOT NULL DEFAULT false;
ALTER TABLE public.developments
  ADD CONSTRAINT developments_ceiling_height_check CHECK ((ceiling_height_from_cm IS NULL OR ceiling_height_from_cm > 0) AND (ceiling_height_to_cm IS NULL OR ceiling_height_to_cm > 0) AND (ceiling_height_from_cm IS NULL OR ceiling_height_to_cm IS NULL OR ceiling_height_from_cm <= ceiling_height_to_cm)),
  ADD CONSTRAINT developments_net_area_check CHECK (net_area_m2 IS NULL OR net_area_m2 > 0),
  ADD CONSTRAINT developments_number_of_rooms_check CHECK (number_of_rooms IS NULL OR number_of_rooms IN ('1','2','3','4','5','6','7','8','9','10','more'));

ALTER TABLE public.development_images ADD COLUMN IF NOT EXISTS is_floor_plan boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS development_images_one_floor_plan ON public.development_images (development_id) WHERE is_floor_plan;

CREATE OR REPLACE FUNCTION public.development_images_floor_plan_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_floor_plan AND NEW.is_primary THEN
    IF TG_OP = 'INSERT' OR NOT OLD.is_floor_plan THEN
      RAISE EXCEPTION 'Coperta nu poate fi marcată ca plan.' USING ERRCODE = '22023';
    END IF;
    NEW.is_floor_plan := false;
  END IF;
  IF NEW.is_floor_plan AND (TG_OP = 'INSERT' OR NOT OLD.is_floor_plan) THEN
    UPDATE public.development_images SET is_floor_plan = false
     WHERE development_id = NEW.development_id AND id <> NEW.id AND is_floor_plan;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.development_images_floor_plan_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER t_development_images_floor_plan BEFORE INSERT OR UPDATE OF is_floor_plan, is_primary ON public.development_images
FOR EACH ROW EXECUTE FUNCTION public.development_images_floor_plan_guard();