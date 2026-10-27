CREATE OR REPLACE FUNCTION public.contact_source_label(_source text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
SELECT CASE
 WHEN lower(trim(_source)) IN ('storia','storia.ro') THEN 'Storia'
 WHEN lower(trim(_source)) IN ('imobiliare','imobiliare.ro','vdi') THEN 'Imobiliare.ro'
 WHEN lower(trim(_source)) IN ('olx','olx.ro') THEN 'OLX'
 WHEN lower(trim(_source))='facebook' THEN 'Facebook'
 WHEN lower(trim(_source)) IN ('map','private_listing','private-listing','listings') THEN 'Anunțuri particulari (MAP)'
 WHEN lower(trim(_source)) IN ('site','website') OR lower(trim(_source)) LIKE 'website:%' THEN 'Site-ul agenției'
 WHEN lower(trim(_source))='referral' THEN 'Recomandare'
 WHEN lower(trim(_source))='phone' THEN 'Telefon'
 WHEN lower(trim(_source))='office' THEN 'Vizită la birou'
 WHEN lower(trim(_source))='collaboration' THEN 'Colaborare'
 ELSE nullif(trim(_source),'') END $$;