-- Perioada gratuită de 30 de zile la aprobarea unei agenții noi.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

-- Motiv distinct de blocare pentru sfârșitul perioadei de probă.
CREATE OR REPLACE FUNCTION public.org_access_blocked()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN o.archived_at IS NOT NULL THEN 'archived'
    WHEN o.status = 'suspended' AND o.suspended_reason = 'trial_expired' THEN 'trial_expired'
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

-- Agenția nu își poate modifica singură planul, termenul sau statutul de probă.
CREATE OR REPLACE FUNCTION public.guard_org_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND current_user IN ('authenticated','anon') AND NOT public.is_superadmin() THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN
      RAISE EXCEPTION 'Planul agenției poate fi schimbat doar de un superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.subscription_term IS DISTINCT FROM OLD.subscription_term
       OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
       OR NEW.subscription_started_at IS DISTINCT FROM OLD.subscription_started_at
       OR NEW.is_trial IS DISTINCT FROM OLD.is_trial THEN
      RAISE EXCEPTION 'Abonamentul agenției poate fi schimbat doar de un superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  NEW.max_users := coalesce(public.plan_agent_limit(NEW.plan), 1000000);
  RETURN NEW;
END;
$function$;

-- La aprobare: 30 de zile gratuite, indiferent de planul și termenul cerute.
CREATE OR REPLACE FUNCTION public.approve_registration_request(_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _r public.agency_registration_requests;
  _org uuid;
  _slug text;
  _expires timestamptz;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate aproba o cerere de înscriere.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO _r FROM public.agency_registration_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cererea nu există.' USING ERRCODE='no_data_found'; END IF;
  IF _r.status <> 'pending' THEN RAISE EXCEPTION 'Cererea a fost deja analizată.' USING ERRCODE='check_violation'; END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _r.user_id AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Utilizatorul aparține deja unei agenții.' USING ERRCODE='check_violation';
  END IF;

  _slug := lower(regexp_replace(_r.agency_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(_r.user_id::text,'-',''),1,6);
  -- Perioada gratuită înlocuiește prima facturare: mereu 30 de zile.
  _expires := now() + interval '30 days';

  INSERT INTO public.organizations (name, legal_name, cui, trade_registry_number, slug, status, collaboration_enabled, plan,
                                    subscription_term, subscription_started_at, subscription_expires_at, is_trial, created_by, updated_by)
  VALUES (_r.agency_name, _r.legal_name, _r.cui, _r.trade_registry_number, _slug, 'active', true,
          coalesce(_r.requested_plan,'basic'), coalesce(_r.requested_term,'30d'), now(), _expires, true, _actor, _actor)
  RETURNING id INTO _org;

  INSERT INTO public.profiles (id, organization_id, full_name, phone, email)
  VALUES (_r.user_id, _org, coalesce(nullif(_r.full_name,''),'Utilizator'), _r.phone,
          coalesce(_r.email, (SELECT email FROM auth.users WHERE id = _r.user_id)))
  ON CONFLICT (id) DO UPDATE SET organization_id = _org, full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_r.user_id, _org, 'agency_admin') ON CONFLICT (user_id, role) DO UPDATE SET organization_id = _org;

  UPDATE public.agency_registration_requests
     SET status = 'approved', reviewed_by = _actor, reviewed_at = now(), organization_id = _org, rejection_reason = NULL
   WHERE id = _request_id;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body)
  VALUES (_org, _r.user_id, 'account', 'Agenția ta a fost aprobată',
          'Ai acum acces complet în Habitoo CRM, cu 30 de zile gratuite.');

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org, _actor, 'agency_registration.approved', 'agency_registration_requests', _request_id,
          jsonb_build_object('status','pending'),
          jsonb_build_object('status','approved','organization_id',_org,'user_id',_r.user_id,
                             'plan',coalesce(_r.requested_plan,'basic'),'subscription_term',coalesce(_r.requested_term,'30d'),
                             'trial_days',30,'subscription_expires_at',_expires), _actor);

  RETURN _org;
END;
$function$;

