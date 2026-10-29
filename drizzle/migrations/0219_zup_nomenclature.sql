CREATE TABLE public.zup_nomenclature (id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, synced_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.zup_nomenclature TO authenticated;
GRANT ALL ON public.zup_nomenclature TO service_role;
ALTER TABLE public.zup_nomenclature ENABLE ROW LEVEL SECURITY;
CREATE POLICY zup_catalog_read ON public.zup_nomenclature FOR SELECT TO authenticated USING (true);
CREATE TABLE public.zup_nomenclature_syncs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, organization_id uuid, success boolean NOT NULL, counts jsonb NOT NULL DEFAULT '{}'::jsonb, changes jsonb NOT NULL DEFAULT '{}'::jsonb, raw_responses jsonb NOT NULL DEFAULT '{}'::jsonb, error_message text);
GRANT SELECT ON public.zup_nomenclature_syncs TO authenticated;
GRANT ALL ON public.zup_nomenclature_syncs TO service_role;
ALTER TABLE public.zup_nomenclature_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY zup_sync_superadmin_read ON public.zup_nomenclature_syncs FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE FUNCTION public.zup_nomenclature_apply(_snapshot jsonb, _raw jsonb, _actor uuid, _organization uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_snapshot jsonb; changes jsonb; counts jsonb; k text; delta jsonb; BEGIN
PERFORM pg_advisory_xact_lock(hashtext('zup_nomenclature'));
IF jsonb_typeof(_snapshot->'categories') <> 'array' OR jsonb_array_length(_snapshot->'categories') = 0 OR jsonb_typeof(_snapshot->'locations') <> 'array' OR jsonb_array_length(_snapshot->'locations') = 0 THEN RAISE EXCEPTION 'Invalid ZUP snapshot'; END IF;
SELECT snapshot INTO old_snapshot FROM public.zup_nomenclature WHERE id=1;
old_snapshot := coalesce(old_snapshot, '{"categories":[],"locations":[]}'::jsonb);
changes := '{}'::jsonb;
FOREACH k IN ARRAY ARRAY['categories','locations'] LOOP
SELECT jsonb_build_object('added',coalesce(jsonb_agg(n->>'id') FILTER (WHERE p IS NULL),'[]'::jsonb),'removed',coalesce(jsonb_agg(p->>'id') FILTER (WHERE n IS NULL),'[]'::jsonb),'modified',coalesce(jsonb_agg(n->>'id') FILTER (WHERE n IS NOT NULL AND p IS NOT NULL AND n IS DISTINCT FROM p),'[]'::jsonb)) INTO delta FROM jsonb_array_elements(_snapshot->k) n FULL JOIN jsonb_array_elements(old_snapshot->k) p ON n->>'id'=p->>'id';
changes := changes || jsonb_build_object(k,delta);
END LOOP;
counts := jsonb_build_object('categories',jsonb_array_length(_snapshot->'categories'),'finalCategories',(SELECT count(*) FROM jsonb_array_elements(_snapshot->'categories') c WHERE (c->>'leaf')::boolean),'characteristics',(SELECT coalesce(sum(jsonb_array_length(c->'characteristics')),0) FROM jsonb_array_elements(_snapshot->'categories') c),'counties',(SELECT count(DISTINCT l->>'county') FROM jsonb_array_elements(_snapshot->'locations') l),'localities',jsonb_array_length(_snapshot->'locations'));
INSERT INTO public.zup_nomenclature(id,snapshot) VALUES(1,_snapshot) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,synced_at=now() WHERE zup_nomenclature.snapshot IS DISTINCT FROM excluded.snapshot;
INSERT INTO public.zup_nomenclature_syncs(created_by,organization_id,success,counts,changes,raw_responses) VALUES(_actor,_organization,true,counts,changes,_raw);
RETURN jsonb_build_object('counts',counts,'changes',changes);
END $$;
REVOKE ALL ON FUNCTION public.zup_nomenclature_apply(jsonb,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zup_nomenclature_apply(jsonb,jsonb,uuid,uuid) TO service_role;