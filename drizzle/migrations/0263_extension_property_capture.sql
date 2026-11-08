CREATE TABLE public.property_capture_sources (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  source_url text NOT NULL CHECK (length(source_url) <= 2048),
  normalized_url text NOT NULL CHECK (length(normalized_url) <= 2048),
  site text NOT NULL CHECK (length(site) <= 120),
  captured_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_capture_sources_lookup ON public.property_capture_sources(organization_id, normalized_url);
GRANT SELECT ON public.property_capture_sources TO authenticated;
GRANT ALL ON public.property_capture_sources TO service_role;
ALTER TABLE public.property_capture_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Capture source follows property visibility" ON public.property_capture_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_capture_sources.property_id));
COMMENT ON TABLE public.property_capture_sources IS 'Internal CRM-only provenance of Chrome extension captures; never exposed in feeds, portals, PDFs, agency site or Partner API.';

CREATE TABLE public.extension_idempotency (
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL,
  property_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
GRANT ALL ON public.extension_idempotency TO service_role;
ALTER TABLE public.extension_idempotency ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ro_phone_key(_raw text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v text := regexp_replace(coalesce(_raw, ''), '[^0-9+]', '', 'g');
BEGIN
  IF left(v, 1) = '+' THEN v := substr(v, 2); END IF;
  IF left(v, 2) = '00' THEN v := substr(v, 3); END IF;
  IF left(v, 2) = '40' THEN v := substr(v, 3); ELSIF left(v, 1) = '0' THEN v := substr(v, 2); END IF;
  IF v ~ '^7[0-9]{8}$' OR v ~ '^[23][0-9]{8}$' THEN RETURN '+40' || v; END IF;
  RETURN NULL;
END $$;
CREATE INDEX contacts_org_phone_key_idx ON public.contacts(organization_id, (public.ro_phone_key(phone)));

CREATE OR REPLACE FUNCTION public.extension_create_property(_user uuid, _org uuid, _key text, _hash text, _p jsonb, _owner jsonb, _source jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing record; pid uuid := gen_random_uuid(); cid uuid; phone_key text; site text := left(coalesce(nullif(trim(_source->>'site'), ''), 'site necunoscut'), 120);
  arr text[];
BEGIN
  INSERT INTO extension_idempotency(user_id, idempotency_key, request_hash) VALUES (_user, _key, _hash) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO existing FROM extension_idempotency WHERE user_id = _user AND idempotency_key = _key;
    IF existing.request_hash <> _hash THEN RETURN jsonb_build_object('state', 'conflict'); END IF;
    RETURN jsonb_build_object('state', 'replay', 'property_id', existing.property_id);
  END IF;

  phone_key := ro_phone_key(_owner->>'phone');
  IF phone_key IS NOT NULL THEN
    SELECT id INTO cid FROM contacts WHERE organization_id = _org AND ro_phone_key(phone) = phone_key ORDER BY created_at LIMIT 1;
  END IF;
  IF cid IS NULL AND (phone_key IS NOT NULL OR nullif(trim(_owner->>'name'), '') IS NOT NULL OR nullif(trim(_owner->>'email'), '') IS NOT NULL) THEN
    INSERT INTO contacts(organization_id, first_name, last_name, phone, email, type, source, assigned_to, created_by)
    VALUES (_org, coalesce(nullif(split_part(trim(coalesce(_owner->>'name', '')), ' ', 1), ''), 'Proprietar'),
      coalesce(nullif(trim(substr(trim(coalesce(_owner->>'name', '')), length(split_part(trim(coalesce(_owner->>'name', '')), ' ', 1)) + 1)), ''), ''),
      coalesce(phone_key, nullif(trim(_owner->>'phone'), '')), nullif(trim(_owner->>'email'), ''), 'owner', 'Extensia Chrome', _user, _user)
    RETURNING id INTO cid;
  END IF;

  INSERT INTO properties(id, organization_id, assigned_to, created_by, reference, title, description, status, property_type, transaction_kind,
    for_sale, for_rent, price, currency, sale_price, sale_currency, rent_price, rent_currency, surface, usable_surface, built_surface, land_surface,
    rooms, bathrooms, floor, building_floors, build_year, layout, comfort, heating, finish_state, city, county, county_siruta_code,
    uat_siruta_code, locality_siruta_code, district, address, owner_contact_id,
    additional_spaces, kitchen_features, metering, appliances, building_amenities, street_arrangement, views, misc_features, cooling_systems)
  VALUES (pid, _org, _user, _user, next_property_reference(), coalesce(nullif(trim(_p->>'title'), ''), 'Proprietate importată'), _p->>'description', 'draft',
    coalesce(_p->>'property_type', 'apartment'), coalesce(_p->>'transaction_kind', 'sale')::transaction_kind,
    coalesce((_p->>'for_sale')::boolean, true), coalesce((_p->>'for_rent')::boolean, false), (_p->>'price')::numeric, coalesce(_p->>'currency', 'EUR'),
    (_p->>'sale_price')::numeric, _p->>'sale_currency', (_p->>'rent_price')::numeric, _p->>'rent_currency',
    (_p->>'usable_surface')::numeric, (_p->>'usable_surface')::numeric, (_p->>'built_surface')::numeric, (_p->>'land_surface')::numeric,
    (_p->>'rooms')::integer, (_p->>'bathrooms')::integer, (_p->>'floor')::integer, (_p->>'building_floors')::integer, (_p->>'build_year')::integer,
    _p->>'layout', _p->>'comfort', _p->>'heating', _p->>'finish_state', _p->>'city', _p->>'county', (_p->>'county_siruta_code')::integer,
    (_p->>'uat_siruta_code')::integer, (_p->>'locality_siruta_code')::integer, _p->>'district', _p->>'address', cid,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'additional_spaces', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'kitchen_features', '[]'))),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'metering', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'appliances', '[]'))),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'building_amenities', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'street_arrangement', '[]'))),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'views', '[]'))), ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'misc_features', '[]'))),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(_p->'cooling_systems', '[]'))));

  IF nullif(_source->>'url', '') IS NOT NULL THEN
    INSERT INTO property_capture_sources(property_id, organization_id, source_url, normalized_url, site, captured_at, created_by)
    VALUES (pid, _org, _source->>'url', _source->>'normalized_url', site, (_source->>'captured_at')::timestamptz, _user);
  END IF;

  INSERT INTO activities(organization_id, property_id, contact_id, kind, status, done, title, description, starts_at, assigned_to, created_by)
  VALUES (_org, pid, cid, 'note', 'done', true, 'Importat cu extensia Chrome din ' || site, _source->>'url', now(), _user, _user);

  UPDATE extension_idempotency SET property_id = pid WHERE user_id = _user AND idempotency_key = _key;
  DELETE FROM extension_idempotency WHERE created_at < now() - interval '30 days';
  RETURN jsonb_build_object('state', 'created', 'property_id', pid, 'contact_id', cid);
END $$;
REVOKE ALL ON FUNCTION public.extension_create_property(uuid, uuid, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extension_create_property(uuid, uuid, text, text, jsonb, jsonb, jsonb) TO service_role;