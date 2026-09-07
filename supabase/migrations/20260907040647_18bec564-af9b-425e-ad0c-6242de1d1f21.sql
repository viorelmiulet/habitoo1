CREATE TABLE public.agency_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  agency_name text NOT NULL,
  legal_name text NOT NULL,
  cui text NOT NULL,
  trade_registry_number text NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agency_registration_requests TO authenticated;
GRANT ALL ON public.agency_registration_requests TO service_role;

ALTER TABLE public.agency_registration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own request select" ON public.agency_registration_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY "own request insert" ON public.agency_registration_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TRIGGER t_agency_registration_requests
  BEFORE UPDATE ON public.agency_registration_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_agency_reg_requests_status ON public.agency_registration_requests (status, created_at DESC);

-- Trimiterea cererii de înscriere: nu creează organizație/profil/rol.
CREATE OR REPLACE FUNCTION public.submit_agency_registration_request(
  _agency_name text,
  _legal_name text,
  _cui text,
  _trade_registry_number text,
  _full_name text,
  _phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _existing_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Contul aparține deja unei agenții.' USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(btrim(_agency_name),'') = '' THEN RAISE EXCEPTION 'Numele comercial este obligatoriu.' USING ERRCODE='check_violation'; END IF;
  IF coalesce(btrim(_legal_name),'') = '' THEN RAISE EXCEPTION 'Numele legal este obligatoriu.' USING ERRCODE='check_violation'; END IF;
  IF coalesce(btrim(_cui),'') = '' THEN RAISE EXCEPTION 'CUI-ul este obligatoriu.' USING ERRCODE='check_violation'; END IF;
  IF coalesce(btrim(_trade_registry_number),'') = '' THEN RAISE EXCEPTION 'Numărul de înregistrare la Registrul Comerțului este obligatoriu.' USING ERRCODE='check_violation'; END IF;
  IF coalesce(btrim(_full_name),'') = '' THEN RAISE EXCEPTION 'Numele complet este obligatoriu.' USING ERRCODE='check_violation'; END IF;
  IF coalesce(btrim(_phone),'') = '' THEN RAISE EXCEPTION 'Numărul de telefon este obligatoriu.' USING ERRCODE='check_violation'; END IF;

  SELECT status INTO _existing_status FROM public.agency_registration_requests WHERE user_id = _uid;

  IF _existing_status = 'pending' THEN
    RAISE EXCEPTION 'Ai deja o cerere în așteptare.' USING ERRCODE = 'check_violation';
  ELSIF _existing_status = 'approved' THEN
    RAISE EXCEPTION 'Cererea ta a fost deja aprobată.' USING ERRCODE = 'check_violation';
  ELSIF _existing_status IS NOT NULL THEN
    UPDATE public.agency_registration_requests
       SET agency_name = btrim(_agency_name),
           legal_name = btrim(_legal_name),
           cui = btrim(_cui),
           trade_registry_number = btrim(_trade_registry_number),
           full_name = btrim(_full_name),
           phone = nullif(btrim(_phone), ''),
           email = (SELECT email FROM auth.users WHERE id = _uid),
           status = 'pending',
           rejection_reason = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL
     WHERE user_id = _uid
     RETURNING id INTO _id;
  ELSE
    INSERT INTO public.agency_registration_requests
      (user_id, agency_name, legal_name, cui, trade_registry_number, full_name, phone, email, status)
    VALUES (_uid, btrim(_agency_name), btrim(_legal_name), btrim(_cui), btrim(_trade_registry_number),
            btrim(_full_name), nullif(btrim(_phone), ''), (SELECT email FROM auth.users WHERE id = _uid), 'pending')
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values, created_by)
  VALUES (NULL, _uid, 'agency_registration.submitted', 'agency_registration_requests', _id,
          jsonb_build_object('agency_name', btrim(_agency_name), 'legal_name', btrim(_legal_name),
                             'cui', btrim(_cui), 'trade_registry_number', btrim(_trade_registry_number)), _uid);

  RETURN _id;
END; $$;

-- Aprobarea cererii: abia acum se creează organizația, profilul și rolul.
CREATE OR REPLACE FUNCTION public.approve_registration_request(_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _r public.agency_registration_requests;
  _org uuid;
  _slug text;
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

  INSERT INTO public.organizations (name, legal_name, cui, trade_registry_number, slug, status, created_by, updated_by)
  VALUES (_r.agency_name, _r.legal_name, _r.cui, _r.trade_registry_number, _slug, 'active', _actor, _actor)
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
  VALUES (_org, _r.user_id, 'account', 'Agenția ta a fost aprobată', 'Ai acum acces complet în Habitoo CRM.');

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (_org, _actor, 'agency_registration.approved', 'agency_registration_requests', _request_id,
          jsonb_build_object('status','pending'),
          jsonb_build_object('status','approved','organization_id',_org,'user_id',_r.user_id), _actor);

  RETURN _org;
END; $$;

-- Respingerea cererii: nu creează nimic.
CREATE OR REPLACE FUNCTION public.reject_registration_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _status text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate respinge o cerere de înscriere.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT status INTO _status FROM public.agency_registration_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cererea nu există.' USING ERRCODE='no_data_found'; END IF;
  IF _status <> 'pending' THEN RAISE EXCEPTION 'Cererea a fost deja analizată.' USING ERRCODE='check_violation'; END IF;

  UPDATE public.agency_registration_requests
     SET status = 'rejected', reviewed_by = _actor, reviewed_at = now(),
         rejection_reason = nullif(btrim(coalesce(_reason,'')), '')
   WHERE id = _request_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (NULL, _actor, 'agency_registration.rejected', 'agency_registration_requests', _request_id,
          jsonb_build_object('status','pending'),
          jsonb_build_object('status','rejected','reason', _reason), _actor);
END; $$;