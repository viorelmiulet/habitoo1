CREATE OR REPLACE FUNCTION public.guard_org_required_public_data()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() THEN RETURN NEW; END IF;
  IF (coalesce(btrim(OLD.email),'') <> '' AND coalesce(btrim(NEW.email),'') = '')
     OR (coalesce(btrim(OLD.phone),'') <> '' AND coalesce(btrim(NEW.phone),'') = '')
     OR (coalesce(btrim(OLD.material_address),'') <> '' AND coalesce(btrim(NEW.material_address),'') = '')
     OR (coalesce(btrim(OLD.city),'') <> '' AND coalesce(btrim(NEW.city),'') = '')
     OR (coalesce(btrim(OLD.postal_code),'') <> '' AND coalesce(btrim(NEW.postal_code),'') = '') THEN
    RAISE EXCEPTION 'Emailul, telefonul, adresa biroului, orașul și codul poștal ale agenției sunt obligatorii și nu pot fi golite.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_org_required_public_data ON public.organizations;
CREATE TRIGGER t_org_required_public_data BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_required_public_data();

CREATE OR REPLACE FUNCTION public.approve_registration_request(_request_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  _expires := now() + interval '30 days';

  -- Datele de contact din cerere (email, telefon) intră în organizație; cererea nu are adresă sau oraș.
  INSERT INTO public.organizations (name, legal_name, cui, trade_registry_number, slug, status, collaboration_enabled, plan,
                                    subscription_term, subscription_started_at, subscription_expires_at, is_trial, created_by, updated_by,
                                    email, phone)
  VALUES (_r.agency_name, _r.legal_name, _r.cui, _r.trade_registry_number, _slug, 'active', true,
          coalesce(_r.requested_plan,'basic'), coalesce(_r.requested_term,'30d'), now(), _expires, true, _actor, _actor,
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