CREATE TABLE public.ofera_categories (id bigint PRIMARY KEY, parent_id bigint, name text NOT NULL, code text NOT NULL, path_url text NOT NULL UNIQUE, depth integer NOT NULL, parameters jsonb NOT NULL, active boolean NOT NULL DEFAULT true, synced_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ofera_categories TO authenticated;
GRANT ALL ON public.ofera_categories TO service_role;
ALTER TABLE public.ofera_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ofera_categories_read ON public.ofera_categories FOR SELECT TO authenticated USING (true);
CREATE TABLE public.ofera_counties (id bigint PRIMARY KEY, name text NOT NULL, name_normalized text NOT NULL, active boolean NOT NULL DEFAULT true, synced_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ofera_counties TO authenticated;
GRANT ALL ON public.ofera_counties TO service_role;
ALTER TABLE public.ofera_counties ENABLE ROW LEVEL SECURITY;
CREATE POLICY ofera_counties_read ON public.ofera_counties FOR SELECT TO authenticated USING (true);
CREATE TABLE public.ofera_cities (id bigint PRIMARY KEY, name text NOT NULL, name_normalized text NOT NULL, county_id bigint NOT NULL, active boolean NOT NULL DEFAULT true, synced_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ofera_cities TO authenticated;
GRANT ALL ON public.ofera_cities TO service_role;
ALTER TABLE public.ofera_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY ofera_cities_read ON public.ofera_cities FOR SELECT TO authenticated USING (true);
CREATE INDEX ofera_cities_parent_name ON public.ofera_cities(county_id,name_normalized);
CREATE TABLE public.ofera_zones (id bigint PRIMARY KEY, name text NOT NULL, name_normalized text NOT NULL, city_id bigint NOT NULL, active boolean NOT NULL DEFAULT true, synced_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ofera_zones TO authenticated;
GRANT ALL ON public.ofera_zones TO service_role;
ALTER TABLE public.ofera_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY ofera_zones_read ON public.ofera_zones FOR SELECT TO authenticated USING (true);
CREATE INDEX ofera_zones_parent_name ON public.ofera_zones(city_id,name_normalized);
CREATE TABLE public.ofera_nomenclature_syncs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), synced_at timestamptz NOT NULL DEFAULT now(), synced_by uuid, success boolean NOT NULL, error_message text, counts jsonb, changes jsonb, raw_categories jsonb, raw_counties jsonb, raw_zones jsonb, cities_count integer, cities_hash text);
GRANT SELECT ON public.ofera_nomenclature_syncs TO authenticated;
GRANT ALL ON public.ofera_nomenclature_syncs TO service_role;
ALTER TABLE public.ofera_nomenclature_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ofera_syncs_superadmin ON public.ofera_nomenclature_syncs FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE INDEX ofera_syncs_date ON public.ofera_nomenclature_syncs(synced_at DESC);

CREATE FUNCTION public.ofera_nomenclature_apply(p_payload jsonb, p_actor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 k text; tbl text; fields text; cols text; setters text; comparisons text; n_read integer; n_added integer; n_modified integer; n_deactivated integer;
 counts jsonb := '{}'::jsonb; changes jsonb; old_categories jsonb; new_categories jsonb; sync_id uuid; synced timestamptz := now();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('ofera_nomenclature',0));
 FOREACH k IN ARRAY ARRAY['categories','counties','cities','zones'] LOOP
  IF jsonb_typeof(p_payload->k) IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->k)=0 THEN RAISE EXCEPTION 'Invalid Ofera catalogue %', k; END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) INTO old_categories FROM public.ofera_categories c WHERE active;
 new_categories := p_payload->'categories';
 SELECT jsonb_build_object(
  'categoriesAdded',coalesce((SELECT jsonb_agg((n->>'id')::bigint) FROM jsonb_array_elements(new_categories)n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_categories)o WHERE o->>'id'=n->>'id')),'[]'::jsonb),
  'categoriesRemoved',coalesce((SELECT jsonb_agg((o->>'id')::bigint) FROM jsonb_array_elements(old_categories)o WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(new_categories)n WHERE o->>'id'=n->>'id')),'[]'::jsonb),
  'categoriesChanged',coalesce((SELECT jsonb_agg((n->>'id')::bigint) FROM jsonb_array_elements(new_categories)n JOIN jsonb_array_elements(old_categories)o ON o->>'id'=n->>'id' WHERE (o-'active'-'synced_at') IS DISTINCT FROM n),'[]'::jsonb),
  'parameters',coalesce((SELECT jsonb_agg(jsonb_build_object('categoryId',coalesce(ncid,ocid)::bigint,'code',coalesce(ncode,ocode),'kind',CASE WHEN ocode IS NULL THEN 'added' WHEN ncode IS NULL THEN 'removed' WHEN (np-'options') IS DISTINCT FROM (op-'options') THEN 'modified' ELSE 'options' END)) FROM
   (SELECT c->>'id' ncid,p->>'code' ncode,p np FROM jsonb_array_elements(new_categories)c CROSS JOIN LATERAL jsonb_array_elements(c->'parameters')p WHERE c->>'path_url'='imobiliare' OR c->>'path_url' LIKE 'imobiliare/%') n
   FULL JOIN
   (SELECT c->>'id' ocid,p->>'code' ocode,p op FROM jsonb_array_elements(old_categories)c CROSS JOIN LATERAL jsonb_array_elements(c->'parameters')p WHERE c->>'path_url'='imobiliare' OR c->>'path_url' LIKE 'imobiliare/%') o
   ON ncid=ocid AND ncode=ocode WHERE np IS DISTINCT FROM op),'[]'::jsonb)
 ) INTO changes;
 FOREACH k IN ARRAY ARRAY['categories','counties','cities','zones'] LOOP
  tbl := 'ofera_'||k;
  IF k='categories' THEN
   fields := 'id bigint,parent_id bigint,name text,code text,path_url text,depth integer,parameters jsonb'; cols := 'id,parent_id,name,code,path_url,depth,parameters';
   setters := 'parent_id=excluded.parent_id,name=excluded.name,code=excluded.code,path_url=excluded.path_url,depth=excluded.depth,parameters=excluded.parameters';
   comparisons := '(t.parent_id,t.name,t.code,t.path_url,t.depth,t.parameters) IS DISTINCT FROM (n.parent_id,n.name,n.code,n.path_url,n.depth,n.parameters)';
  ELSE
   fields := 'id bigint,name text,name_normalized text'; cols := 'id,name,name_normalized'; setters := 'name=excluded.name,name_normalized=excluded.name_normalized';
   comparisons := '(t.name,t.name_normalized) IS DISTINCT FROM (n.name,n.name_normalized)';
   IF k='cities' THEN fields:=fields||',county_id bigint'; cols:=cols||',county_id'; setters:=setters||',county_id=excluded.county_id'; comparisons:=comparisons||' OR t.county_id IS DISTINCT FROM n.county_id'; END IF;
   IF k='zones' THEN fields:=fields||',city_id bigint'; cols:=cols||',city_id'; setters:=setters||',city_id=excluded.city_id'; comparisons:=comparisons||' OR t.city_id IS DISTINCT FROM n.city_id'; END IF;
  END IF;
  n_read := jsonb_array_length(p_payload->k);
  EXECUTE format('SELECT count(*)::int FROM jsonb_to_recordset($1) AS n(%s) LEFT JOIN public.%I t USING(id) WHERE t.id IS NULL',fields,tbl) INTO n_added USING p_payload->k;
  EXECUTE format('SELECT count(*)::int FROM jsonb_to_recordset($1) AS n(%s) JOIN public.%I t USING(id) WHERE NOT t.active OR (%s)',fields,tbl,comparisons) INTO n_modified USING p_payload->k;
  EXECUTE format('INSERT INTO public.%I AS t(%s,active,synced_at) SELECT %s,true,$2 FROM jsonb_to_recordset($1) AS n(%s) ON CONFLICT(id) DO UPDATE SET %s,active=true,synced_at=$2 WHERE NOT t.active OR (to_jsonb(t)-''active''-''synced_at'') IS DISTINCT FROM (to_jsonb(excluded)-''active''-''synced_at'')',tbl,cols,cols,fields,setters) USING p_payload->k,synced;
  EXECUTE format('UPDATE public.%I t SET active=false,synced_at=$2 WHERE active AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($1)n WHERE (n->>''id'')::bigint=t.id)',tbl) USING p_payload->k,synced;
  GET DIAGNOSTICS n_deactivated=ROW_COUNT;
  counts:=counts||jsonb_build_object(k,jsonb_build_object('read',n_read,'added',n_added,'modified',n_modified,'deactivated',n_deactivated));
 END LOOP;
 INSERT INTO public.ofera_nomenclature_syncs(synced_at,synced_by,success,counts,changes,raw_categories,raw_counties,raw_zones,cities_count,cities_hash)
 VALUES(synced,p_actor,true,counts,changes,p_payload->'raw'->'categories',p_payload->'raw'->'counties',p_payload->'raw'->'zones',(p_payload->'raw'->'cities'->>'count')::integer,p_payload->'raw'->'cities'->>'hash') RETURNING id INTO sync_id;
 IF jsonb_array_length(changes->'parameters')>0 THEN
  INSERT INTO public.notifications(user_id,organization_id,type,title,body,link,created_by)
  SELECT DISTINCT r.user_id,p.organization_id,'warning','Nomenclatorul Ofera s-a schimbat',format('%s modificări ale parametrilor imobiliari. Verifică maparea înainte de publicare.',jsonb_array_length(changes->'parameters')),'/superadmin/portals',p_actor
  FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.role='superadmin';
 END IF;
 RETURN jsonb_build_object('ok',true,'syncedAt',synced,'counts',counts,'changes',changes,'message',NULL);
END $$;
REVOKE ALL ON FUNCTION public.ofera_nomenclature_apply(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ofera_nomenclature_apply(jsonb,uuid) TO service_role;