CREATE OR REPLACE FUNCTION public.guard_org_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_superadmin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.legal_name IS DISTINCT FROM OLD.legal_name
       OR NEW.cui IS DISTINCT FROM OLD.cui
       OR NEW.trade_registry_number IS DISTINCT FROM OLD.trade_registry_number
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
       OR NEW.slug IS DISTINCT FROM OLD.slug
       OR NEW.max_properties IS DISTINCT FROM OLD.max_properties
       OR NEW.max_users IS DISTINCT FROM OLD.max_users
       OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
       OR NEW.subscription_grace_notified_at IS DISTINCT FROM OLD.subscription_grace_notified_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.demo_seeded_at IS DISTINCT FROM OLD.demo_seeded_at
       OR NEW.demo_seed_version IS DISTINCT FROM OLD.demo_seed_version THEN
      RAISE EXCEPTION 'Aceste date ale agenției pot fi modificate doar de un superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS t_org_admin_fields ON public.organizations;
CREATE TRIGGER t_org_admin_fields BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_org_admin_fields();