-- Aprobarea din email pentru cererile de acces temporar: token unic, hash-uit,
-- de unică folosință, valabil doar cât cererea este în așteptare.
ALTER TABLE public.impersonation_requests
  ADD COLUMN IF NOT EXISTS approve_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS approve_token_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoke_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS revoke_token_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_via TEXT;

-- Tokenul se stochează doar ca hash SHA-256; valoarea brută există numai în email.
CREATE OR REPLACE FUNCTION public.impersonation_set_approve_token(_id uuid, _hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.impersonation_requests;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Acces refuzat.';
  END IF;
  SELECT * INTO _row FROM public.impersonation_requests WHERE id = _id;
  IF _row.id IS NULL OR _row.superadmin_id <> auth.uid() OR _row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cererea nu poate primi un token de aprobare.';
  END IF;
  IF _row.approve_token_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Tokenul de aprobare a fost deja generat.';
  END IF;
  UPDATE public.impersonation_requests SET approve_token_hash = _hash WHERE id = _id;
END;
$$;

-- Aprobare/respingere din email, fără autentificare. Tokenul este de unică
-- folosință și moare împreună cu cererea (expirare sau revocare).
CREATE OR REPLACE FUNCTION public.impersonation_respond_by_token(
  _id uuid, _hash text, _accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.impersonation_requests;
  _org uuid;
  _revoke text;
  _name text;
BEGIN
  PERFORM public.impersonation_expire_stale();

  SELECT * INTO _row FROM public.impersonation_requests WHERE id = _id;
  IF _row.id IS NULL
     OR _row.approve_token_hash IS NULL
     OR _row.approve_token_hash <> _hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF _row.approve_token_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used', 'status', _row.status);
  END IF;
  IF _row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed', 'status', _row.status);
  END IF;

  _revoke := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.impersonation_requests
     SET status = CASE WHEN _accept THEN 'approved' ELSE 'rejected' END,
         responded_at = now(),
         responded_via = 'email',
         approve_token_used_at = now(),
         revoke_token_hash = CASE WHEN _accept
           THEN encode(sha256(convert_to(_revoke, 'UTF8')), 'hex') ELSE NULL END,
         expires_at = CASE WHEN _accept THEN now() + interval '24 hours' ELSE now() END
   WHERE id = _id;

  SELECT organization_id INTO _org FROM public.profiles WHERE id = _row.target_user_id;
  SELECT full_name INTO _name FROM public.profiles WHERE id = _row.superadmin_id;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body, link)
  VALUES (
    _org, _row.superadmin_id, 'impersonation_response',
    CASE WHEN _accept THEN 'Cerere de acces aprobată' ELSE 'Cerere de acces respinsă' END,
    CASE WHEN _accept THEN 'Utilizatorul a aprobat din email. Ai acces 24 de ore.'
         ELSE 'Utilizatorul a respins cererea din email.' END,
    '/superadmin/users'
  );

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, _row.target_user_id,
          CASE WHEN _accept THEN 'impersonation.approved' ELSE 'impersonation.rejected' END,
          'impersonation_requests', _id,
          jsonb_build_object('superadmin_id', _row.superadmin_id, 'via', 'email'));

  RETURN jsonb_build_object(
    'ok', true,
    'accepted', _accept,
    'reason_text', _row.reason,
    'superadmin_name', _name,
    'expires_at', CASE WHEN _accept THEN (now() + interval '24 hours') ELSE NULL END,
    'revoke_token', CASE WHEN _accept THEN _revoke ELSE NULL END
  );
END;
$$;

-- Revocare imediată din pagina de confirmare, tot fără autentificare.
CREATE OR REPLACE FUNCTION public.impersonation_revoke_by_token(_id uuid, _hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.impersonation_requests;
  _org uuid;
BEGIN
  SELECT * INTO _row FROM public.impersonation_requests WHERE id = _id;
  IF _row.id IS NULL
     OR _row.revoke_token_hash IS NULL
     OR _row.revoke_token_hash <> _hash
     OR _row.revoke_token_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF _row.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed', 'status', _row.status);
  END IF;

  UPDATE public.impersonation_requests
     SET status = 'revoked',
         revoked_at = now(),
         revoked_by = _row.target_user_id,
         revoke_token_used_at = now(),
         expires_at = now()
   WHERE id = _id;

  SELECT organization_id INTO _org FROM public.profiles WHERE id = _row.target_user_id;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body, link)
  VALUES (_org, _row.superadmin_id, 'impersonation_revoked',
          'Accesul la cont a fost revocat',
          'Utilizatorul a revocat accesul temporar la contul său.', '/superadmin/users');

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org, _row.target_user_id, 'impersonation.revoked', 'impersonation_requests', _id,
          jsonb_build_object('superadmin_id', _row.superadmin_id, 'via', 'email'));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Detaliile cererii pentru pagina publică, strict pe baza tokenului valid.
CREATE OR REPLACE FUNCTION public.impersonation_preview_by_token(_id uuid, _hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.impersonation_requests;
  _name text;
BEGIN
  PERFORM public.impersonation_expire_stale();
  SELECT * INTO _row FROM public.impersonation_requests WHERE id = _id;
  IF _row.id IS NULL
     OR _row.approve_token_hash IS NULL
     OR _row.approve_token_hash <> _hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT full_name INTO _name FROM public.profiles WHERE id = _row.superadmin_id;
  RETURN jsonb_build_object(
    'ok', true,
    'status', _row.status,
    'used', _row.approve_token_used_at IS NOT NULL,
    'reason_text', _row.reason,
    'superadmin_name', _name,
    'requested_at', _row.requested_at,
    'expires_at', _row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.impersonation_respond_by_token(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.impersonation_revoke_by_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.impersonation_preview_by_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.impersonation_respond_by_token(uuid, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.impersonation_revoke_by_token(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.impersonation_preview_by_token(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.impersonation_set_approve_token(uuid, text) TO authenticated, service_role;