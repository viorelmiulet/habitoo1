ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_by_superadmin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.superadmin_create_agency(
  _user_id uuid, _email text, _name text, _legal_name text, _cui text, _trade_registry_number text,
  _phone text, _city text, _full_name text, _plan text, _term text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _org uuid;
  _slug text;
  _plan_v text := coalesce(nullif(btrim(_plan),''),'basic');
  _term_v text := coalesce(nullif(btrim(_term),''),'trial_90d');
  _expires timestamptz;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate crea o agenție.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'Numele agenției este obligatoriu.'; END IF;
  IF _plan_v NOT IN ('basic','pro','unlimited') THEN RAISE EXCEPTION 'Plan invalid.'; END IF;
  IF _term_v NOT IN ('trial_14d','trial_30d','trial_90d','30d','12m') THEN RAISE EXCEPTION 'Termen invalid.'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Utilizatorul aparține deja unei agenții.' USING ERRCODE='check_violation';
  END IF;

  _expires := now() + CASE _term_v WHEN 'trial_14d' THEN interval '14 days' WHEN 'trial_30d' THEN interval '30 days'
    WHEN 'trial_90d' THEN interval '90 days' WHEN '30d' THEN interval '30 days' ELSE interval '12 months' END;
  _slug := lower(regexp_replace(_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(_user_id::text,'-',''),1,6);

  INSERT INTO public.organizations (name, legal_name, cui, trade_registry_number, slug, status, collaboration_enabled, plan,
    subscription_term, subscription_started_at, subscription_expires_at, is_trial, created_by, updated_by, email, phone, city,
    created_by_superadmin)
  VALUES (btrim(_name), nullif(btrim(_legal_name),''), nullif(btrim(_cui),''), nullif(btrim(_trade_registry_number),''), _slug,
    'active', true, _plan_v, _term_v, now(), _expires, _term_v LIKE 'trial%', _actor, _actor,
    nullif(btrim(_email),''), nullif(btrim(_phone),''), nullif(btrim(_city),''), true)
  RETURNING id INTO _org;

  INSERT INTO public.profiles (id, organization_id, full_name, phone, email)
  VALUES (_user_id, _org, coalesce(nullif(btrim(_full_name),''),'Administrator'), nullif(btrim(_phone),''), _email)
  ON CONFLICT (id) DO UPDATE SET organization_id = _org, full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_user_id, _org, 'agency_admin') ON CONFLICT (user_id, role) DO UPDATE SET organization_id = _org;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org, _actor, 'agency.created_by_superadmin', 'organizations', _org, NULL,
    jsonb_build_object('organization_id',_org,'user_id',_user_id,'plan',_plan_v,'subscription_term',_term_v,
      'subscription_expires_at',_expires), _actor);
  RETURN _org;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.superadmin_create_agency(uuid,text,text,text,text,text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_create_agency(uuid,text,text,text,text,text,text,text,text,text,text) TO authenticated, service_role;