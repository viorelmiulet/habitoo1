-- Planurile noi: Basic (3), Pro (10), Unlimited (fără limită de agenți).
CREATE OR REPLACE FUNCTION public.plan_agent_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(coalesce(_plan, 'basic'))
    WHEN 'pro' THEN 10
    WHEN 'unlimited' THEN NULL
    WHEN 'business' THEN NULL
    WHEN 'enterprise' THEN NULL
    ELSE 3
  END::integer;
$function$;

CREATE OR REPLACE FUNCTION public.guard_org_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    IF current_user IN ('authenticated','anon') AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Planul agenției poate fi schimbat doar de un superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- Fără limită de agenți: `max_users` rămâne o valoare tehnică nelimitantă,
  -- iar aplicația tratează planul Unlimited prin cheia planului, nu prin număr.
  NEW.max_users := coalesce(public.plan_agent_limit(NEW.plan), 1000000);
  RETURN NEW;
END;
$function$;