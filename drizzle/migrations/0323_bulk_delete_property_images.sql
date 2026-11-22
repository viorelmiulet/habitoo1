CREATE OR REPLACE FUNCTION public.delete_property_images(_property uuid, _image_ids uuid[])
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prop record; ids uuid[]; matched int; paths text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Neautentificat.' USING ERRCODE = '42501'; END IF;
  SELECT array_agg(DISTINCT x) INTO ids FROM unnest(coalesce(_image_ids, '{}')) x WHERE x IS NOT NULL;
  IF ids IS NULL OR cardinality(ids) = 0 THEN RAISE EXCEPTION 'Selectează cel puțin o fotografie.' USING ERRCODE = '22023'; END IF;
  SELECT id, organization_id, assigned_to INTO prop FROM public.properties
    WHERE id = _property AND deleted_at IS NULL FOR UPDATE;
  IF prop.id IS NULL
     OR NOT (public.is_superadmin() OR (prop.organization_id = public.current_org()
             AND (public.is_org_admin() OR prop.assigned_to = auth.uid()))) THEN
    RAISE EXCEPTION 'Nu ai drept să modifici acest anunț.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*), array_agg(storage_path) FILTER (WHERE storage_path IS NOT NULL) INTO matched, paths
    FROM public.property_images
    WHERE id = ANY(ids) AND property_id = prop.id AND organization_id = prop.organization_id;
  IF matched <> cardinality(ids) THEN
    RAISE EXCEPTION 'Toate fotografiile trebuie să aparțină aceluiași anunț.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.property_images WHERE id = ANY(ids);
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position ASC NULLS LAST, created_at ASC, id ASC) - 1 AS p
    FROM public.property_images WHERE property_id = prop.id
  )
  UPDATE public.property_images pi SET position = o.p FROM ordered o
    WHERE o.id = pi.id AND pi.position IS DISTINCT FROM o.p;
  PERFORM public.property_images_sync_primary(prop.id);
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, new_values)
    VALUES (prop.organization_id, auth.uid(), 'property_images.bulk_delete', 'property', prop.id,
            jsonb_build_object('deleted_count', cardinality(ids), 'image_ids', to_jsonb(ids)));
  RETURN coalesce(paths, '{}');
END $$;
REVOKE ALL ON FUNCTION public.delete_property_images(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_property_images(uuid, uuid[]) TO authenticated, service_role;