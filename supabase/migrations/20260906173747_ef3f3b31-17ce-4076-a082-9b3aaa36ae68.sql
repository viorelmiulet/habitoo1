-- Lead-uri: agentul vede doar ce îi este asignat (sau ce a creat el, dacă nu e asignat nimănui).
DROP POLICY IF EXISTS leads_sel ON public.leads;
CREATE POLICY leads_sel ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND (
        public.is_org_admin()
        OR assigned_to = auth.uid()
        OR (assigned_to IS NULL AND created_by = auth.uid())
      )
    )
  );

-- Istoricul lead-ului urmează vizibilitatea lead-ului.
DROP POLICY IF EXISTS lead_events_sel ON public.lead_events;
CREATE POLICY lead_events_sel ON public.lead_events
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_events.lead_id)
    )
  );

-- Activități.
DROP POLICY IF EXISTS activities_sel ON public.activities;
CREATE POLICY activities_sel ON public.activities
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND (
        public.is_org_admin()
        OR assigned_to = auth.uid()
        OR (assigned_to IS NULL AND created_by = auth.uid())
      )
    )
  );

-- Cereri.
DROP POLICY IF EXISTS requests_sel ON public.requests;
CREATE POLICY requests_sel ON public.requests
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND (
        public.is_org_admin()
        OR assigned_to = auth.uid()
        OR (assigned_to IS NULL AND created_by = auth.uid())
      )
    )
  );

-- Obiective: agentul vede doar obiectivele proprii (user_id) și cele ale agenției fără titular.
DROP POLICY IF EXISTS goals_sel ON public.goals;
CREATE POLICY goals_sel ON public.goals
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND (public.is_org_admin() OR user_id = auth.uid() OR user_id IS NULL)
    )
  );
