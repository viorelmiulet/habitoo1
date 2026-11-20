ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS cloned_from_property_id uuid REFERENCES public.properties(id);
CREATE INDEX IF NOT EXISTS properties_cloned_from_idx ON public.properties(cloned_from_property_id, development_id) WHERE cloned_from_property_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clone_properties_to_development(_development_id uuid, _property_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  d record; uid uuid := auth.uid(); ids uuid[]; cols text; src record; new_id uuid; new_ref text;
  copies jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb; files jsonb := '[]'::jsonb; img record; new_path text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Neautentificat.' USING ERRCODE='42501'; END IF;
  IF NOT public.can_access_development(_development_id, true) THEN RAISE EXCEPTION 'Nu ai drepturi să editezi acest ansamblu.' USING ERRCODE='42501'; END IF;
  SELECT id, organization_id INTO d FROM public.developments WHERE id=_development_id AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Ansamblu inaccesibil' USING ERRCODE='42501'; END IF;
  SELECT array_agg(DISTINCT x) INTO ids FROM unnest(coalesce(_property_ids,'{}')) x;
  IF ids IS NULL THEN RETURN jsonb_build_object('copies','[]'::jsonb,'skipped','[]'::jsonb,'files','[]'::jsonb); END IF;
  IF array_length(ids,1) > 200 THEN RAISE EXCEPTION 'Maximum 200 de anunțuri pe operație.' USING ERRCODE='22023'; END IF;
  -- Visibility uses the caller's existing RLS (SECURITY INVOKER).
  IF (SELECT count(*) FROM public.properties p WHERE p.id=ANY(ids) AND p.organization_id=d.organization_id AND p.deleted_at IS NULL) <> array_length(ids,1) THEN
    RAISE EXCEPTION 'Unele anunțuri nu sunt accesibile sau sunt din altă agenție.' USING ERRCODE='42501';
  END IF;
  SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns WHERE table_schema='public' AND table_name='properties' AND is_generated='NEVER'
     AND column_name NOT IN ('id','reference','external_id','created_at','updated_at','created_by','updated_by','development_id','market','cloned_from_property_id','deleted_at','deleted_by','pre_delete_status','archived_at','archived_by','pre_archive_status','publish_status','published_at');
  FOR src IN SELECT id, reference FROM public.properties WHERE id=ANY(ids) ORDER BY reference LOOP
    IF EXISTS(SELECT 1 FROM public.properties c WHERE c.cloned_from_property_id=src.id AND c.development_id=_development_id AND c.deleted_at IS NULL) THEN
      skipped := skipped || jsonb_build_object('original_id',src.id,'original_reference',src.reference,'reason','deja în ansamblu');
      CONTINUE;
    END IF;
    new_id := gen_random_uuid(); new_ref := public.next_property_reference();
    EXECUTE format('INSERT INTO public.properties (id,reference,created_by,updated_by,development_id,market,cloned_from_property_id,%1$s) SELECT $1,$2,$3,$3,$4,''primary'',id,%1$s FROM public.properties WHERE id=$5', cols)
      USING new_id, new_ref, uid, _development_id, src.id;
    FOR img IN SELECT * FROM public.property_images WHERE property_id=src.id ORDER BY position, created_at LOOP
      new_path := CASE WHEN img.storage_path IS NOT NULL THEN d.organization_id::text||'/'||new_id::text||'/'||regexp_replace(img.storage_path,'^.*/','') END;
      INSERT INTO public.property_images(organization_id,property_id,url,position,is_primary,is_confidential,include_in_publish,alt,width,height,storage_path,source_url,created_by,updated_by)
      VALUES (img.organization_id,new_id,CASE WHEN img.storage_path IS NOT NULL AND img.url=img.storage_path THEN new_path ELSE img.url END,img.position,img.is_primary,img.is_confidential,img.include_in_publish,img.alt,img.width,img.height,new_path,img.source_url,uid,uid);
      IF new_path IS NOT NULL THEN files := files || jsonb_build_object('from',img.storage_path,'to',new_path,'copy_id',new_id); END IF;
    END LOOP;
    copies := copies || jsonb_build_object('original_id',src.id,'original_reference',src.reference,'copy_id',new_id,'copy_reference',new_ref);
  END LOOP;
  RETURN jsonb_build_object('copies',copies,'skipped',skipped,'files',files);
END $$;
REVOKE ALL ON FUNCTION public.clone_properties_to_development(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_properties_to_development(uuid,uuid[]) TO authenticated;