CREATE TABLE public.vumsi_category_mappings (
  habitoo_kind text NOT NULL,
  transaction text NOT NULL CHECK (transaction IN ('sale','rent')),
  category_id integer NOT NULL,
  category_name text,
  confirmed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (habitoo_kind, transaction)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vumsi_category_mappings TO authenticated;
GRANT ALL ON public.vumsi_category_mappings TO service_role;
ALTER TABLE public.vumsi_category_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin manages Vumsi category mappings" ON public.vumsi_category_mappings
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TABLE public.vumsi_type_mappings (
  transaction text PRIMARY KEY CHECK (transaction IN ('sale','rent')),
  type_value integer NOT NULL,
  type_label text,
  confirmed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vumsi_type_mappings TO authenticated;
GRANT ALL ON public.vumsi_type_mappings TO service_role;
ALTER TABLE public.vumsi_type_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin manages Vumsi type mappings" ON public.vumsi_type_mappings
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TABLE public.vumsi_city_cache (
  locality_key text PRIMARY KEY,
  city_id integer NOT NULL,
  city_name text,
  source text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vumsi_city_cache TO authenticated;
GRANT ALL ON public.vumsi_city_cache TO service_role;
ALTER TABLE public.vumsi_city_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads Vumsi city cache" ON public.vumsi_city_cache
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.vumsi_accounts (
  kind text NOT NULL CHECK (kind IN ('user','company')),
  external_id text NOT NULL,
  organization_id uuid NOT NULL,
  vumsi_uuid uuid,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, external_id)
);
GRANT SELECT ON public.vumsi_accounts TO authenticated;
GRANT ALL ON public.vumsi_accounts TO service_role;
ALTER TABLE public.vumsi_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads Vumsi accounts" ON public.vumsi_accounts
  FOR SELECT TO authenticated USING (public.is_superadmin());