-- ENUMS
CREATE TYPE public.app_role AS ENUM ('superadmin','agency_admin','agent');
CREATE TYPE public.org_status AS ENUM ('active','trial','suspended','cancelled');
CREATE TYPE public.property_status AS ENUM ('draft','active','reserved','negotiation','sold','rented','expired','archived');
CREATE TYPE public.transaction_kind AS ENUM ('sale','rent');
CREATE TYPE public.contact_type AS ENUM ('owner','buyer','tenant','investor','agent','partner','developer','company');
CREATE TYPE public.request_kind AS ENUM ('buy','rent','invest');
CREATE TYPE public.lead_stage AS ENUM ('new','contacted','qualified','viewing','offer','negotiation','transaction','won','lost');
CREATE TYPE public.activity_kind AS ENUM ('call','meeting','viewing','task','email','followup','note');

-- SHARED
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  city text,
  phone text,
  email text,
  logo_url text,
  plan text NOT NULL DEFAULT 'trial',
  status public.org_status NOT NULL DEFAULT 'trial',
  max_users integer NOT NULL DEFAULT 10,
  max_properties integer NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  job_title text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('agency_admin','superadmin'));
$$;

-- CONTACTS
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.contact_type NOT NULL DEFAULT 'buyer',
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  whatsapp text,
  email text,
  company text,
  source text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  gdpr_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- PROPERTIES
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference text,
  external_id text,
  title text NOT NULL,
  description text,
  property_type text NOT NULL DEFAULT 'apartment',
  category text,
  transaction_kind public.transaction_kind NOT NULL DEFAULT 'sale',
  status public.property_status NOT NULL DEFAULT 'draft',
  price numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  negotiable boolean NOT NULL DEFAULT false,
  surface numeric(10,2),
  usable_surface numeric(10,2),
  built_surface numeric(10,2),
  land_surface numeric(10,2),
  rooms integer,
  bedrooms integer,
  bathrooms integer,
  floor integer,
  building_floors integer,
  build_year integer,
  layout text,
  furnishing text,
  heating text,
  parking text,
  balcony boolean NOT NULL DEFAULT false,
  features text[] NOT NULL DEFAULT '{}',
  utilities text[] NOT NULL DEFAULT '{}',
  address text,
  city text,
  county text,
  district text,
  street text,
  street_number text,
  lat double precision,
  lng double precision,
  location_precise boolean NOT NULL DEFAULT false,
  owner_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  assigned_to uuid,
  source text,
  commission text,
  vat_included boolean NOT NULL DEFAULT false,
  internal_notes text,
  collaboration boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE TABLE public.property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  is_confidential boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- REQUESTS
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  kind public.request_kind NOT NULL DEFAULT 'buy',
  title text NOT NULL DEFAULT '',
  property_type text,
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  cities text[] NOT NULL DEFAULT '{}',
  areas text[] NOT NULL DEFAULT '{}',
  rooms_min integer,
  rooms_max integer,
  surface_min numeric(10,2),
  floor_preference text,
  features text[] NOT NULL DEFAULT '{}',
  furnished boolean,
  pets_allowed boolean,
  term text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'active',
  source text,
  notes text,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  phone text,
  email text,
  source text,
  stage public.lead_stage NOT NULL DEFAULT 'new',
  score integer NOT NULL DEFAULT 0,
  assigned_to uuid,
  last_interaction_at timestamptz,
  next_followup_at timestamptz,
  stale boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- ACTIVITIES
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.activity_kind NOT NULL DEFAULT 'task',
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- GOALS
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  period date NOT NULL DEFAULT date_trunc('month', now())::date,
  metric text NOT NULL,
  target numeric(14,2) NOT NULL DEFAULT 0,
  progress numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- AUDIT
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  ip text,
  user_agent text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- INDEXES
CREATE INDEX idx_properties_org ON public.properties(organization_id);
CREATE INDEX idx_properties_status ON public.properties(organization_id, status);
CREATE INDEX idx_contacts_org ON public.contacts(organization_id);
CREATE INDEX idx_leads_org ON public.leads(organization_id, stage);
CREATE INDEX idx_requests_org ON public.requests(organization_id);
CREATE INDEX idx_activities_org ON public.activities(organization_id, starts_at);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read_at);

