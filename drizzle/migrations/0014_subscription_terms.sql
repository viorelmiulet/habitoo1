-- Abonament cu termen fix (30 zile / 12 luni) + 5 zile de grație.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_term text,
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_grace_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_term_check
  CHECK (subscription_term IS NULL OR subscription_term IN ('30d', '12m'));

-- Motiv distinct de blocare: 'expired' pentru suspendarea automată la expirare.
CREATE OR REPLACE FUNCTION public.org_access_blocked()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN o.archived_at IS NOT NULL THEN 'archived'
    WHEN o.status = 'suspended' AND o.suspended_reason = 'subscription_expired' THEN 'expired'
    WHEN o.status = 'suspended' THEN 'suspended'
    WHEN o.status = 'cancelled' THEN 'cancelled'
    WHEN o.status = 'pending_approval' THEN 'pending_approval'
    ELSE NULL
  END
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = auth.uid();
$function$;

-- Setarea / reînnoirea termenului: doar superadmin, data calculată din momentul apelului.
CREATE OR REPLACE FUNCTION public.set_organization_subscription(_org uuid, _term text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _old_term text;
  _old_expires timestamptz;
  _old_status org_status;
  _new_expires timestamptz;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate stabili termenul abonamentului.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _term IS NOT NULL AND _term NOT IN ('30d', '12m') THEN
    RAISE EXCEPTION 'Termen invalid: %', _term;
  END IF;

  SELECT subscription_term, subscription_expires_at, status
    INTO _old_term, _old_expires, _old_status
  FROM public.organizations WHERE id = _org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenția nu a fost găsită.';
  END IF;

  _new_expires := CASE
    WHEN _term = '30d' THEN now() + interval '30 days'
    WHEN _term = '12m' THEN now() + interval '1 year'
    ELSE NULL
  END;

  UPDATE public.organizations SET
    subscription_term = _term,
    subscription_started_at = CASE WHEN _term IS NULL THEN NULL ELSE now() END,
    subscription_expires_at = _new_expires,
    subscription_grace_notified_at = NULL,
    status = CASE
      WHEN status = 'suspended' AND suspended_reason = 'subscription_expired' THEN 'active'::org_status
      ELSE status
    END,
    suspended_reason = CASE
      WHEN suspended_reason = 'subscription_expired' THEN NULL
      ELSE suspended_reason
    END,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = _org;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (
    _org,
    auth.uid(),
    CASE WHEN _old_term IS NOT NULL AND _term IS NOT NULL THEN 'organization.subscription_renewed'
         ELSE 'organization.subscription_set' END,
    'organizations',
    _org,
    jsonb_build_object('subscription_term', _old_term, 'subscription_expires_at', _old_expires, 'status', _old_status),
    jsonb_build_object('subscription_term', _term, 'subscription_expires_at', _new_expires),
    auth.uid()
  );

  RETURN _new_expires;
END;
$function$;

-- Verificarea zilnică: activ -> grație (notificare) -> suspendat.
CREATE OR REPLACE FUNCTION public.subscription_enforce_daily()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _org record;
  _suspended jsonb := '[]'::jsonb;
  _grace jsonb := '[]'::jsonb;
BEGIN
  -- 1. Suspendare după 5 zile de grație.
  FOR _org IN
    SELECT id, name, subscription_expires_at
    FROM public.organizations
    WHERE subscription_expires_at IS NOT NULL
      AND archived_at IS NULL
      AND status = 'active'
      AND now() >= subscription_expires_at + interval '5 days'
    FOR UPDATE
  LOOP
    UPDATE public.organizations
      SET status = 'suspended'::org_status,
          suspended_reason = 'subscription_expired',
          updated_at = now()
      WHERE id = _org.id;

    INSERT INTO public.notifications (organization_id, user_id, type, title, body, link, created_by)
    SELECT _org.id, ur.user_id, 'subscription',
           'Contul agenției a fost suspendat',
           'Abonamentul agenției tale a expirat, iar accesul la aplicație a fost suspendat. Contactează administratorul platformei.',
           '/app', NULL
    FROM public.user_roles ur
    WHERE ur.organization_id = _org.id AND ur.role = 'agency_admin';

    INSERT INTO public.audit_logs (organization_id, action, entity, entity_id, new_values)
    VALUES (_org.id, 'organization.subscription_suspended', 'organizations', _org.id,
            jsonb_build_object('subscription_expires_at', _org.subscription_expires_at));

    _suspended := _suspended || jsonb_build_object('id', _org.id, 'name', _org.name);
  END LOOP;

  -- 2. Intrarea în grație: notificare unică pentru administratorii agenției.
  FOR _org IN
    SELECT id, name, subscription_expires_at
    FROM public.organizations
    WHERE subscription_expires_at IS NOT NULL
      AND archived_at IS NULL
      AND status = 'active'
      AND now() >= subscription_expires_at
      AND now() < subscription_expires_at + interval '5 days'
      AND subscription_grace_notified_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.organizations
      SET subscription_grace_notified_at = now(), updated_at = now()
      WHERE id = _org.id;

    INSERT INTO public.notifications (organization_id, user_id, type, title, body, link, created_by)
    SELECT _org.id, ur.user_id, 'subscription',
           'Abonamentul agenției a expirat',
           'Contul rămâne funcțional încă 5 zile. Dacă abonamentul nu este reînnoit, accesul va fi suspendat.',
           '/app', NULL
    FROM public.user_roles ur
    WHERE ur.organization_id = _org.id AND ur.role = 'agency_admin';

    INSERT INTO public.audit_logs (organization_id, action, entity, entity_id, new_values)
    VALUES (_org.id, 'organization.subscription_grace_started', 'organizations', _org.id,
            jsonb_build_object('subscription_expires_at', _org.subscription_expires_at,
                               'grace_days', 5));

    _grace := _grace || jsonb_build_object('id', _org.id, 'name', _org.name,
                                           'expires_at', _org.subscription_expires_at);
  END LOOP;

  RETURN jsonb_build_object('suspended', _suspended, 'grace', _grace);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_organization_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_subscription(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.subscription_enforce_daily() TO service_role;
GRANT EXECUTE ON FUNCTION public.org_access_blocked() TO authenticated, anon, service_role;