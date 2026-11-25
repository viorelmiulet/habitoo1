CREATE OR REPLACE FUNCTION public.development_location_text(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT CASE WHEN _v IS NULL OR btrim(_v) = '' THEN NULL ELSE _v END $$;

CREATE OR REPLACE FUNCTION public.development_location_complete(_county text, _city text, _lat double precision, _lng double precision)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT public.development_location_text(_county) IS NOT NULL AND public.development_location_text(_city) IS NOT NULL AND _lat IS NOT NULL AND _lng IS NOT NULL $$;

-- BEFORE trigger on properties: a development unit takes the development's location (B1-B3, B5).
CREATE OR REPLACE FUNCTION public.properties_development_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d record;
  b_county text; b_city text; b_street text; b_number text; b_lat double precision; b_lng double precision;
  pc text;
BEGIN
  IF NEW.development_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO d FROM public.developments
   WHERE id = NEW.development_id AND organization_id = NEW.organization_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.development_location_complete(d.county, d.city, d.lat, d.lng) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    b_county := NEW.county; b_city := NEW.city; b_street := NEW.street; b_number := NEW.street_number; b_lat := NEW.lat; b_lng := NEW.lng;
  ELSE
    b_county := OLD.county; b_city := OLD.city; b_street := OLD.street; b_number := OLD.street_number; b_lat := OLD.lat; b_lng := OLD.lng;
  END IF;

  NEW.county := public.development_location_text(d.county);
  NEW.city := public.development_location_text(d.city);
  NEW.county_siruta_code := d.county_siruta_code;
  NEW.uat_siruta_code := d.uat_siruta_code;
  NEW.locality_siruta_code := d.locality_siruta_code;
  NEW.district := public.development_location_text(d.district);
  NEW.street := public.development_location_text(d.street);
  NEW.street_number := public.development_location_text(d.street_number);
  NEW.address := public.development_location_text(d.address);
  NEW.lat := d.lat;
  NEW.lng := d.lng;
  NEW.location_precise := d.location_precise;

  IF NEW.county IS DISTINCT FROM b_county OR NEW.city IS DISTINCT FROM b_city
     OR NEW.street IS DISTINCT FROM b_street OR NEW.street_number IS DISTINCT FROM b_number
     OR NEW.lat IS DISTINCT FROM b_lat OR NEW.lng IS DISTINCT FROM b_lng THEN
    SELECT l.postal_code INTO pc FROM public.ro_localities l
     WHERE l.siruta_code = NEW.locality_siruta_code AND l.postal_code ~ '^[0-9]{6}$' LIMIT 1;
    NEW.postal_code := pc;
    NEW.postal_code_source := CASE WHEN pc IS NULL THEN NULL ELSE 'approximate' END;
    NEW.postal_code_resolved_at := NULL;
    NEW.postal_code_resolved_from := NULL;
  END IF;
  RETURN NEW;
END $$;

-- Named to sort before properties_guard_soft_delete, properties_public_slug and property_development_guard.
CREATE TRIGGER properties_a_development_location
BEFORE INSERT OR UPDATE OF county, city, county_siruta_code, uat_siruta_code, locality_siruta_code, district, street, street_number, address, lat, lng, location_precise, development_id, deleted_at
ON public.properties FOR EACH ROW EXECUTE FUNCTION public.properties_development_location();

-- B6: align all non-deleted units of a development; returns changed rows. Used by propagation.
CREATE OR REPLACE FUNCTION public.align_development_units_location(_development_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d record; n integer;
BEGIN
  SELECT * INTO d FROM public.developments WHERE id = _development_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.development_location_complete(d.county, d.city, d.lat, d.lng) THEN RETURN 0; END IF;
  UPDATE public.properties p SET
    county = public.development_location_text(d.county),
    city = public.development_location_text(d.city),
    county_siruta_code = d.county_siruta_code,
    uat_siruta_code = d.uat_siruta_code,
    locality_siruta_code = d.locality_siruta_code,
    district = public.development_location_text(d.district),
    street = public.development_location_text(d.street),
    street_number = public.development_location_text(d.street_number),
    address = public.development_location_text(d.address),
    lat = d.lat, lng = d.lng, location_precise = d.location_precise
  WHERE p.development_id = d.id AND p.organization_id = d.organization_id AND p.deleted_at IS NULL
    AND (p.county IS DISTINCT FROM public.development_location_text(d.county)
      OR p.city IS DISTINCT FROM public.development_location_text(d.city)
      OR p.county_siruta_code IS DISTINCT FROM d.county_siruta_code
      OR p.uat_siruta_code IS DISTINCT FROM d.uat_siruta_code
      OR p.locality_siruta_code IS DISTINCT FROM d.locality_siruta_code
      OR p.district IS DISTINCT FROM public.development_location_text(d.district)
      OR p.street IS DISTINCT FROM public.development_location_text(d.street)
      OR p.street_number IS DISTINCT FROM public.development_location_text(d.street_number)
      OR p.address IS DISTINCT FROM public.development_location_text(d.address)
      OR p.lat IS DISTINCT FROM d.lat OR p.lng IS DISTINCT FROM d.lng
      OR p.location_precise IS DISTINCT FROM d.location_precise);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- B4: propagate a development's location change to its units.
CREATE OR REPLACE FUNCTION public.developments_location_propagate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.county, NEW.city, NEW.county_siruta_code, NEW.uat_siruta_code, NEW.locality_siruta_code, NEW.district, NEW.street, NEW.street_number, NEW.address, NEW.lat, NEW.lng, NEW.location_precise)
     IS DISTINCT FROM
     (OLD.county, OLD.city, OLD.county_siruta_code, OLD.uat_siruta_code, OLD.locality_siruta_code, OLD.district, OLD.street, OLD.street_number, OLD.address, OLD.lat, OLD.lng, OLD.location_precise) THEN
    PERFORM public.align_development_units_location(NEW.id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER developments_location_propagate
AFTER UPDATE OF county, city, county_siruta_code, uat_siruta_code, locality_siruta_code, district, street, street_number, address, lat, lng, location_precise
ON public.developments FOR EACH ROW EXECUTE FUNCTION public.developments_location_propagate();

REVOKE ALL ON FUNCTION public.properties_development_location() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.developments_location_propagate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.align_development_units_location(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.align_development_units_location(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.development_location_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.development_location_complete(text, text, double precision, double precision) FROM PUBLIC, anon, authenticated;
