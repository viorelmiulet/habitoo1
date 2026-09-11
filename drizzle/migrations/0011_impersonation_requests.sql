-- Acces temporar al superadminului în contul unui utilizator, cu acordul acestuia.
CREATE TABLE public.impersonation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL DEFAULT 'full',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.impersonation_requests
  ADD CONSTRAINT impersonation_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'revoked'));
ALTER TABLE public.impersonation_requests
  ADD CONSTRAINT impersonation_requests_mode_check
  CHECK (mode IN ('full', 'read_only'));
ALTER TABLE public.impersonation_requests
  ADD CONSTRAINT impersonation_requests_reason_check
  CHECK (char_length(btrim(reason)) >= 10);
ALTER TABLE public.impersonation_requests
  ADD CONSTRAINT impersonation_requests_distinct_check
  CHECK (superadmin_id <> target_user_id);

CREATE INDEX impersonation_requests_target_idx
  ON public.impersonation_requests (target_user_id, requested_at DESC);
CREATE INDEX impersonation_requests_superadmin_idx
  ON public.impersonation_requests (superadmin_id, requested_at DESC);
-- O singură cerere în așteptare sau sesiune activă per superadmin.
CREATE UNIQUE INDEX impersonation_requests_one_open_per_superadmin
  ON public.impersonation_requests (superadmin_id)
  WHERE status IN ('pending', 'approved');

CREATE TRIGGER impersonation_requests_touch
  BEFORE UPDATE ON public.impersonation_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT ON public.impersonation_requests TO authenticated;
GRANT ALL ON public.impersonation_requests TO service_role;

ALTER TABLE public.impersonation_requests ENABLE ROW LEVEL SECURITY;

-- Transparență totală: fiecare parte vede doar cererile care o privesc.
CREATE POLICY "impersonation visible to both parties"
ON public.impersonation_requests
FOR SELECT
TO authenticated
USING (superadmin_id = auth.uid() OR target_user_id = auth.uid());

-- Marchează drept expirate cererile fără răspuns și sesiunile depășite.
CREATE OR REPLACE FUNCTION public.impersonation_expire_stale()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.impersonation_requests
     SET status = 'expired'
   WHERE status IN ('pending', 'approved')
     AND expires_at <= now();
$$;

-- Superadminul cere accesul. Nu poate ținti un alt superadmin, nici pe sine.
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
    '/app/settings'
  );

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, _actor, 'impersonation.requested', 'impersonation_requests', _id,
          jsonb_build_object('target_user_id', _target, 'reason', btrim(_reason)));

  RETURN _id;
END;
$$;

-- Utilizatorul acceptă sau respinge. La acceptare, accesul durează 24h.
CREATE OR REPLACE FUNCTION public.impersonation_respond(_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.impersonation_requests;
  _org uuid;
BEGIN
  PERFORM public.impersonation_expire_stale();

  SELECT * INTO _row FROM public.impersonation_requests WHERE id = _id;
  IF _row.id IS NULL OR _row.target_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cererea nu există sau nu îți aparține.';
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cererea nu mai este în așteptare.';
  END IF;

  UPDATE public.impersonation_requests
     SET status = CASE WHEN _accept THEN 'approved' ELSE 'rejected' END,
         responded_at = now(),
         expires_at = CASE WHEN _accept THEN now() + interval '24 hours' ELSE now() END
   WHERE id = _id;

  SELECT organization_id INTO _org FROM public.profiles WHERE id = _row.target_user_id;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body, link)
  VALUES (
    _org, _row.superadmin_id, 'impersonation_response',
    CASE WHEN _accept THEN 'Cerere de acces aprobată' ELSE 'Cerere de acces respinsă' END,
    CASE WHEN _accept THEN 'Ai acces 24 de ore la contul solicitat.'
         ELSE 'Utilizatorul a respins cererea de acces.' END,
    '/superadmin/users'
  );

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, auth.uid(),
          CASE WHEN _accept THEN 'impersonation.approved' ELSE 'impersonation.rejected' END,
          'impersonation_requests', _id,
          jsonb_build_object('superadmin_id', _row.superadmin_id));
END;
$$;

-- Revocare: de către utilizatorul vizat sau de superadminul care iese din sesiune.
CREATE OR REPLACE FUNCTION public.impersonation_revoke(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.impersonation_requests;
  _org uuid;
BEGIN
  SELECT * INTO _row FROM public.impersonation_requests WHERE id = _id;
  IF _row.id IS NULL OR (auth.uid() <> _row.target_user_id AND auth.uid() <> _row.superadmin_id) THEN
    RAISE EXCEPTION 'Cererea nu există sau nu îți aparține.';
  END IF;
  IF _row.status NOT IN ('pending', 'approved') THEN
    RETURN;
  END IF;

  UPDATE public.impersonation_requests
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), expires_at = now()
   WHERE id = _id;

  SELECT organization_id INTO _org FROM public.profiles WHERE id = _row.target_user_id;

  IF auth.uid() = _row.target_user_id THEN
    INSERT INTO public.notifications (organization_id, user_id, type, title, body, link)
    VALUES (_org, _row.superadmin_id, 'impersonation_revoked',
            'Accesul la cont a fost revocat',
            'Utilizatorul a revocat accesul temporar la contul său.', '/superadmin/users');
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, auth.uid(), 'impersonation.revoked', 'impersonation_requests', _id,
          jsonb_build_object('target_user_id', _row.target_user_id,
                             'superadmin_id', _row.superadmin_id));
END;
$$;

-- Sursa unică de adevăr pentru „sesiunea este validă acum”.
CREATE OR REPLACE FUNCTION public.impersonation_target(_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target uuid;
BEGIN
  PERFORM public.impersonation_expire_stale();

  SELECT target_user_id INTO _target
    FROM public.impersonation_requests
   WHERE id = _id
     AND superadmin_id = auth.uid()
     AND status = 'approved'
     AND expires_at > now();

  IF _target IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT public.is_superadmin() THEN
    RETURN NULL;
  END IF;

  UPDATE public.impersonation_requests SET last_used_at = now() WHERE id = _id;
  RETURN _target;
END;
$$;
