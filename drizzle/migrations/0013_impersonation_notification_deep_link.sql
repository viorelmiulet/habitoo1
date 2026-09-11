CREATE OR REPLACE FUNCTION public.impersonation_request_create(_target uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _actor uuid := auth.uid();
  _org uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Acces refuzat: doar superadminul poate cere acces la un cont.';
  END IF;
  IF _actor = _target THEN
    RAISE EXCEPTION 'Nu poți cere acces la propriul cont.';
  END IF;
  IF public.has_role(_target, 'superadmin') THEN
    RAISE EXCEPTION 'Nu se poate cere acces la contul unui alt superadmin.';
  END IF;
  IF char_length(btrim(coalesce(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Motivul este obligatoriu (minim 10 caractere).';
  END IF;

  PERFORM public.impersonation_expire_stale();

  IF EXISTS (
    SELECT 1 FROM public.impersonation_requests
     WHERE superadmin_id = _actor AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'Ai deja o cerere în așteptare sau o sesiune activă. Închide-o înainte de a cere alta.';
  END IF;

  INSERT INTO public.impersonation_requests (superadmin_id, target_user_id, reason)
  VALUES (_actor, _target, btrim(_reason))
  RETURNING id INTO _id;

  SELECT organization_id INTO _org FROM public.profiles WHERE id = _target;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body, link)
  VALUES (
    _org, _target, 'impersonation_request',
    'Cerere de acces temporar la contul tău',
    'Un superadmin Habitoo cere acces temporar (24 de ore) la contul tău. Motiv: ' || btrim(_reason),
    '/app/settings?tab=access&request=' || _id::text
  );

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, _actor, 'impersonation.requested', 'impersonation_requests', _id,
          jsonb_build_object('target_user_id', _target, 'reason', btrim(_reason)));

  RETURN _id;
END;
$$;