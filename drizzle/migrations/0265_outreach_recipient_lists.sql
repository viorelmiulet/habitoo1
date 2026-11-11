CREATE TYPE public.outreach_status AS ENUM ('pending','sent','failed','bounced','unsubscribed');
CREATE TABLE public.outreach_lists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_lists TO authenticated;
GRANT ALL ON public.outreach_lists TO service_role;
ALTER TABLE public.outreach_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_lists_superadmin ON public.outreach_lists FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin')) WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE TABLE public.outreach_recipients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid NOT NULL REFERENCES public.outreach_lists(id) ON DELETE CASCADE, agency_name text, email text NOT NULL, city text, region text, phone text, website text, address_type text, source_url text, status public.outreach_status NOT NULL DEFAULT 'pending', sent_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(list_id,email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_recipients TO authenticated;
GRANT ALL ON public.outreach_recipients TO service_role;
ALTER TABLE public.outreach_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_recipients_superadmin ON public.outreach_recipients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin')) WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE INDEX outreach_recipient_filters ON public.outreach_recipients(list_id,status,city,created_at,id);
CREATE TABLE public.outreach_suppressions (email text PRIMARY KEY, reason text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_suppressions TO authenticated;
GRANT ALL ON public.outreach_suppressions TO service_role;
ALTER TABLE public.outreach_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_suppressions_superadmin ON public.outreach_suppressions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin')) WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE FUNCTION public.outreach_normalize_email() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.email := lower(btrim(NEW.email)); IF NEW.email = '' THEN RAISE EXCEPTION 'Email required'; END IF; RETURN NEW; END $$;
CREATE TRIGGER outreach_recipient_email BEFORE INSERT OR UPDATE ON public.outreach_recipients FOR EACH ROW EXECUTE FUNCTION public.outreach_normalize_email();
CREATE TRIGGER outreach_suppression_email BEFORE INSERT OR UPDATE ON public.outreach_suppressions FOR EACH ROW EXECUTE FUNCTION public.outreach_normalize_email();
CREATE FUNCTION public.outreach_import(_name text, _rows jsonb, _invalid integer DEFAULT 0, _duplicates integer DEFAULT 0, _list_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lid uuid; r jsonb; e text; n integer; imported integer := 0; duplicates integer := _duplicates; invalid integer := _invalid; suppressed integer := 0;
BEGIN
 IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
 IF length(btrim(_name)) NOT BETWEEN 1 AND 160 OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 10000 OR _invalid < 0 OR _duplicates < 0 THEN RAISE EXCEPTION 'Invalid import'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('outreach_suppressions',0));
 IF _list_id IS NULL THEN INSERT INTO public.outreach_lists(name,created_by) VALUES(btrim(_name),auth.uid()) RETURNING id INTO lid;
 ELSE SELECT id INTO lid FROM public.outreach_lists WHERE id=_list_id FOR UPDATE; IF lid IS NULL THEN RAISE EXCEPTION 'List not found'; END IF; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  e := lower(btrim(coalesce(r->>'email','')));
  IF length(e)>254 OR e !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' OR EXISTS(SELECT 1 FROM jsonb_each_text(r) WHERE length(value)>2000) THEN invalid:=invalid+1; CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.outreach_suppressions WHERE email=e) THEN suppressed:=suppressed+1; CONTINUE; END IF;
  INSERT INTO public.outreach_recipients(list_id,agency_name,email,city,region,phone,website,address_type,source_url) VALUES(lid,r->>'agency_name',e,r->>'city',r->>'region',r->>'phone',r->>'website',r->>'address_type',r->>'source_url') ON CONFLICT(list_id,email) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n=0 THEN duplicates:=duplicates+1; ELSE imported:=imported+1; END IF;
 END LOOP;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(auth.uid(),'outreach.import','outreach_lists',lid,jsonb_build_object('imported',imported,'duplicates',duplicates,'invalid',invalid,'suppressed',suppressed));
 RETURN jsonb_build_object('list_id',lid,'imported',imported,'duplicates',duplicates,'invalid',invalid,'suppressed',suppressed);
END $$;
REVOKE ALL ON FUNCTION public.outreach_import(text,jsonb,integer,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_import(text,jsonb,integer,integer,uuid) TO authenticated;
CREATE FUNCTION public.outreach_exclude(_recipient_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.outreach_recipients; n integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('outreach_suppressions',0));
 SELECT * INTO r FROM public.outreach_recipients WHERE id=_recipient_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Recipient not found'; END IF;
 INSERT INTO public.outreach_suppressions(email,reason) VALUES(r.email,'manual_exclusion') ON CONFLICT(email) DO NOTHING;
 UPDATE public.outreach_recipients SET status='unsubscribed' WHERE email=r.email;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,old_values,new_values) VALUES(auth.uid(),'outreach.exclude','outreach_recipients',r.id,jsonb_build_object('status',r.status),jsonb_build_object('email',r.email,'status','unsubscribed','affected_recipients',n));
END $$;
REVOKE ALL ON FUNCTION public.outreach_exclude(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_exclude(uuid) TO authenticated;
CREATE FUNCTION public.outreach_list_summaries() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC,s.id) FROM (SELECT l.id,l.name,l.created_at,count(r.id) AS total,jsonb_build_object('pending',count(r.id) FILTER(WHERE r.status='pending'),'sent',count(r.id) FILTER(WHERE r.status='sent'),'failed',count(r.id) FILTER(WHERE r.status='failed'),'bounced',count(r.id) FILTER(WHERE r.status='bounced'),'unsubscribed',count(r.id) FILTER(WHERE r.status='unsubscribed')) AS counts FROM public.outreach_lists l LEFT JOIN public.outreach_recipients r ON r.list_id=l.id GROUP BY l.id) s),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.outreach_list_summaries() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_list_summaries() TO authenticated;
CREATE FUNCTION public.outreach_list_detail(_list_id uuid,_q text DEFAULT '',_status text DEFAULT '',_city text DEFAULT '',_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE list_name text; total bigint; cities jsonb; rows jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _page<1 OR _page>100000 OR length(_q)>200 OR length(_city)>2000 OR _status NOT IN ('','pending','sent','failed','bounced','unsubscribed') THEN RAISE EXCEPTION 'Invalid filters'; END IF;
 SELECT name INTO list_name FROM public.outreach_lists WHERE id=_list_id; IF list_name IS NULL THEN RAISE EXCEPTION 'List not found'; END IF;
 SELECT coalesce(jsonb_agg(city ORDER BY city),'[]'::jsonb) INTO cities FROM (SELECT DISTINCT city FROM public.outreach_recipients WHERE list_id=_list_id AND coalesce(city,'')<>'') c;
 SELECT count(*) INTO total FROM public.outreach_recipients WHERE list_id=_list_id AND (_status='' OR status::text=_status) AND (_city='' OR city=_city) AND (_q='' OR strpos(lower(coalesce(agency_name,'')),lower(_q))>0 OR strpos(email,lower(_q))>0);
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id),'[]'::jsonb) INTO rows FROM (SELECT * FROM public.outreach_recipients WHERE list_id=_list_id AND (_status='' OR status::text=_status) AND (_city='' OR city=_city) AND (_q='' OR strpos(lower(coalesce(agency_name,'')),lower(_q))>0 OR strpos(email,lower(_q))>0) ORDER BY created_at DESC,id LIMIT 24 OFFSET (_page-1)*24) r;
 RETURN jsonb_build_object('name',list_name,'total',total,'cities',cities,'rows',rows);
END $$;
REVOKE ALL ON FUNCTION public.outreach_list_detail(uuid,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_list_detail(uuid,text,text,text,integer) TO authenticated;