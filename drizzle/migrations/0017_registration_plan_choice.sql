-- Planul dorit se alege o singură dată, la înscriere, și se aplică la aprobare.
ALTER TABLE public.agency_registration_requests
  ADD COLUMN IF NOT EXISTS requested_plan text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS requested_term text NOT NULL DEFAULT '30d';

ALTER TABLE public.agency_registration_requests
  DROP CONSTRAINT IF EXISTS agency_registration_requests_requested_plan_check;
ALTER TABLE public.agency_registration_requests
  ADD CONSTRAINT agency_registration_requests_requested_plan_check
  CHECK (requested_plan IN ('basic','pro','unlimited'));

ALTER TABLE public.agency_registration_requests
  DROP CONSTRAINT IF EXISTS agency_registration_requests_requested_term_check;
ALTER TABLE public.agency_registration_requests
  ADD CONSTRAINT agency_registration_requests_requested_term_check
  CHECK (requested_term IN ('30d','12m'));

-- Planul ȘI termenul de abonament rămân exclusiv la superadmin: apelurile directe
-- ale unui administrator de agenție (RLS îi permite UPDATE pe organizația lui) sunt respinse.
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
       OR NEW.subscription_started_at IS DISTINCT FROM OLD.subscription_started_at THEN
      RAISE EXCEPTION 'Abonamentul agenției poate fi schimbat doar de un superadmin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  NEW.max_users := coalesce(public.plan_agent_limit(NEW.plan), 1000000);
  RETURN NEW;
END;
$function$;

-- Submit: acceptă planul dorit, validat pe server.
CREATE OR REPLACE FUNCTION public.submit_agency_registration_request(
  _agency_name text, _legal_name text, _cui text, _trade_registry_number text,
  _full_name text, _phone text DEFAULT NULL::text,
  _requested_plan text DEFAULT 'basic', _requested_term text DEFAULT '30d')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _existing_status text;
  _plan text := lower(coalesce(nullif(btrim(_requested_plan),''), 'basic'));
  _term text := lower(coalesce(nullif(btrim(_requested_term),''), '30d'));
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
  IF _plan NOT IN ('basic','pro','unlimited') THEN RAISE EXCEPTION 'Plan invalid.' USING ERRCODE='check_violation'; END IF;
  IF _term NOT IN ('30d','12m') THEN RAISE EXCEPTION 'Termen de facturare invalid.' USING ERRCODE='check_violation'; END IF;

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
           requested_plan = _plan,
           requested_term = _term,
           status = 'pending',
           rejection_reason = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL
     WHERE user_id = _uid
     RETURNING id INTO _id;
  ELSE
    INSERT INTO public.agency_registration_requests
      (user_id, agency_name, legal_name, cui, trade_registry_number, full_name, phone, email, status, requested_plan, requested_term)
    VALUES (_uid, btrim(_agency_name), btrim(_legal_name), btrim(_cui), btrim(_trade_registry_number),
            btrim(_full_name), nullif(btrim(_phone), ''), (SELECT email FROM auth.users WHERE id = _uid), 'pending', _plan, _term)
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values, created_by)
  VALUES (NULL, _uid, 'agency_registration.submitted', 'agency_registration_requests', _id,
          jsonb_build_object('agency_name', btrim(_agency_name), 'legal_name', btrim(_legal_name),
                             'cui', btrim(_cui), 'trade_registry_number', btrim(_trade_registry_number),
                             'requested_plan', _plan, 'requested_term', _term), _uid);

  RETURN _id;
END; $function$;

-- Approve: aplică planul și termenul cerute la înscriere.
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
  _expires := CASE WHEN coalesce(_r.requested_term,'30d') = '12m' THEN now() + interval '12 months' ELSE now() + interval '30 days' END;

  INSERT INTO public.organizations (name, legal_name, cui, trade_registry_number, slug, status, collaboration_enabled, plan,
                                    subscription_term, subscription_started_at, subscription_expires_at, created_by, updated_by)
  VALUES (_r.agency_name, _r.legal_name, _r.cui, _r.trade_registry_number, _slug, 'active', true,
          coalesce(_r.requested_plan,'basic'), coalesce(_r.requested_term,'30d'), now(), _expires, _actor, _actor)
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
          jsonb_build_object('status','approved','organization_id',_org,'user_id',_r.user_id,
                             'plan',coalesce(_r.requested_plan,'basic'),'subscription_term',coalesce(_r.requested_term,'30d')), _actor);

  RETURN _org;
END;
$function$;