CREATE OR REPLACE FUNCTION public.attach_import_owner(_property uuid, _org uuid, _user uuid, _owner jsonb, _source text, _site text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; phone_key text := public.ro_phone_key(_owner->>'phone'); owner_name text := nullif(trim(_owner->>'name'), ''); site text := left(coalesce(nullif(trim(_site),''),'site necunoscut'),120);
BEGIN
 SELECT owner_contact_id INTO cid FROM public.properties WHERE id=_property AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proprietate indisponibilă.'; END IF;
 IF cid IS NOT NULL THEN RETURN cid; END IF;
 IF phone_key IS NULL AND owner_name IS NULL AND nullif(trim(_owner->>'email'),'') IS NULL THEN RETURN NULL; END IF;
 IF phone_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(_org::text || ':owner:' || phone_key, 0));
  SELECT id INTO cid FROM public.contacts WHERE organization_id=_org AND public.ro_phone_key(phone)=phone_key ORDER BY created_at,id LIMIT 1;
 END IF;
 IF cid IS NULL THEN
  owner_name := coalesce(owner_name,'Proprietar ' || site);
  INSERT INTO public.contacts(organization_id,first_name,last_name,phone,email,type,source,assigned_to,created_by,gdpr_consent)
  VALUES (_org,split_part(owner_name,' ',1),trim(substr(owner_name,length(split_part(owner_name,' ',1))+1)),phone_key,nullif(trim(_owner->>'email'),''),'owner',left(_source || ' ' || site,200),_user,_user,false) RETURNING id INTO cid;
 END IF;
 UPDATE public.properties SET owner_contact_id=cid WHERE id=_property AND organization_id=_org AND owner_contact_id IS NULL;
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.attach_import_owner(uuid,uuid,uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.extension_create_property(_user uuid, _org uuid, _key text, _hash text, _p jsonb, _owner jsonb, _source jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing record; pid uuid := gen_random_uuid(); cid uuid; site text := left(coalesce(nullif(trim(_source->>'site'), ''), 'site necunoscut'), 120);
BEGIN
 INSERT INTO extension_idempotency(user_id, idempotency_key, request_hash) VALUES (_user, _key, _hash) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO existing FROM extension_idempotency WHERE user_id = _user AND idempotency_key = _key;
  IF existing.request_hash <> _hash THEN RETURN jsonb_build_object('state', 'conflict'); END IF;
  RETURN jsonb_build_object('state', 'replay', 'property_id', existing.property_id);
 END IF;
 INSERT INTO properties(id, organization_id, assigned_to, created_by, reference, title, description, status, property_type, transaction_kind,
 for_sale, for_rent, price, currency, sale_price, sale_currency, rent_price, rent_currency, surface, usable_surface, built_surface, land_surface,
 rooms, bathrooms, floor, building_floors, build_year, layout, comfort, heating, finish_state, city, county, county_siruta_code,
 uat_siruta_code, locality_siruta_code, district, address, owner_contact_id,
 additional_spaces, kitchen_features, metering, appliances, building_amenities, street_arrangement, views, misc_features, cooling_systems)
 VALUES (pid, _org, _user, _user, next_property_reference(), coalesce(nullif(trim(_p->>'title'), ''), 'Proprietate importată'), _p->>'description', 'draft',
 coalesce(_p->>'property_type', 'apartment'), coalesce(_p->>'transaction_kind', 'sale')::transaction_kind,
 coalesce((_p->>'for_sale')::boolean, true), coalesce((_p->>'for_rent')::boolean, false), (_p->>'price')::numeric, coalesce(_p->>'currency', 'EUR'),
 (_p->>'sale_price')::numeric, _p->>'sale_currency', (_p->>'rent_price')::numeric, _p->>'rent_currency',
 (_p->>'usable_surface')::numeric, (_p->>'usable_surface')::numeric, (_p->>'built_surface')::numeric, (_p->>'land_surface')::numeric,
 (_p->>'rooms')::integer, (_p->>'bathrooms')::integer, (_p->>'floor')::integer, (_p->>'building_floors')::integer, (_p->>'build_year')::integer,
 _p->>'layout', _p->>'comfort', _p->>'heating', _p->>'finish_state', _p->>'city', _p->>'county', (_p->>'county_siruta_code')::integer,
 (_p->>'uat_siruta_code')::integer, (_p->>'locality_siruta_code')::integer, _p->>'district', _p->>'address', cid,
 ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'additional_spaces', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'kitchen_features', '[]'))),
 ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'metering', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'appliances', '[]'))),
 ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'building_amenities', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'street_arrangement', '[]'))),
 ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'views', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'misc_features', '[]'))),
 ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'cooling_systems', '[]'))));
 cid := public.attach_import_owner(pid,_org,_user,_owner,'Captură',site);
 IF nullif(_source->>'url', '') IS NOT NULL THEN
  INSERT INTO property_capture_sources(property_id, organization_id, source_url, normalized_url, site, captured_at, created_by)
  VALUES (pid, _org, _source->>'url', _source->>'normalized_url', site, (_source->>'captured_at')::timestamptz, _user);
 END IF;
 INSERT INTO activities(organization_id, property_id, contact_id, kind, status, done, title, description, starts_at, assigned_to, created_by)
 VALUES (_org, pid, cid, 'note', 'done', true, 'Importat cu extensia Chrome din ' || site, _source->>'url', now(), _user, _user);
 UPDATE extension_idempotency SET property_id = pid WHERE user_id = _user AND idempotency_key = _key;
 DELETE FROM extension_idempotency WHERE created_at < now() - interval '30 days';
 RETURN jsonb_build_object('state', 'created', 'property_id', pid, 'contact_id', cid);
