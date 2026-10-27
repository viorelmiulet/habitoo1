CREATE OR REPLACE FUNCTION public.search_place_city_key(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT CASE WHEN public.ro_normalize_name(v) ~ '^sector(ul)? [1-6]$' THEN 'bucuresti' ELSE public.ro_normalize_name(regexp_replace(coalesce(v,''), '\s+Sector(ul)?\s+[1-6]\s*$', '', 'i')) END $$;
CREATE OR REPLACE FUNCTION public.search_place_matches(_county text, _city text, _zone text, _neighborhood text, _choices jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_choices) = 'array' THEN _choices ELSE '[]'::jsonb END) s WHERE
(s->>'county' = '' OR public.ro_normalize_name(coalesce(nullif(_county,''), CASE WHEN public.search_place_city_key(_city) = 'bucuresti' THEN 'București' END)) = s->>'county') AND
(s->>'kind' = 'county' OR s->>'city' = '' OR public.search_place_city_key(_city) = s->>'city') AND
(s->>'kind' IN ('county','city') OR public.ro_normalize_name(_zone) = s->>'zone' OR public.ro_normalize_name(_neighborhood) = s->>'zone'))
$$;