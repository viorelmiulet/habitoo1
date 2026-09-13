-- Helper DB care oglindește formula din web (plan_agent_limit + agenți activi).
CREATE OR REPLACE FUNCTION public.org_seat_usage(_org uuid)
RETURNS TABLE(plan text, seat_limit integer, used integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.plan::text,
    public.plan_agent_limit(o.plan::text) AS seat_limit,
    (
      SELECT count(*)::integer
      FROM public.user_roles r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.organization_id = _org
        AND r.role = 'agent'
        AND p.is_active
    ) AS used
  FROM public.organizations o
  WHERE o.id = _org;
$$;

REVOKE ALL ON FUNCTION public.org_seat_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_seat_usage(uuid) TO authenticated, service_role;

-- RPC-uri pentru gestionarea echipei de către administratorul agenției,
-- folosite de aplicația mobilă (echivalentul funcțiilor server din web).
-- Contul Auth NU este creat aici: aplicația îl creează prin fluxul public de
-- signup, iar agentul primește emailul de setare a parolei prin linkul de
-- recovery. Contul Auth nu este șters nici la eliminare (același model ca
-- superadmin_delete_user); la reinvitare, profilul este reatașat contului.

CREATE OR REPLACE FUNCTION public.team_invite_agent(_email text, _full_name text, _user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
_who uuid := auth.uid();
_org uuid;
_email_norm text := lower(btrim(_email));
_name_norm text := btrim(_full_name);
_plan text;
_seat_limit int;
_seats_used int;
_existing_id uuid;
_existing_org uuid;
_new_id uuid;
BEGIN
IF _who IS NULL THEN
  RAISE EXCEPTION 'Sesiune expirată. Intră din nou în cont.'
    USING ERRCODE = '28000';
END IF;
IF NOT public.is_org_admin() THEN
  RAISE EXCEPTION 'Acces refuzat: doar administratorul agenției poate gestiona agenții.'
    USING ERRCODE = 'insufficient_privilege';
END IF;
IF _name_norm IS NULL OR length(_name_norm) < 2 THEN
  RAISE EXCEPTION 'Numele agentului este obligatoriu.'
    USING ERRCODE = 'check_violation';
END IF;
IF _email_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
  RAISE EXCEPTION 'Adresa de email nu este validă.'
    USING ERRCODE = 'check_violation';
END IF;

SELECT organization_id INTO _org FROM public.profiles WHERE id = _who;
IF _org IS NULL THEN
  RAISE EXCEPTION 'Agenția nu este configurată pentru acest cont.'
    USING ERRCODE = 'no_data_found';
END IF;

-- Limita planului, aceeași formulă ca în web: agenți cu rolul „agent” activi.
SELECT u.plan, u.seat_limit, u.used INTO _plan, _seat_limit, _seats_used
FROM public.org_seat_usage(_org) u;
IF _seat_limit IS NOT NULL AND _seats_used >= _seat_limit THEN
  RAISE EXCEPTION 'Ai atins limita planului de % agenți. Treci la un plan superior pentru mai mulți agenți.', _seat_limit
    USING ERRCODE = 'check_violation';
END IF;

-- Emailul nu trebuie să aparțină deja unui profil (în orice agenție).
SELECT id, organization_id INTO _existing_id, _existing_org
FROM public.profiles
WHERE lower(email) = _email_norm
LIMIT 1;
IF _existing_id IS NOT NULL THEN
  IF _existing_org = _org THEN
    RAISE EXCEPTION 'Această persoană face deja parte din agenția ta.'
      USING ERRCODE = 'unique_violation';
  ELSE
    RAISE EXCEPTION 'Această adresă de email este deja folosită de un cont din altă agenție.'
      USING ERRCODE = 'unique_violation';
  END IF;
END IF;

-- Identificatorul contului Auth: trimis de aplicație (cont creat chiar acum
-- prin signup) sau căutat după email pentru conturile orfane.
IF _user_id IS NOT NULL THEN
  _new_id := _user_id;
ELSE
  BEGIN
    SELECT u.id INTO _new_id
    FROM auth.users u
    WHERE lower(u.email) = _email_norm
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Contul agentului nu a putut fi asociat. Contactează suportul pentru ajutor.'
      USING ERRCODE = 'feature_not_supported';
  END;
END IF;
IF _new_id IS NULL THEN
  RAISE EXCEPTION 'Contul agentului nu a putut fi creat. Verifică adresa de email și încearcă din nou.'
    USING ERRCODE = 'no_data_found';
END IF;

INSERT INTO public.profiles (id, organization_id, full_name, email, is_active)
VALUES (_new_id, _org, _name_norm, _email_norm, true);

INSERT INTO public.user_roles (user_id, organization_id, role)
VALUES (_new_id, _org, 'agent')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.audit_logs
  (organization_id, actor_id, action, entity, entity_id, new_values, created_by)
VALUES
  (_org, _who, 'team.agent_invited', 'profiles', _new_id,
   jsonb_build_object('email', _email_norm, 'full_name', _name_norm,
                      'plan', _plan, 'seats_used', _seats_used + 1),
   _who);

RETURN jsonb_build_object('ok', true, 'user_id', _new_id, 'organization_id', _org);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_remove_agent(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
_who uuid := auth.uid();
_org uuid;
_target_id uuid;
_target_org uuid;
_target_email text;
_target_name text;
BEGIN
IF _who IS NULL THEN
  RAISE EXCEPTION 'Sesiune expirată. Intră din nou în cont.'
    USING ERRCODE = '28000';
END IF;
IF NOT public.is_org_admin() THEN
  RAISE EXCEPTION 'Acces refuzat: doar administratorul agenției poate gestiona agenții.'
    USING ERRCODE = 'insufficient_privilege';
END IF;
IF _user_id = _who THEN
  RAISE EXCEPTION 'Nu îți poți elimina propriul cont.'
    USING ERRCODE = 'check_violation';
END IF;

SELECT organization_id INTO _org FROM public.profiles WHERE id = _who;
IF _org IS NULL THEN
  RAISE EXCEPTION 'Agenția nu este configurată pentru acest cont.'
    USING ERRCODE = 'no_data_found';
END IF;

SELECT id, organization_id, email, full_name
INTO _target_id, _target_org, _target_email, _target_name
FROM public.profiles
WHERE id = _user_id;
IF _target_id IS NULL OR _target_org IS DISTINCT FROM _org THEN
  RAISE EXCEPTION 'Utilizatorul nu face parte din agenția ta.'
    USING ERRCODE = 'no_data_found';
END IF;

IF EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = _user_id AND r.role IN ('superadmin', 'agency_admin')
) THEN
  RAISE EXCEPTION 'Administratorii agenției nu pot fi eliminați din această pagină.'
    USING ERRCODE = 'insufficient_privilege';
END IF;

DELETE FROM public.notifications WHERE user_id = _user_id;
DELETE FROM public.user_roles WHERE user_id = _user_id;
DELETE FROM public.profiles WHERE id = _user_id;

INSERT INTO public.audit_logs
  (organization_id, actor_id, action, entity, entity_id, old_values, created_by)
VALUES
  (_org, _who, 'team.agent_removed', 'profiles', _user_id,
   jsonb_build_object('email', _target_email, 'full_name', _target_name),
   _who);

RETURN jsonb_build_object('ok', true, 'user_id', _user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.team_invite_agent(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_invite_agent(text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.team_remove_agent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_remove_agent(uuid) TO authenticated, service_role;