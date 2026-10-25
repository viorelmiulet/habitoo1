-- Transactional integration test; all fixtures and imported properties roll back.
BEGIN;
DO $$
DECLARE actor uuid; org uuid; listing uuid := gen_random_uuid(); prop uuid := gen_random_uuid(); result jsonb; actual public.properties%rowtype; before_count bigint; agent_name text;
BEGIN
 SELECT p.id,p.organization_id,p.full_name INTO actor,org,agent_name FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id WHERE p.is_active=true AND o.status IN ('active','trial') AND o.archived_at IS NULL LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'No active agency fixture account'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.listings(id,source,external_id,title,description,price,currency,transaction_type,property_type,rooms,surface,floor,city,county,zone,neighborhood,url,is_owner)
 VALUES(listing,'anuntul','portfolio-test-' || listing,'Test import','Descriere integrală' || E'\n' || repeat('x',2000),1500,'EUR','Închiriere','Apartament',2,50,'3','București','București','Sector 3','Titan','https://www.anuntul.ro/test',true);
 SELECT count(*) INTO before_count FROM public.properties;
 BEGIN
  PERFORM public.import_private_listing(listing,prop,'[]',false);
  RAISE EXCEPTION 'False consent unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Acordul proprietarului%' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.properties) <> before_count THEN RAISE EXCEPTION 'Nu created a property'; END IF;
 result := public.import_private_listing(listing,prop,jsonb_build_array(jsonb_build_object('path',org || '/' || prop || '/first.jpg'),jsonb_build_object('path',org || '/' || prop || '/second.jpg')),true);
 SELECT * INTO actual FROM public.properties WHERE id=prop;
 IF actual.status <> 'draft' OR actual.assigned_to <> actor OR actual.organization_id <> org OR actual.title <> 'Test import' OR actual.description <> 'Descriere integrală' || E'\n' || repeat('x',2000) OR actual.price <> 1500 OR actual.currency <> 'EUR' OR actual.transaction_kind <> 'rent' OR NOT actual.for_rent OR actual.for_sale OR actual.rent_price <> 1500 OR actual.property_type <> 'apartment' OR actual.rooms <> 2 OR actual.surface <> 50 OR actual.floor <> 3 OR actual.city <> 'București' OR actual.county <> 'București' OR actual.district <> 'Sector 3, Titan' THEN RAISE EXCEPTION 'Imported fields differ'; END IF;
 IF actual.internal_notes NOT LIKE '%https://www.anuntul.ro/test%' OR actual.internal_notes NOT LIKE '%Anuntul.ro%' OR actual.internal_notes NOT LIKE '%Acordul proprietarului confirmat de ' || coalesce(nullif(agent_name,''),'Agent') || ' la %' THEN RAISE EXCEPTION 'Missing consent provenance'; END IF;
 IF (SELECT count(*) FROM public.property_images WHERE property_id=prop) <> 2 OR (SELECT storage_path FROM public.property_images WHERE property_id=prop AND position=0) <> org || '/' || prop || '/first.jpg' OR NOT (SELECT is_primary FROM public.property_images WHERE property_id=prop AND position=0) THEN RAISE EXCEPTION 'Gallery order differs'; END IF;
 result := public.import_private_listing(listing,gen_random_uuid(),'[]',true);
 IF result->>'propertyId' <> prop::text OR (result->>'created')::boolean OR (SELECT count(*) FROM public.properties) <> before_count+1 THEN RAISE EXCEPTION 'Duplicate import'; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_publish_jobs WHERE property_id=prop) OR EXISTS(SELECT 1 FROM public.portal_publications WHERE property_id=prop) THEN RAISE EXCEPTION 'Import enqueued publishing'; END IF;
END $$;
ROLLBACK;