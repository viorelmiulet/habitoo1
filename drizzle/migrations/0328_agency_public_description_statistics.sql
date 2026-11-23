CREATE OR REPLACE FUNCTION public.public_agency_description_stats(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH agency AS (
 SELECT a.id FROM public.public_agency_page(_slug) a
), offers AS MATERIALIZED (
 SELECT p.property_type::text AS kind, p.transaction_kind::text AS transaction, p.rooms,
 p.price, p.currency, nullif(btrim(p.city),'') AS city, nullif(btrim(p.district),'') AS district, p.development_id
 FROM public.properties p JOIN agency a ON a.id=p.organization_id
 WHERE public.public_offer_listable(p.id)
), types AS (
 SELECT CASE WHEN kind='apartment' AND rooms=1 THEN 'studio' ELSE kind END AS value, count(*) AS count
 FROM offers GROUP BY 1
), places AS (
 SELECT concat_ws(' — ',city,district) AS value, count(*) AS count FROM offers
 WHERE city IS NOT NULL OR district IS NOT NULL GROUP BY 1
), prices AS (
 SELECT transaction, currency, min(price) AS min, max(price) AS max, count(*) AS count
 FROM offers WHERE price>0 AND nullif(btrim(currency),'') IS NOT NULL GROUP BY transaction,currency
), complexes AS (
 SELECT DISTINCT d.name FROM offers p JOIN public.developments d ON d.id=p.development_id
 JOIN agency a ON d.organization_id=a.id WHERE d.deleted_at IS NULL AND nullif(btrim(d.name),'') IS NOT NULL
)
SELECT jsonb_build_object(
 'total',(SELECT count(*) FROM offers),
 'sale',(SELECT count(*) FROM offers WHERE transaction='sale'),
 'rent',(SELECT count(*) FROM offers WHERE transaction='rent'),
 'types',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.count DESC,t.value) FROM types t),'[]'::jsonb),
 'places',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.count DESC,t.value) FROM (SELECT * FROM places ORDER BY count DESC,value LIMIT 5) t),'[]'::jsonb),
 'prices',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.transaction,t.currency) FROM prices t),'[]'::jsonb),
 'developments',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM complexes),'[]'::jsonb)
) WHERE EXISTS(SELECT 1 FROM agency);
$$;
REVOKE ALL ON FUNCTION public.public_agency_description_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_agency_description_stats(text) TO anon, authenticated, service_role;