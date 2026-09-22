-- Perioade de probă setabile din Superadmin, pe același câmp unic de expirare
-- (`organizations.subscription_expires_at`). `is_trial` distinge proba de abonament.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_term_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_term_check
  CHECK (subscription_term IS NULL OR subscription_term = ANY (ARRAY['trial_14d','trial_30d','30d','12m']));

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
  _is_trial boolean;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate stabili termenul abonamentului.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _term IS NOT NULL AND _term NOT IN ('trial_14d','trial_30d','30d','12m') THEN
    RAISE EXCEPTION 'Termen invalid: %', _term;
  END IF;

  SELECT subscription_term, subscription_expires_at, status, is_trial
    INTO _old_term, _old_expires, _old_status, _was_trial
  FROM public.organizations WHERE id = _org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenția nu a fost găsită.';
  END IF;

  -- Data de expirare se calculează exclusiv pe server, din momentul salvării.
  _new_expires := CASE
    WHEN _term = 'trial_14d' THEN now() + interval '14 days'
    WHEN _term = 'trial_30d' THEN now() + interval '30 days'
    WHEN _term = '30d' THEN now() + interval '30 days'
    WHEN _term = '12m' THEN now() + interval '1 year'
    ELSE NULL
  END;
  _is_trial := _term IN ('trial_14d','trial_30d');

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

GRANT EXECUTE ON FUNCTION public.set_organization_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_subscription(uuid, text) TO service_role;