-- TRIGGERS
CREATE TRIGGER t_org BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_contacts BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_properties BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_property_images BEFORE UPDATE ON public.property_images FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_requests BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_leads BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_activities BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_goals BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.organizations, public.profiles, public.user_roles, public.contacts, public.properties,
  public.property_images, public.requests, public.leads, public.activities, public.goals,
  public.notifications, public.audit_logs TO service_role;

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (public.is_superadmin() OR id = public.current_org());
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (id = public.current_org() AND public.is_org_admin()));
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
CREATE POLICY org_delete ON public.organizations FOR DELETE TO authenticated USING (public.is_superadmin());

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (public.is_superadmin() OR id = auth.uid() OR organization_id = public.current_org());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR id = auth.uid() OR (organization_id = public.current_org() AND public.is_org_admin()));
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.is_org_admin());

CREATE POLICY roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_superadmin() OR user_id = auth.uid() OR organization_id = public.current_org());

-- tenant tables
CREATE POLICY contacts_rw ON public.contacts FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY contacts_ins ON public.contacts FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());
CREATE POLICY contacts_upd ON public.contacts FOR UPDATE TO authenticated USING (organization_id = public.current_org());
CREATE POLICY contacts_del ON public.contacts FOR DELETE TO authenticated USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE POLICY properties_sel ON public.properties FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY properties_ins ON public.properties FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());
CREATE POLICY properties_upd ON public.properties FOR UPDATE TO authenticated USING (organization_id = public.current_org());
CREATE POLICY properties_del ON public.properties FOR DELETE TO authenticated USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE POLICY images_sel ON public.property_images FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY images_ins ON public.property_images FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());
CREATE POLICY images_upd ON public.property_images FOR UPDATE TO authenticated USING (organization_id = public.current_org());
CREATE POLICY images_del ON public.property_images FOR DELETE TO authenticated USING (organization_id = public.current_org());

CREATE POLICY requests_sel ON public.requests FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY requests_ins ON public.requests FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());
CREATE POLICY requests_upd ON public.requests FOR UPDATE TO authenticated USING (organization_id = public.current_org());
CREATE POLICY requests_del ON public.requests FOR DELETE TO authenticated USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE POLICY leads_sel ON public.leads FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY leads_ins ON public.leads FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());
CREATE POLICY leads_upd ON public.leads FOR UPDATE TO authenticated USING (organization_id = public.current_org());
CREATE POLICY leads_del ON public.leads FOR DELETE TO authenticated USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE POLICY activities_sel ON public.activities FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY activities_ins ON public.activities FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());
CREATE POLICY activities_upd ON public.activities FOR UPDATE TO authenticated USING (organization_id = public.current_org());
CREATE POLICY activities_del ON public.activities FOR DELETE TO authenticated USING (organization_id = public.current_org());

CREATE POLICY goals_sel ON public.goals FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY goals_ins ON public.goals FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY goals_upd ON public.goals FOR UPDATE TO authenticated USING (organization_id = public.current_org() AND public.is_org_admin());
CREATE POLICY goals_del ON public.goals FOR DELETE TO authenticated USING (organization_id = public.current_org() AND public.is_org_admin());

CREATE POLICY notif_sel ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_upd ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_ins ON public.notifications FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org());

CREATE POLICY audit_sel ON public.audit_logs FOR SELECT TO authenticated USING (public.is_superadmin() OR (organization_id = public.current_org() AND public.is_org_admin()));
CREATE POLICY audit_ins ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org() OR public.is_superadmin());

