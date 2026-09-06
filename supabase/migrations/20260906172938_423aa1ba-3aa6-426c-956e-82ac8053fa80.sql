-- Un agent simplu (fără agency_admin/superadmin) vede DOAR proprietățile asignate lui.
DROP POLICY IF EXISTS properties_sel ON public.properties;
CREATE POLICY properties_sel ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND (public.is_org_admin() OR assigned_to = auth.uid())
    )
  );

-- Imaginile urmează vizibilitatea proprietății.
DROP POLICY IF EXISTS images_sel ON public.property_images;
CREATE POLICY images_sel ON public.property_images
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id = public.current_org()
      AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id = property_images.property_id
      )
    )
  );
