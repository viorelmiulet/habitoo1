CREATE OR REPLACE FUNCTION public.search_place_city_key(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT public.ro_normalize_name(regexp_replace(coalesce(v,''), '\s+Sector(ul)?\s+[1-6]\s*$', '', 'i')) $$;
CREATE OR REPLACE FUNCTION public.search_place_matches(_county text, _city text, _zone text, _neighborhood text, _choices jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_choices) = 'array' THEN _choices ELSE '[]'::jsonb END) s WHERE
(s->>'county' = '' OR public.ro_normalize_name(coalesce(nullif(_county,''), CASE WHEN public.search_place_city_key(_city) = 'bucuresti' THEN 'București' END)) = s->>'county') AND
(s->>'kind' = 'county' OR public.search_place_city_key(_city) = s->>'city') AND
(s->>'kind' IN ('county','city') OR public.ro_normalize_name(_zone) = s->>'zone' OR public.ro_normalize_name(_neighborhood) = s->>'zone'))
$$;
CREATE OR REPLACE FUNCTION public.search_listings_places(_choices jsonb) RETURNS SETOF public.listings LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT l.* FROM public.listings l WHERE public.search_place_matches(l.county,l.city,l.zone,l.neighborhood,_choices) $$;
CREATE OR REPLACE FUNCTION public.search_properties_places(_choices jsonb) RETURNS SETOF public.properties LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT p.* FROM public.properties p WHERE public.search_place_matches(p.county,p.city,p.district,NULL,_choices) $$;
REVOKE ALL ON FUNCTION public.search_place_city_key(text), public.search_place_matches(text,text,text,text,jsonb), public.search_listings_places(jsonb), public.search_properties_places(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_place_city_key(text), public.search_place_matches(text,text,text,text,jsonb), public.search_listings_places(jsonb), public.search_properties_places(jsonb) TO authenticated, service_role;