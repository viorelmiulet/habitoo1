-- 1. Guard trigger: privileged columns on public.profiles
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Privileged execution paths (service_role, SECURITY DEFINER admin functions,
  -- table owner) run as a role other than the API roles and are allowed through.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identificatorul profilului nu poate fi modificat.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Agenția unui utilizator poate fi schimbată doar de un superadmin, prin operațiunea administrativă dedicată.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Statusul activ/inactiv poate fi modificat doar de un administrator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_profiles_guard_privileged ON public.profiles;
CREATE TRIGGER t_profiles_guard_privileged
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- 2. Explicit WITH CHECK on the update policy (defence in depth: the post-update
-- row must still belong to a scope the caller is allowed to write).
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.is_superadmin()
  OR id = auth.uid()
  OR (organization_id = public.current_org() AND public.is_org_admin())
)
WITH CHECK (
  public.is_superadmin()
  OR (id = auth.uid() AND organization_id IS NOT DISTINCT FROM public.current_org())
  OR (organization_id = public.current_org() AND public.is_org_admin())
);

-- 3. Tighten profile creation: no self-assignment into an arbitrary organization.
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin()
  OR (id = auth.uid() AND organization_id IS NULL)
  OR (public.is_org_admin() AND organization_id = public.current_org())
);

-- 4. Dedicated, audited admin operation for moving a user between organizations.
CREATE OR REPLACE FUNCTION public.admin_change_user_organization(_user_id uuid, _new_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _old_org uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate muta un utilizator între agenții.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id INTO _old_org FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizatorul nu există.' USING ERRCODE = 'no_data_found';
  END IF;

  IF _new_org IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _new_org) THEN
    RAISE EXCEPTION 'Agenția destinație nu există.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE public.profiles SET organization_id = _new_org, updated_at = now() WHERE id = _user_id;
  UPDATE public.user_roles SET organization_id = _new_org WHERE user_id = _user_id AND role <> 'superadmin';

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (
    _new_org, _actor, 'profiles.organization_changed', 'profiles', _user_id,
    jsonb_build_object('organization_id', _old_org),
    jsonb_build_object('organization_id', _new_org, 'changed_by', _actor, 'changed_at', now())
  , _actor);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_user_organization(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_organization(uuid, uuid) TO authenticated;