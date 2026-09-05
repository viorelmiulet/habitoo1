-- 1. Activities: status + duration
DO $$ BEGIN
  CREATE TYPE public.activity_status AS ENUM ('planned','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS status public.activity_status NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30;

UPDATE public.activities SET status = 'done' WHERE done = true AND status = 'planned';

-- 2. Leads: value, lost reason, campaign
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS campaign text;

-- 3. Lead stage history
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage public.lead_stage,
  to_stage public.lead_stage NOT NULL,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_events_sel ON public.lead_events FOR SELECT TO authenticated
  USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY lead_events_ins ON public.lead_events FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org());
CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON public.lead_events(lead_id, created_at DESC);
CREATE TRIGGER t_lead_events BEFORE UPDATE ON public.lead_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Properties: tags, publish state, activity marker
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'unpublished',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- 5. Per-user favorites
CREATE TABLE IF NOT EXISTS public.property_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.property_favorites TO authenticated;
GRANT ALL ON public.property_favorites TO service_role;
ALTER TABLE public.property_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY fav_sel ON public.property_favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY fav_ins ON public.property_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org());
CREATE POLICY fav_del ON public.property_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 6. Property images: publish selection + metadata
ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS include_in_publish boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alt text,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 7. Documents
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_sel ON public.documents FOR SELECT TO authenticated
  USING (public.is_superadmin() OR organization_id = public.current_org());
CREATE POLICY documents_ins ON public.documents FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org());
CREATE POLICY documents_upd ON public.documents FOR UPDATE TO authenticated
  USING (organization_id = public.current_org());
CREATE POLICY documents_del ON public.documents FOR DELETE TO authenticated
  USING (organization_id = public.current_org());
CREATE INDEX IF NOT EXISTS documents_entity_idx ON public.documents(entity_type, entity_id);
CREATE TRIGGER t_documents BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. Saved views (per user, per list)
CREATE TABLE IF NOT EXISTS public.saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  module text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_views TO authenticated;
GRANT ALL ON public.saved_views TO service_role;
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY views_sel ON public.saved_views FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY views_ins ON public.saved_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org());
CREATE POLICY views_upd ON public.saved_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY views_del ON public.saved_views FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS saved_views_user_idx ON public.saved_views(user_id, module);
CREATE TRIGGER t_saved_views BEFORE UPDATE ON public.saved_views
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9. Requests: extra preferences
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS wants_parking boolean,
  ADD COLUMN IF NOT EXISTS wants_balcony boolean;

-- 10. Helpful indexes for filtering/sorting
CREATE INDEX IF NOT EXISTS properties_org_status_idx ON public.properties(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_org_stage_idx ON public.leads(organization_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS activities_org_start_idx ON public.activities(organization_id, starts_at);
CREATE INDEX IF NOT EXISTS contacts_org_created_idx ON public.contacts(organization_id, created_at DESC);