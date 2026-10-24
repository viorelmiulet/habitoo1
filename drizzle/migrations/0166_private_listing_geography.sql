CREATE OR REPLACE FUNCTION public.listing_place_label(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT nullif(initcap(replace(replace(regexp_replace(btrim(v), '^(MUNICIPIUL|ORAŞUL|ORAȘUL|ORAŞ|ORAȘ|COMUNA|JUDEŢUL|JUDEȚUL)\s+', '', 'i'), 'ş', 'ș'), 'ţ', 'ț')), '') $$;
CREATE OR REPLACE FUNCTION public.listing_sector_label(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE WHEN public.ro_normalize_name(v) ~ '^sector(ul)? [1-6]$' THEN 'Sector ' || right(public.ro_normalize_name(v),1) ELSE nullif(btrim(v),'') END $$;
CREATE OR REPLACE FUNCTION public.normalize_listing_geography(_city text, _county text, _zone text, _neighborhood text) RETURNS TABLE(city text, county text, zone text, neighborhood text) LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE ck text := public.ro_normalize_name(public.listing_place_label(_city)); county_key text := public.ro_normalize_name(public.listing_place_label(_county)); candidates integer; matched_city text; matched_county text;
BEGIN
 city := public.listing_place_label(_city); county := public.listing_place_label(_county); zone := public.listing_sector_label(_zone); neighborhood := public.listing_place_label(_neighborhood);
 IF county_key = 'bucuresti ilfov' THEN county_key := ''; county := NULL; END IF;
 IF ck = 'bucuresti' THEN city := 'București'; county := 'București';
 ELSE
 IF ck = 'popesti' AND county_key = 'ilfov' THEN ck := 'popesti leordeni'; END IF;
 SELECT count(*), min(q.city), min(q.county) INTO candidates, matched_city, matched_county FROM (SELECT DISTINCT public.listing_place_label(l.name) AS city, public.listing_place_label(c.name) AS county FROM public.ro_localities l JOIN public.ro_counties c ON c.id=l.county_id WHERE l.active AND public.ro_normalize_name(public.listing_place_label(l.name))=ck AND (coalesce(county_key,'')='' OR public.ro_normalize_name(public.listing_place_label(c.name))=county_key)) q;
 IF candidates = 1 THEN city := matched_city; county := matched_county;
 ELSE
 SELECT public.listing_place_label(c.name) INTO matched_county FROM public.ro_counties c WHERE public.ro_normalize_name(public.listing_place_label(c.name))=ck LIMIT 1;
 IF matched_county IS NOT NULL AND candidates=0 THEN city := NULL; county := matched_county; END IF;
 END IF;
 END IF;
 IF county IS NOT NULL THEN SELECT public.listing_place_label(c.name) INTO matched_county FROM public.ro_counties c WHERE public.ro_normalize_name(public.listing_place_label(c.name))=public.ro_normalize_name(county) LIMIT 1; county := coalesce(matched_county,county); END IF;
 IF neighborhood IS NOT NULL THEN
 SELECT public.listing_place_label(i.name) INTO matched_city FROM public.imobiliare_locations i WHERE i.depth=3 AND public.ro_normalize_name(i.name)=public.ro_normalize_name(neighborhood) AND public.ro_normalize_name(public.listing_place_label(i.county_name))=public.ro_normalize_name(county) AND (public.ro_normalize_name(i.city_name)=public.ro_normalize_name(city) OR (city='București' AND public.ro_normalize_name(i.city_name) ~ '^sector [1-6]$')) ORDER BY i.id LIMIT 1;
 IF matched_city IS NULL THEN SELECT public.listing_place_label(l.neighborhood) INTO matched_city FROM public.listings l WHERE public.ro_normalize_name(l.neighborhood)=public.ro_normalize_name(neighborhood) AND public.ro_normalize_name(l.city)=public.ro_normalize_name(city) AND public.ro_normalize_name(l.county)=public.ro_normalize_name(county) ORDER BY (l.neighborhood ~ '[ăâîșțşţĂÂÎȘȚŞŢ]') DESC, l.neighborhood COLLATE "C" LIMIT 1; END IF;
 neighborhood := coalesce(matched_city,neighborhood);
 END IF;
 RETURN NEXT;
END $$;
CREATE OR REPLACE FUNCTION public.listings_normalize_geography_trigger() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN SELECT g.city,g.county,g.zone,g.neighborhood INTO NEW.city,NEW.county,NEW.zone,NEW.neighborhood FROM public.normalize_listing_geography(NEW.city,NEW.county,NEW.zone,NEW.neighborhood) g; RETURN NEW; END $$;
CREATE TRIGGER listings_normalize_geography BEFORE INSERT OR UPDATE OF city,county,zone,neighborhood ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_normalize_geography_trigger();
ALTER TABLE public.listings ADD COLUMN city_key text GENERATED ALWAYS AS (public.ro_normalize_name(city)) STORED, ADD COLUMN county_key text GENERATED ALWAYS AS (public.ro_normalize_name(county)) STORED, ADD COLUMN zone_key text GENERATED ALWAYS AS (public.ro_normalize_name(public.listing_sector_label(zone))) STORED, ADD COLUMN neighborhood_key text GENERATED ALWAYS AS (public.ro_normalize_name(neighborhood)) STORED;
CREATE INDEX listings_owner_geography_idx ON public.listings(county_key,city_key) WHERE is_owner=true;
REVOKE ALL ON FUNCTION public.normalize_listing_geography(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_listing_geography(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.listing_place_label(text),public.listing_sector_label(text) TO authenticated,service_role;