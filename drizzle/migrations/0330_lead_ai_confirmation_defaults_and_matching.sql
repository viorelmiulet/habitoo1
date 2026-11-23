CREATE OR REPLACE FUNCTION public.confirm_lead_ai_request(_insight uuid, _fields text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.lead_ai_insights; l public.leads; r public.requests; patch jsonb; result uuid; f text; allowed text[] := ARRAY['kind','budget_min','budget_max','currency','cities','areas','rooms_min','rooms_max','surface_min','property_type','wants_parking','wants_balcony','furnished','pets_allowed','term'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acces refuzat.' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.lead_ai_insights WHERE id=_insight;
 IF i.id IS NULL OR i.status<>'done' THEN RAISE EXCEPTION 'Analiza nu este disponibilă.'; END IF;
 SELECT * INTO l FROM public.leads WHERE id=i.lead_id FOR UPDATE;
 IF l.id IS NULL OR l.deleted_at IS NOT NULL OR l.organization_id<>i.organization_id
 OR NOT (public.is_superadmin() OR (l.organization_id=public.current_org() AND (public.is_org_admin() OR l.assigned_to=auth.uid() OR (l.assigned_to IS NULL AND l.created_by=auth.uid())))) THEN RAISE EXCEPTION 'Lead-ul nu este disponibil.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=l.organization_id AND o.ai_enabled=true AND o.status NOT IN ('suspended','cancelled'))
 OR EXISTS(SELECT 1 FROM public.organization_ai_features af WHERE af.organization_id=l.organization_id AND af.feature_key='ai_lead_assist' AND af.enabled=false) THEN RAISE EXCEPTION 'Funcțiile AI nu sunt activate.' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.lead_ai_insights WHERE id=_insight FOR UPDATE;
 IF i.status<>'done' THEN RAISE EXCEPTION 'Analiza nu este disponibilă.'; END IF;
 IF i.changes_applied_at IS NOT NULL THEN RETURN i.request_id; END IF;
 IF _fields IS NULL OR cardinality(_fields)=0 OR NOT (_fields <@ allowed) THEN RAISE EXCEPTION 'Alege valorile de confirmat.'; END IF;
 SELECT coalesce(jsonb_object_agg(c->>'field',c->'value'),'{}'::jsonb) INTO patch
 FROM jsonb_array_elements(i.proposed_changes) c WHERE c->>'field'=ANY(_fields)
 AND nullif(btrim(c->>'evidence'),'') IS NOT NULL AND position(c->>'evidence' in coalesce(i.source_text,''))>0;
 IF patch='{}'::jsonb THEN RAISE EXCEPTION 'Nu există propuneri cu dovadă.'; END IF;
 IF (patch ? 'budget_min' OR patch ? 'budget_max') AND NOT patch ? 'currency' THEN RAISE EXCEPTION 'Confirmă și moneda bugetului din conversație.'; END IF;
 IF l.request_id IS NOT NULL THEN
 SELECT * INTO r FROM public.requests WHERE id=l.request_id FOR UPDATE;
 IF r.id IS NULL OR r.organization_id<>l.organization_id OR NOT (public.is_superadmin() OR public.is_org_admin() OR r.assigned_to=auth.uid() OR r.created_by=auth.uid()) THEN RAISE EXCEPTION 'Cererea nu este disponibilă.' USING ERRCODE='42501'; END IF;
 FOREACH f IN ARRAY ARRAY['cities','areas'] LOOP
 IF patch ? f THEN patch:=jsonb_set(patch,ARRAY[f],(SELECT coalesce(jsonb_agg(DISTINCT v),'[]'::jsonb) FROM jsonb_array_elements(coalesce(nullif(to_jsonb(r)->f,'null'::jsonb),'[]'::jsonb) || (patch->f)) v)); END IF;
 END LOOP;
 r:=jsonb_populate_record(r,patch); result:=r.id;
 IF r.budget_min>r.budget_max OR r.rooms_min>r.rooms_max THEN RAISE EXCEPTION 'Intervalul propus este contradictoriu.'; END IF;
 UPDATE public.requests SET kind=r.kind,budget_min=r.budget_min,budget_max=r.budget_max,currency=r.currency,cities=r.cities,areas=r.areas,rooms_min=r.rooms_min,rooms_max=r.rooms_max,surface_min=r.surface_min,property_type=r.property_type,wants_parking=r.wants_parking,wants_balcony=r.wants_balcony,furnished=r.furnished,pets_allowed=r.pets_allowed,term=r.term,updated_by=auth.uid() WHERE id=r.id;
 IF r.status='active' THEN INSERT INTO public.active_match_queue(organization_id,trigger,request_id) VALUES(l.organization_id,'request_created',r.id); END IF;
 ELSE
 IF NOT patch ? 'kind' THEN RAISE EXCEPTION 'Confirmă tipul cererii din conversație înainte de creare.'; END IF;
 r:=jsonb_populate_record(NULL::public.requests,patch);
 IF r.budget_min>r.budget_max OR r.rooms_min>r.rooms_max THEN RAISE EXCEPTION 'Intervalul propus este contradictoriu.'; END IF;
 INSERT INTO public.requests(organization_id,contact_id,assigned_to,created_by,kind,title,source,budget_min,budget_max,currency,cities,areas,rooms_min,rooms_max,surface_min,property_type,wants_parking,wants_balcony,furnished,pets_allowed,term)
 VALUES(l.organization_id,l.contact_id,coalesce(l.assigned_to,auth.uid()),auth.uid(),r.kind,'Cerere — '||l.name,'ai_conversation',r.budget_min,r.budget_max,coalesce(r.currency,'EUR'),coalesce(r.cities,'{}'),coalesce(r.areas,'{}'),r.rooms_min,r.rooms_max,r.surface_min,r.property_type,r.wants_parking,r.wants_balcony,r.furnished,r.pets_allowed,r.term) RETURNING id INTO result;
 UPDATE public.leads SET request_id=result WHERE id=l.id;
 END IF;
 UPDATE public.lead_ai_insights SET request_id=result,request_created=(l.request_id IS NULL),changes_applied_at=now() WHERE id=i.id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_lead_ai_request(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_lead_ai_request(uuid,text[]) TO authenticated;