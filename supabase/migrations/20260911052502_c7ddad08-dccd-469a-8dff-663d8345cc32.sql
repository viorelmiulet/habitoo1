ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS watermark_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_position text NOT NULL DEFAULT 'bottom-right',
  ADD COLUMN IF NOT EXISTS watermark_scale_percent integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS watermark_opacity_percent integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS watermark_margin_percent integer NOT NULL DEFAULT 4;

CREATE OR REPLACE FUNCTION public.validate_org_watermark()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.watermark_position NOT IN ('bottom-right','bottom-left','top-right','top-left','center') THEN
    RAISE EXCEPTION 'Poziție de watermark invalidă.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.watermark_scale_percent < 10 OR NEW.watermark_scale_percent > 35 THEN
    RAISE EXCEPTION 'Dimensiunea watermark-ului trebuie să fie între 10%% și 35%%.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.watermark_opacity_percent < 20 OR NEW.watermark_opacity_percent > 100 THEN
    RAISE EXCEPTION 'Opacitatea watermark-ului trebuie să fie între 20%% și 100%%.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.watermark_margin_percent < 0 OR NEW.watermark_margin_percent > 20 THEN
    RAISE EXCEPTION 'Marginea watermark-ului trebuie să fie între 0%% și 20%%.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_org_watermark ON public.organizations;
CREATE TRIGGER t_org_watermark
BEFORE INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.validate_org_watermark();