-- Câte înregistrări sunt asignate unui utilizator (pentru avertismentul din interfață).
CREATE OR REPLACE FUNCTION public.superadmin_user_workload(_user uuid, _actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _who uuid := coalesce(_actor, auth.uid());
  _out jsonb;
BEGIN
  IF _who IS NULL OR NOT public.has_role(_who, 'superadmin') THEN
    RAISE EXCEPTION 'Acces refuzat: doar un superadmin poate inspecta datele unui utilizator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_object_agg(t, c) INTO _out FROM (
    SELECT 'properties' t, count(*) c FROM public.properties WHERE assigned_to = _user
    UNION ALL SELECT 'leads', count(*) FROM public.leads WHERE assigned_to = _user
    UNION ALL SELECT 'activities', count(*) FROM public.activities WHERE assigned_to = _user
    UNION ALL SELECT 'requests', count(*) FROM public.requests WHERE assigned_to = _user
    UNION ALL SELECT 'contacts', count(*) FROM public.contacts WHERE assigned_to = _user
    UNION ALL SELECT 'goals', count(*) FROM public.goals WHERE user_id = _user
  ) s;

  RETURN coalesce(_out, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_user_workload(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_user_workload(uuid, uuid) TO authenticated, service_role;

-- Realocarea tuturor datelor asignate de la un utilizator la altul din aceeași agenție.
CREATE OR REPLACE FUNCTION public.superadmin_reassign_user_data(_from uuid, _to uuid, _actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _who uuid := coalesce(_actor, auth.uid());
  _org_from uuid;
  _org_to uuid;
  _counts jsonb := '{}'::jsonb;
  _n bigint;
BEGIN
  IF _who IS NULL OR NOT public.has_role(_who, 'superadmin') THEN
    RAISE EXCEPTION 'Acces refuzat: doar un superadmin poate realoca datele unui utilizator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'Sursa și destinația realocării trebuie să fie diferite.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO _org_from FROM public.profiles WHERE id = _from;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizatorul sursă nu există.' USING ERRCODE = 'no_data_found'; END IF;
  SELECT organization_id INTO _org_to FROM public.profiles WHERE id = _to;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizatorul destinație nu există.' USING ERRCODE = 'no_data_found'; END IF;
  IF _org_from IS NULL OR _org_to IS NULL OR _org_from <> _org_to THEN
    RAISE EXCEPTION 'Realocarea este permisă doar între utilizatori din aceeași agenție.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.properties SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('properties', _n);
  UPDATE public.leads SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('leads', _n);
  UPDATE public.activities SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('activities', _n);
  UPDATE public.requests SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('requests', _n);
  UPDATE public.contacts SET assigned_to = _to, updated_at = now() WHERE assigned_to = _from;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('contacts', _n);
  UPDATE public.goals SET user_id = _to, updated_at = now() WHERE user_id = _from;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('goals', _n);

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org_from, _who, 'user.data_reassigned', 'profiles', _from,
          jsonb_build_object('assigned_to', _from),
          jsonb_build_object('assigned_to', _to, 'moved', _counts, 'at', now()), _who);

  RETURN _counts;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_reassign_user_data(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_reassign_user_data(uuid, uuid, uuid) TO authenticated, service_role;

-- Ștergerea definitivă a unui utilizator, cu realocare obligatorie a datelor asignate.
CREATE OR REPLACE FUNCTION public.superadmin_delete_user(_user uuid, _reassign_to uuid DEFAULT NULL, _actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _who uuid := coalesce(_actor, auth.uid());
  _org uuid;
  _name text;
  _email text;
  _workload jsonb;
  _pending bigint;
  _moved jsonb := '{}'::jsonb;
BEGIN
  IF _who IS NULL OR NOT public.has_role(_who, 'superadmin') THEN
    RAISE EXCEPTION 'Acces refuzat: doar un superadmin poate șterge un utilizator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _user = _who THEN
    RAISE EXCEPTION 'Nu îți poți șterge propriul cont din această listă.' USING ERRCODE = 'check_violation';
  END IF;
  IF public.has_role(_user, 'superadmin') THEN
    RAISE EXCEPTION 'Un cont de superadmin nu poate fi șters din administrarea utilizatorilor.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id, full_name, email INTO _org, _name, _email
  FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizatorul nu există.' USING ERRCODE = 'no_data_found'; END IF;

  _workload := public.superadmin_user_workload(_user, _who);
  SELECT coalesce(sum(value::bigint), 0) INTO _pending FROM jsonb_each_text(_workload);

  IF _pending > 0 THEN
    IF _reassign_to IS NULL THEN
      RAISE EXCEPTION 'Utilizatorul are date asignate (%). Alege un coleg care le preia înainte de ștergere.', _workload
        USING ERRCODE = 'check_violation';
    END IF;
    _moved := public.superadmin_reassign_user_data(_user, _reassign_to, _who);
  END IF;

  DELETE FROM public.property_favorites WHERE user_id = _user;
  DELETE FROM public.saved_views WHERE user_id = _user;
  DELETE FROM public.notifications WHERE user_id = _user;
  DELETE FROM public.user_roles WHERE user_id = _user AND role <> 'superadmin';
  DELETE FROM public.profiles WHERE id = _user;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org, _who, 'user.hard_deleted', 'profiles', _user,
          jsonb_build_object('user_id', _user, 'full_name', _name, 'email', _email, 'organization_id', _org, 'workload', _workload),
          jsonb_build_object('deleted_by', _who, 'deleted_at', now(), 'reassigned_to', _reassign_to, 'moved', _moved), _who);

  RETURN jsonb_build_object('user_id', _user, 'full_name', _name, 'email', _email, 'moved', _moved);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_delete_user(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_user(uuid, uuid, uuid) TO authenticated, service_role;