END $$;
REVOKE ALL ON FUNCTION public.extension_create_property(uuid, uuid, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extension_create_property(uuid, uuid, text, text, jsonb, jsonb, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.import_private_listing(_listing_id uuid, _property_id uuid, _images jsonb, _consent boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.listings%rowtype; p public.profiles%rowtype; org uuid; existing uuid; kind public.transaction_kind; ptype text; stamp timestamptz := now();
BEGIN
 IF auth.uid() IS NULL OR _consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'Acordul proprietarului este obligatoriu.'; END IF;
 org := public.current_org();
 SELECT * INTO p FROM public.profiles WHERE id = auth.uid() AND is_active = true;
 IF org IS NULL OR p.id IS NULL OR p.organization_id IS DISTINCT FROM org THEN RAISE EXCEPTION 'Nu ai acces la o agenție activă.'; END IF;
 SELECT * INTO l FROM public.listings WHERE id = _listing_id AND is_owner = true;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Anunțul nu mai există.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text || ':' || l.source || ':' || l.external_id, 0));
 SELECT property_id INTO existing FROM public.private_listing_imports WHERE organization_id = org AND source = l.source AND external_id = l.external_id;
 IF existing IS NOT NULL THEN RETURN jsonb_build_object('propertyId', existing, 'created', false); END IF;
 IF jsonb_typeof(_images) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Imagini invalide.'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_images) AS im WHERE im->>'path' NOT LIKE org::text || '/' || _property_id::text || '/%' OR im->>'path' IS NULL OR im->>'path' LIKE '%..%') THEN RAISE EXCEPTION 'Imagini invalide.'; END IF;
 kind := CASE WHEN lower(coalesce(l.transaction_type,'')) ~ '(rent|lease|înch|inch|pe zi)' THEN 'rent'::public.transaction_kind ELSE 'sale'::public.transaction_kind END;
 ptype := CASE WHEN lower(coalesce(l.property_type,'')) ~ '(garson|studio)' THEN 'studio' WHEN lower(l.property_type) ~ '(apart|apartment)' THEN 'apartment' WHEN lower(l.property_type) ~ '(cas|vil|house)' THEN 'house' WHEN lower(l.property_type) ~ '(teren|land)' THEN 'land' WHEN lower(l.property_type) ~ '(birou|office)' THEN 'office' WHEN lower(l.property_type) ~ '(comercial|commercial)' THEN 'commercial' ELSE coalesce(nullif(l.property_type,''),'apartment') END;
 INSERT INTO public.properties (id,organization_id,reference,title,description,property_type,transaction_kind,status,price,currency,for_sale,for_rent,sale_price,sale_currency,rent_price,rent_currency,surface,usable_surface,land_surface,rooms,floor,floor_label,city,county,district,assigned_to,created_by,internal_notes,collaboration_opted_out)
 VALUES (_property_id,org,public.next_property_reference(),coalesce(nullif(l.title,''),'Anunț fără titlu'),l.description,ptype,kind,'draft',l.price,coalesce(nullif(l.currency,''),'EUR'),kind='sale',kind='rent',CASE WHEN kind='sale' THEN l.price END,CASE WHEN kind='sale' THEN coalesce(l.currency,'EUR') END,CASE WHEN kind='rent' THEN l.price END,CASE WHEN kind='rent' THEN coalesce(l.currency,'EUR') END,l.surface,CASE WHEN ptype <> 'land' THEN l.surface END,CASE WHEN ptype='land' THEN l.surface END,l.rooms,l.floor_num,l.floor,l.city,l.county,concat_ws(', ',nullif(l.zone,''),CASE WHEN l.neighborhood IS DISTINCT FROM l.zone THEN nullif(l.neighborhood,'') END),auth.uid(),auth.uid(),concat_ws(E'\n','Anunțul original: ' || coalesce(l.url,''),'Sursă: ' || CASE l.source WHEN 'anuntul' THEN 'Anuntul.ro' WHEN 'imoradar' THEN 'Imoradar24' WHEN 'imobiliare' THEN 'Imobiliare.ro' WHEN 'storia' THEN 'Storia' WHEN 'romimo' THEN 'Romimo' WHEN 'olx' THEN 'OLX' ELSE l.source END,'Acordul proprietarului confirmat de ' || coalesce(nullif(p.full_name,''),'Agent') || ' la ' || to_char(stamp AT TIME ZONE 'Europe/Bucharest','DD.MM.YYYY HH24:MI:SS') || ' (Europe/Bucharest)'),true);
 PERFORM public.attach_import_owner(_property_id,org,auth.uid(),jsonb_build_object(
 'phone',coalesce(nullif(trim(l.phone),''),nullif(trim(l.raw_data->>'phone'),''),nullif(trim(l.raw_data->>'telefon'),''),nullif(trim(l.raw_data->'owner'->>'phone'),'')),
 'name',coalesce(nullif(trim(l.raw_data->>'owner_name'),''),nullif(trim(l.raw_data->>'seller_name'),''),nullif(trim(l.raw_data->'owner'->>'name'),''))),
 'Hartă',CASE l.source WHEN 'anuntul' THEN 'Anuntul.ro' WHEN 'homezz' THEN 'Homezz.ro' WHEN 'imoradar' THEN 'Imoradar24' WHEN 'imobiliare' THEN 'Imobiliare.ro' WHEN 'storia' THEN 'Storia' WHEN 'romimo' THEN 'Romimo' WHEN 'olx' THEN 'OLX' WHEN 'facebook' THEN 'Facebook' ELSE l.source END);
 INSERT INTO public.property_images (organization_id,property_id,url,storage_path,position,is_primary,created_by)
 SELECT org,_property_id,im->>'path',im->>'path',ordinality::int-1,ordinality=1,auth.uid() FROM jsonb_array_elements(_images) WITH ORDINALITY AS imgs(im,ordinality);
 INSERT INTO public.private_listing_imports (organization_id,source,external_id,listing_id,property_id,imported_by,consent_at) VALUES (org,l.source,l.external_id,l.id,_property_id,auth.uid(),stamp);
 RETURN jsonb_build_object('propertyId',_property_id,'created',true);
END $$;
REVOKE ALL ON FUNCTION public.import_private_listing(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_private_listing(uuid,uuid,jsonb,boolean) TO authenticated;