-- Reînnoirea din Superadmin încheie perioada de probă.
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
  _was_trial boolean;
  _new_expires timestamptz;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate stabili termenul abonamentului.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _term IS NOT NULL AND _term NOT IN ('30d', '12m') THEN
    RAISE EXCEPTION 'Termen invalid: %', _term;
  END IF;

  SELECT subscription_term, subscription_expires_at, status, is_trial
    INTO _old_term, _old_expires, _old_status, _was_trial
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
    is_trial = false,
    status = CASE
      WHEN status = 'suspended' AND suspended_reason IN ('subscription_expired','trial_expired') THEN 'active'::org_status
      ELSE status
    END,
    suspended_reason = CASE
      WHEN suspended_reason IN ('subscription_expired','trial_expired') THEN NULL
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
    jsonb_build_object('subscription_term', _old_term, 'subscription_expires_at', _old_expires, 'status', _old_status, 'is_trial', _was_trial),
    jsonb_build_object('subscription_term', _term, 'subscription_expires_at', _new_expires, 'is_trial', false),
    auth.uid()
  );

  RETURN _new_expires;
END;
$function$;

-- Verificarea zilnică, cu texte distincte pentru perioada de probă.
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
  FOR _org IN
    SELECT id, name, subscription_expires_at, is_trial
    FROM public.organizations
    WHERE subscription_expires_at IS NOT NULL
      AND archived_at IS NULL
      AND status = 'active'
      AND now() >= subscription_expires_at + interval '5 days'
    FOR UPDATE
  LOOP
    UPDATE public.organizations
      SET status = 'suspended'::org_status,
          suspended_reason = CASE WHEN _org.is_trial THEN 'trial_expired' ELSE 'subscription_expired' END,
          updated_at = now()
      WHERE id = _org.id;

    INSERT INTO public.notifications (organization_id, user_id, type, title, body, link, created_by)
    SELECT _org.id, ur.user_id, 'subscription',
           CASE WHEN _org.is_trial THEN 'Perioada gratuită s-a încheiat'
                ELSE 'Contul agenției a fost suspendat' END,
           CASE WHEN _org.is_trial
                THEN 'Perioada ta gratuită de 30 de zile s-a încheiat, iar accesul la aplicație a fost suspendat. Contactează administratorul platformei pentru activarea abonamentului.'
                ELSE 'Abonamentul agenției tale a expirat, iar accesul la aplicație a fost suspendat. Contactează administratorul platformei.' END,
           '/app', NULL
    FROM public.user_roles ur
    WHERE ur.organization_id = _org.id AND ur.role = 'agency_admin';

    INSERT INTO public.audit_logs (organization_id, action, entity, entity_id, new_values)
    VALUES (_org.id, 'organization.subscription_suspended', 'organizations', _org.id,
            jsonb_build_object('subscription_expires_at', _org.subscription_expires_at,
                               'is_trial', _org.is_trial));

    _suspended := _suspended || jsonb_build_object('id', _org.id, 'name', _org.name, 'is_trial', _org.is_trial);
  END LOOP;

  FOR _org IN
    SELECT id, name, subscription_expires_at, is_trial
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
           CASE WHEN _org.is_trial THEN 'Perioada ta gratuită s-a încheiat'
                ELSE 'Abonamentul agenției a expirat' END,
           CASE WHEN _org.is_trial
                THEN 'Contul rămâne funcțional încă 5 zile. Dacă abonamentul nu este activat, accesul va fi suspendat.'
                ELSE 'Contul rămâne funcțional încă 5 zile. Dacă abonamentul nu este reînnoit, accesul va fi suspendat.' END,
           '/app', NULL
    FROM public.user_roles ur
    WHERE ur.organization_id = _org.id AND ur.role = 'agency_admin';

    INSERT INTO public.audit_logs (organization_id, action, entity, entity_id, new_values)
    VALUES (_org.id, 'organization.subscription_grace_started', 'organizations', _org.id,
            jsonb_build_object('subscription_expires_at', _org.subscription_expires_at,
                               'grace_days', 5, 'is_trial', _org.is_trial));

    _grace := _grace || jsonb_build_object('id', _org.id, 'name', _org.name,
                                           'expires_at', _org.subscription_expires_at,
                                           'is_trial', _org.is_trial);
  END LOOP;

  RETURN jsonb_build_object('suspended', _suspended, 'grace', _grace);
END;
$function$;
