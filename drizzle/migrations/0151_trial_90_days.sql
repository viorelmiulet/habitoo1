ALTER TABLE public.organizations DROP CONSTRAINT organizations_subscription_term_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_subscription_term_check CHECK (subscription_term IS NULL OR subscription_term = ANY (ARRAY['trial_14d','trial_30d','trial_90d','30d','12m']));

CREATE OR REPLACE FUNCTION public.set_organization_subscription(_org uuid, _term text)
 RETURNS timestamp with time zone
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
  _is_trial boolean;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate stabili termenul abonamentului.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _term IS NOT NULL AND _term NOT IN ('trial_14d','trial_30d','trial_90d','30d','12m') THEN
    RAISE EXCEPTION 'Termen invalid: %', _term;
  END IF;

  SELECT subscription_term, subscription_expires_at, status, is_trial
    INTO _old_term, _old_expires, _old_status, _was_trial
  FROM public.organizations WHERE id = _org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenția nu a fost găsită.';
  END IF;

  _new_expires := CASE
    WHEN _term = 'trial_14d' THEN now() + interval '14 days'
    WHEN _term = 'trial_30d' THEN now() + interval '30 days'
    WHEN _term = 'trial_90d' THEN now() + interval '90 days'
    WHEN _term = '30d' THEN now() + interval '30 days'
    WHEN _term = '12m' THEN now() + interval '1 year'
    ELSE NULL
  END;
  _is_trial := _term IN ('trial_14d','trial_30d','trial_90d');

  UPDATE public.organizations SET
    subscription_term = _term,
    subscription_started_at = CASE WHEN _term IS NULL THEN NULL ELSE now() END,
    subscription_expires_at = _new_expires,
    subscription_grace_notified_at = NULL,
    is_trial = coalesce(_is_trial, false),
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
    jsonb_build_object('subscription_term', _term, 'subscription_expires_at', _new_expires, 'is_trial', coalesce(_is_trial, false)),
    auth.uid()
  );

  RETURN _new_expires;
END;
$function$;

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
  _expires := now() + interval '90 days';

  INSERT INTO public.organizations (name, legal_name, cui, trade_registry_number, slug, status, collaboration_enabled, plan,
                                    subscription_term, subscription_started_at, subscription_expires_at, is_trial, created_by, updated_by,
                                    email, phone)
  VALUES (_r.agency_name, _r.legal_name, _r.cui, _r.trade_registry_number, _slug, 'active', true,
          coalesce(_r.requested_plan,'basic'), 'trial_90d', now(), _expires, true, _actor, _actor,
          nullif(btrim(coalesce(_r.email, (SELECT email FROM auth.users WHERE id = _r.user_id))),''),
          nullif(btrim(_r.phone),''))
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
          'Ai acum acces complet în Habitoo CRM, cu 90 de zile gratuite.');

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org, _actor, 'agency_registration.approved', 'agency_registration_requests', _request_id,
          jsonb_build_object('status','pending'),
          jsonb_build_object('status','approved','organization_id',_org,'user_id',_r.user_id,
                             'plan',coalesce(_r.requested_plan,'basic'),'subscription_term','trial_90d','requested_term',coalesce(_r.requested_term,'30d'),
                             'trial_days',90,'subscription_expires_at',_expires), _actor);

  RETURN _org;
END;
$function$;