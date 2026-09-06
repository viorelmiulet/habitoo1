-- Agențiile în așteptare nu au context de lucru (nici RLS, nici acces).
CREATE OR REPLACE FUNCTION public.current_org()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.organization_id
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = auth.uid()
    AND o.status NOT IN ('suspended','cancelled','pending_approval')
    AND o.archived_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.org_access_blocked()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN o.archived_at IS NOT NULL THEN 'archived'
    WHEN o.status = 'suspended' THEN 'suspended'
    WHEN o.status = 'cancelled' THEN 'cancelled'
    WHEN o.status = 'pending_approval' THEN 'pending_approval'
    ELSE NULL
  END
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = auth.uid();
$function$;

DROP FUNCTION IF EXISTS public.bootstrap_agency(text, text, text);

CREATE OR REPLACE FUNCTION public.bootstrap_agency(
  _agency_name text,
  _full_name text,
  _phone text DEFAULT NULL::text,
  _legal_name text DEFAULT NULL::text,
  _cui text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _slug text;
  _c1 uuid; _c2 uuid; _p1 uuid; _p2 uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT organization_id INTO _org FROM public.profiles WHERE id = _uid;
  IF _org IS NOT NULL THEN RETURN _org; END IF;

  IF coalesce(btrim(_agency_name), '') = '' THEN
    RAISE EXCEPTION 'Numele comercial este obligatoriu.' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(_legal_name), '') = '' THEN
    RAISE EXCEPTION 'Numele legal este obligatoriu.' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(_cui), '') = '' THEN
    RAISE EXCEPTION 'CUI-ul este obligatoriu.' USING ERRCODE = 'check_violation';
  END IF;

  _slug := lower(regexp_replace(btrim(_agency_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(_uid::text,'-',''),1,6);

  INSERT INTO public.organizations (name, legal_name, cui, slug, status, created_by, updated_by)
  VALUES (btrim(_agency_name), btrim(_legal_name), btrim(_cui), _slug, 'pending_approval', _uid, _uid)
  RETURNING id INTO _org;

  INSERT INTO public.profiles (id, organization_id, full_name, phone, email)
  VALUES (_uid, _org, coalesce(nullif(_full_name,''),'Utilizator'), _phone, (SELECT email FROM auth.users WHERE id = _uid))
  ON CONFLICT (id) DO UPDATE SET organization_id = _org, full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_uid, _org, 'agency_admin') ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.contacts (organization_id, type, first_name, last_name, phone, email, source, assigned_to, created_by, gdpr_consent)
  VALUES (_org,'owner','Andrei','Popescu','0722111222','andrei.popescu@example.ro','Recomandare',_uid,_uid,true) RETURNING id INTO _c1;
  INSERT INTO public.contacts (organization_id, type, first_name, last_name, phone, email, source, assigned_to, created_by, gdpr_consent)
  VALUES (_org,'buyer','Maria','Ionescu','0733444555','maria.ionescu@example.ro','Imobiliare.ro',_uid,_uid,true) RETURNING id INTO _c2;

  INSERT INTO public.properties (organization_id, reference, title, description, property_type, transaction_kind, status, price, surface, rooms, bedrooms, bathrooms, floor, building_floors, city, county, district, address, lat, lng, owner_contact_id, assigned_to, created_by, commission)
  VALUES (_org,'P-1001','Apartament 3 camere, Militari Residence','Apartament luminos, bloc nou, finisaje premium, parcare subterană.','apartment','sale','active',119000,78,3,2,2,4,8,'București','București','Sector 6','Bd. Iuliu Maniu 500',44.4325,26.0125,_c1,_uid,_uid,'2%')
  RETURNING id INTO _p1;
  INSERT INTO public.properties (organization_id, reference, title, description, property_type, transaction_kind, status, price, currency, surface, rooms, city, county, district, assigned_to, created_by, commission)
  VALUES (_org,'P-1002','Garsonieră mobilată, Piața Victoriei','Garsonieră modernă, complet mobilată și utilată, ideală pentru închiriere.','studio','rent','active',600,'EUR',38,1,'București','București','Sector 1',_uid,_uid,'1 chirie')
  RETURNING id INTO _p2;
  INSERT INTO public.properties (organization_id, reference, title, description, property_type, transaction_kind, status, price, surface, rooms, city, county, assigned_to, created_by)
  VALUES (_org,'P-1003','Casă individuală, Corbeanca','Casă pe un nivel, teren 500 mp, zonă liniștită.','house','sale','reserved',245000,140,4,'Corbeanca','Ilfov',_uid,_uid);

  INSERT INTO public.requests (organization_id, contact_id, kind, title, property_type, budget_min, budget_max, cities, areas, rooms_min, rooms_max, surface_min, priority, assigned_to, created_by, source)
  VALUES (_org,_c2,'buy','3 camere, Militari, sub 120.000 EUR','apartment',90000,120000,ARRAY['București'],ARRAY['Militari','Drumul Taberei'],3,3,70,'high',_uid,_uid,'Site agenție');

  INSERT INTO public.leads (organization_id, contact_id, property_id, name, phone, email, source, stage, score, assigned_to, created_by, last_interaction_at, next_followup_at)
  VALUES (_org,_c2,_p1,'Maria Ionescu','0733444555','maria.ionescu@example.ro','Imobiliare.ro','qualified',72,_uid,_uid, now() - interval '1 day', now() + interval '2 days'),
         (_org,NULL,_p2,'Radu Dumitrescu','0744555666','radu.d@example.ro','OLX','new',35,_uid,_uid, now(), now() + interval '1 day');

  INSERT INTO public.activities (organization_id, kind, title, description, starts_at, contact_id, property_id, assigned_to, created_by)
  VALUES (_org,'viewing','Vizionare Militari Residence','Vizionare cu Maria Ionescu', now() + interval '3 hours', _c2, _p1, _uid, _uid),
         (_org,'call','Apel proprietar Andrei Popescu','Confirmare preț și disponibilitate', now() + interval '1 hour', _c1, _p1, _uid, _uid),
         (_org,'followup','Follow-up Radu Dumitrescu',NULL, now() + interval '1 day', NULL, _p2, _uid, _uid);

  INSERT INTO public.goals (organization_id, user_id, metric, target, progress, created_by)
  VALUES (_org,_uid,'leads',50,12,_uid),(_org,_uid,'viewings',20,6,_uid),(_org,_uid,'new_properties',10,3,_uid),(_org,_uid,'transactions',3,1,_uid);

  INSERT INTO public.notifications (organization_id, user_id, type, title, body)
  VALUES (_org,_uid,'match','Potrivire nouă găsită','Apartament 3 camere Militari se potrivește cererii Mariei Ionescu (92%).'),
         (_org,_uid,'lead','Lead nou din OLX','Radu Dumitrescu a solicitat detalii pentru garsoniera din Piața Victoriei.');

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org,_uid,'agency.created','organizations',_org,
    jsonb_build_object('name', btrim(_agency_name), 'legal_name', btrim(_legal_name), 'cui', btrim(_cui), 'status', 'pending_approval'));

  RETURN _org;
END; $function$;

-- Aprobarea unei agenții: doar superadmin, cu jurnalizare.
CREATE OR REPLACE FUNCTION public.approve_organization(_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _old text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate aproba o agenție.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status::text INTO _old FROM public.organizations WHERE id = _org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenția nu există.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.organizations
     SET status = 'active', updated_by = _actor, updated_at = now()
   WHERE id = _org;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org, _actor, 'organization.approved', 'organizations', _org,
          jsonb_build_object('status', _old),
          jsonb_build_object('status', 'active', 'approved_by', _actor, 'approved_at', now()), _actor);
END; $function$;

REVOKE ALL ON FUNCTION public.approve_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_organization(uuid) TO authenticated;
