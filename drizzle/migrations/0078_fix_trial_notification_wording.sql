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
                THEN 'Perioada ta gratuită s-a încheiat, iar accesul la aplicație a fost suspendat. Contactează administratorul platformei pentru activarea abonamentului.'
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