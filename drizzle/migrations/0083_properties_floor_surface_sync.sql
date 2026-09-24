CREATE OR REPLACE FUNCTION public.properties_sync_floor_surface()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _l text; _n int;
BEGIN
  _l := nullif(btrim(NEW.floor_label), '');
  IF _l IS NOT NULL THEN
    IF _l = 'Demisol' THEN NEW.floor := -1;
    ELSIF _l IN ('Parter', 'Parter înalt') THEN NEW.floor := 0;
    ELSIF _l ~ '^Etaj [1-9]$' THEN NEW.floor := substring(_l from 6)::int;
    -- 'Etaj 10+', 'Penultimul etaj', 'Ultimul etaj', 'Mansardă' și orice altă
    -- etichetă fără număr fix: floor rămâne valoarea trimisă.
    END IF;
  ELSIF NEW.floor IS NOT NULL THEN
    _n := NEW.floor;
    NEW.floor_label := CASE
      WHEN _n = -1 THEN 'Demisol'
      WHEN _n = 0 THEN 'Parter'
      WHEN _n BETWEEN 1 AND 9 THEN 'Etaj ' || _n
      ELSE NULL END;
  END IF;
  -- Ultima variantă: valoarea `surface` trimisă, ca să nu se piardă date
  -- când lipsesc toate celelalte suprafețe.
  NEW.surface := coalesce(NEW.usable_surface, NEW.built_surface, NEW.land_surface, NEW.surface);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS properties_sync_floor_surface ON public.properties;
CREATE TRIGGER properties_sync_floor_surface
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.properties_sync_floor_surface();

-- Corectare unică, fără a schimba updated_at.
ALTER TABLE public.properties DISABLE TRIGGER t_properties;

UPDATE public.properties SET usable_surface = surface
 WHERE reference IS NULL AND surface IS NOT NULL
   AND usable_surface IS NULL AND built_surface IS NULL AND land_surface IS NULL;

UPDATE public.properties SET floor_label = NULL
 WHERE reference = 'HB-1002' AND floor IS NOT NULL AND floor_label IS NULL;

UPDATE public.properties
   SET surface = coalesce(usable_surface, built_surface, land_surface, surface)
 WHERE coalesce(reference, '') NOT IN ('HB-1008', 'HB-1004', 'RF-1001')
   AND surface IS DISTINCT FROM coalesce(usable_surface, built_surface, land_surface, surface);

ALTER TABLE public.properties ENABLE TRIGGER t_properties;