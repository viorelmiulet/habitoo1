-- 1. Plan limits ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_agent_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_plan, 'basic'))
    WHEN 'pro' THEN 10
    WHEN 'business' THEN 30
    ELSE 3
  END;
$$;

-- 2. Normalize existing plan values --------------------------------------
UPDATE public.organizations
SET plan = CASE lower(plan)
      WHEN 'starter' THEN 'basic'
      WHEN 'growth' THEN 'pro'
      WHEN 'enterprise' THEN 'business'
      WHEN 'basic' THEN 'basic'
      WHEN 'pro' THEN 'pro'
      WHEN 'business' THEN 'business'
      ELSE 'basic'
    END;

ALTER TABLE public.organizations ALTER COLUMN plan SET DEFAULT 'basic';
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check CHECK (plan IN ('basic','pro','business'));

UPDATE public.organizations SET max_users = public.plan_agent_limit(plan);

-- 3. Keep max_users in sync with the plan and restrict plan changes -------
CREATE OR REPLACE FUNCTION public.guard_org_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    IF current_user IN ('authenticated','anon') AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Planul agenției poate fi schimbat doar de un superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  NEW.max_users := public.plan_agent_limit(NEW.plan);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_org_plan ON public.organizations;
CREATE TRIGGER t_org_plan
BEFORE INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_org_plan();

-- 4. Seat usage helper ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_seat_usage(_org uuid)
RETURNS TABLE(plan text, seat_limit integer, used integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.plan,
         public.plan_agent_limit(o.plan) AS seat_limit,
         (SELECT count(*)::int
            FROM public.profiles p
           WHERE p.organization_id = o.id
             AND p.is_active
             AND EXISTS (SELECT 1 FROM public.user_roles r
                          WHERE r.user_id = p.id AND r.role = 'agent')) AS used
    FROM public.organizations o
   WHERE o.id = _org;
$$;

REVOKE ALL ON FUNCTION public.org_seat_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_seat_usage(uuid) TO authenticated, service_role;