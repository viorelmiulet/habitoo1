ALTER TABLE public.ai_credit_costs DROP CONSTRAINT IF EXISTS ai_credit_costs_action_check;
ALTER TABLE public.ai_credit_costs ADD CONSTRAINT ai_credit_costs_action_check CHECK (action IN ('text_fast','text_standard','marketing_image','photo_enhance','photo_video','ai_video_voice','listing_autofill','lead_message_analysis','match_message','owner_report'));
INSERT INTO public.ai_credit_costs(action, credits) VALUES ('owner_report',3) ON CONFLICT (action) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_see_property_reports(_property uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.properties p
    WHERE p.id = _property AND p.organization_id = public.current_org() AND p.deleted_at IS NULL
      AND (p.assigned_to = auth.uid() OR public.is_org_admin()));
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_property_reports(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_see_property_reports(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owner_can_auto_send(_contact uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = _contact
    AND coalesce(btrim(c.email), '') LIKE '%@%' AND c.gdpr_consent AND c.gdpr_withdrawn_at IS NULL);
$$;
REVOKE EXECUTE ON FUNCTION public.owner_can_auto_send(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owner_can_auto_send(uuid) TO authenticated, service_role;

CREATE TABLE public.owner_report_settings (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  auto_send boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.owner_report_settings TO authenticated;
GRANT ALL ON public.owner_report_settings TO service_role;
ALTER TABLE public.owner_report_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_report_settings_select ON public.owner_report_settings FOR SELECT TO authenticated
  USING (public.can_see_property_reports(property_id));

CREATE OR REPLACE FUNCTION public.owner_report_settings_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT owner_contact_id INTO owner FROM public.properties WHERE id = NEW.property_id;
  IF NEW.enabled AND owner IS NULL THEN
    RAISE EXCEPTION 'owner_report_requires_owner';
  END IF;
  IF NEW.auto_send AND NOT (NEW.enabled AND public.owner_can_auto_send(owner)) THEN
    RAISE EXCEPTION 'owner_report_auto_send_requires_consent';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER owner_report_settings_guard BEFORE INSERT OR UPDATE ON public.owner_report_settings
  FOR EACH ROW EXECUTE FUNCTION public.owner_report_settings_guard();

CREATE TABLE public.owner_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  agent_id uuid,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','skipped','failed')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative jsonb,
  is_ai boolean NOT NULL DEFAULT false,
  short_text text,
  pdf_path text,
  auto_send boolean NOT NULL DEFAULT false,
  send_error text,
  sent_at timestamptz,
  sent_by uuid,
  sent_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, week_start)
);
GRANT SELECT ON public.owner_reports TO authenticated;
GRANT ALL ON public.owner_reports TO service_role;
CREATE INDEX owner_reports_property_idx ON public.owner_reports(property_id, week_start DESC);
CREATE INDEX owner_reports_autosend_idx ON public.owner_reports(week_start) WHERE status = 'draft' AND auto_send;
ALTER TABLE public.owner_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_reports_select ON public.owner_reports FOR SELECT TO authenticated
  USING (public.can_see_property_reports(property_id));