-- ONBOARDING RPC: creates org + profile + admin role + demo data
CREATE OR REPLACE FUNCTION public.bootstrap_agency(_agency_name text, _full_name text, _phone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _slug text;
  _c1 uuid; _c2 uuid; _p1 uuid; _p2 uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT organization_id INTO _org FROM public.profiles WHERE id = _uid;
  IF _org IS NOT NULL THEN RETURN _org; END IF;

  _slug := lower(regexp_replace(coalesce(nullif(_agency_name,''),'agentie'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(_uid::text,'-',''),1,6);

  INSERT INTO public.organizations (name, slug, created_by, updated_by)
  VALUES (coalesce(nullif(_agency_name,''),'Agenția mea'), _slug, _uid, _uid)
  RETURNING id INTO _org;

  INSERT INTO public.profiles (id, organization_id, full_name, phone, email)
  VALUES (_uid, _org, coalesce(nullif(_full_name,''),'Utilizator'), _phone, (SELECT email FROM auth.users WHERE id = _uid))
  ON CONFLICT (id) DO UPDATE SET organization_id = _org, full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_uid, _org, 'agency_admin') ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.contacts (organization_id, type, first_name, last_name, phone, email, source, assigned_to, created_by, gdpr_consent)
  VALUES (_org,'owner','Andrei','Popescu','0722111222','andrei.popescu@example.ro','Recomandare',_uid,_uid,true) RETURNING id INTO _c1;
  INSERT INTO public.contacts (organization_id, type, first_name, last_name, phone, email, source, assigned_to, created_by, gdpr_consent)
  VALUES (_org,'buyer','Maria','Ionescu','0733444555','maria.ionescu@example.ro','Imobiliare.ro',_uid,_uid,true) RETURNING id INTO _c2;

  INSERT INTO public.properties (organization_id, reference, title, description, property_type, transaction_kind, status, price, surface, rooms, bedrooms, bathrooms, floor, building_floors, city, county, district, address, lat, lng, owner_contact_id, assigned_to, created_by, commission)
  VALUES (_org,'P-1001','Apartament 3 camere, Militari Residence','Apartament luminos, bloc nou, finisaje premium, parcare subterană.','apartment','sale','active',119000,78,3,2,2,4,8,'București','București','Sector 6','Bd. Iuliu Maniu 500',44.4325,26.0125,_c1,_uid,_uid,'2%')
  RETURNING id INTO _p1;
  INSERT INTO public.properties (organization_id, reference, title, description, property_type, transaction_kind, status, price, currency, surface, rooms, city, county, district, assigned_to, created_by, commission)
  VALUES (_org,'P-1002','Garsonieră mobilată, Piața Victoriei','Garsonieră modernă, complet mobilată și utilată, ideală pentru închiriere.','studio','rent','active',600,'EUR',38,1,'București','București','Sector 1',_uid,_uid,'1 chirie')
  RETURNING id INTO _p2;
  INSERT INTO public.properties (organization_id, reference, title, description, property_type, transaction_kind, status, price, surface, rooms, city, county, assigned_to, created_by)
  VALUES (_org,'P-1003','Casă individuală, Corbeanca','Casă pe un nivel, teren 500 mp, zonă liniștită.','house','sale','reserved',245000,140,4,'Corbeanca','Ilfov',_uid,_uid);

  INSERT INTO public.requests (organization_id, contact_id, kind, title, property_type, budget_min, budget_max, cities, areas, rooms_min, rooms_max, surface_min, priority, assigned_to, created_by, source)
  VALUES (_org,_c2,'buy','3 camere, Militari, sub 120.000 EUR','apartment',90000,120000,ARRAY['București'],ARRAY['Militari','Drumul Taberei'],3,3,70,'high',_uid,_uid,'Site agenție');

  INSERT INTO public.leads (organization_id, contact_id, property_id, name, phone, email, source, stage, score, assigned_to, created_by, last_interaction_at, next_followup_at)
  VALUES (_org,_c2,_p1,'Maria Ionescu','0733444555','maria.ionescu@example.ro','Imobiliare.ro','qualified',72,_uid,_uid, now() - interval '1 day', now() + interval '2 days'),
         (_org,NULL,_p2,'Radu Dumitrescu','0744555666','radu.d@example.ro','OLX','new',35,_uid,_uid, now(), now() + interval '1 day');

  INSERT INTO public.activities (organization_id, kind, title, description, starts_at, contact_id, property_id, assigned_to, created_by)
  VALUES (_org,'viewing','Vizionare Militari Residence','Vizionare cu Maria Ionescu', now() + interval '3 hours', _c2, _p1, _uid, _uid),
         (_org,'call','Apel proprietar Andrei Popescu','Confirmare preț și disponibilitate', now() + interval '1 hour', _c1, _p1, _uid, _uid),
         (_org,'followup','Follow-up Radu Dumitrescu',NULL, now() + interval '1 day', NULL, _p2, _uid, _uid);

  INSERT INTO public.goals (organization_id, user_id, metric, target, progress, created_by)
  VALUES (_org,_uid,'leads',50,12,_uid),(_org,_uid,'viewings',20,6,_uid),(_org,_uid,'new_properties',10,3,_uid),(_org,_uid,'transactions',3,1,_uid);

  INSERT INTO public.notifications (organization_id, user_id, type, title, body)
  VALUES (_org,_uid,'match','Potrivire nouă găsită','Apartament 3 camere Militari se potrivește cererii Mariei Ionescu (92%).'),
         (_org,_uid,'lead','Lead nou din OLX','Radu Dumitrescu a solicitat detalii pentru garsoniera din Piața Victoriei.');

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, new_values)
  VALUES (_org,_uid,'agency.created','organizations',_org, jsonb_build_object('name', _agency_name));

  RETURN _org;
END; $$;

GRANT EXECUTE ON FUNCTION public.bootstrap_agency(text,text,text) TO authenticated;