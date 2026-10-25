CREATE TABLE public.private_listing_imports (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 source text NOT NULL,
 external_id text NOT NULL,
 listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
 property_id uuid NOT NULL REFERENCES public.properties(id),
 imported_by uuid NOT NULL,
 consent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, source, external_id)
);
GRANT SELECT ON public.private_listing_imports TO authenticated;
GRANT ALL ON public.private_listing_imports TO service_role;
ALTER TABLE public.private_listing_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_listing_imports_read ON public.private_listing_imports FOR SELECT TO authenticated USING (organization_id = public.current_org());
CREATE POLICY imported_properties_agency_read ON public.properties FOR SELECT TO authenticated USING (deleted_at IS NULL AND organization_id = public.current_org() AND EXISTS (SELECT 1 FROM public.private_listing_imports i WHERE i.property_id = properties.id AND i.organization_id = public.current_org()));
CREATE FUNCTION public.import_private_listing(_listing_id uuid, _property_id uuid, _images jsonb, _consent boolean)
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
 INSERT INTO public.property_images (organization_id,property_id,url,storage_path,position,is_primary,created_by)
 SELECT org,_property_id,im->>'path',im->>'path',ordinality::int-1,ordinality=1,auth.uid() FROM jsonb_array_elements(_images) WITH ORDINALITY AS imgs(im,ordinality);
 INSERT INTO public.private_listing_imports (organization_id,source,external_id,listing_id,property_id,imported_by,consent_at) VALUES (org,l.source,l.external_id,l.id,_property_id,auth.uid(),stamp);
 RETURN jsonb_build_object('propertyId',_property_id,'created',true);
END $$;
REVOKE ALL ON FUNCTION public.import_private_listing(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_private_listing(uuid,uuid,jsonb,boolean) TO authenticated;
COMMENT ON TABLE public.private_listing_imports IS 'Agency-scoped consent provenance and atomic deduplication of private listing portfolio imports.';