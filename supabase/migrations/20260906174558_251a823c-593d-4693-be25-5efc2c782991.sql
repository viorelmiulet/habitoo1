CREATE TABLE public.portal_activation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_activation_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX portal_activation_requests_pending_uniq
  ON public.portal_activation_requests (organization_id, portal)
  WHERE status = 'pending';
CREATE INDEX portal_activation_requests_status_idx
  ON public.portal_activation_requests (status, requested_at DESC);

GRANT SELECT, INSERT ON public.portal_activation_requests TO authenticated;
GRANT ALL ON public.portal_activation_requests TO service_role;

ALTER TABLE public.portal_activation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read own portal requests"
  ON public.portal_activation_requests FOR SELECT TO authenticated
  USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE POLICY "org admins create portal requests"
  ON public.portal_activation_requests FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org()
    AND public.is_org_admin()
    AND status = 'pending'
    AND requested_by = auth.uid()
  );

CREATE TRIGGER portal_activation_requests_touch
  BEFORE UPDATE ON public.portal_activation_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
