ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS material_accent_color text NOT NULL DEFAULT '#C9A227',
  ADD COLUMN IF NOT EXISTS material_phone text,
  ADD COLUMN IF NOT EXISTS material_email text,
  ADD COLUMN IF NOT EXISTS material_website text,
  ADD COLUMN IF NOT EXISTS material_address text,
  ADD COLUMN IF NOT EXISTS material_show_habitoo boolean NOT NULL DEFAULT true;

CREATE POLICY "agency_logos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agency-logos'
    AND (public.is_superadmin() OR (storage.foldername(name))[1] = public.current_org()::text)
  );

CREATE POLICY "agency_logos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agency-logos'
    AND public.is_org_admin()
    AND (public.is_superadmin() OR (storage.foldername(name))[1] = public.current_org()::text)
  );

CREATE POLICY "agency_logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'agency-logos'
    AND public.is_org_admin()
    AND (public.is_superadmin() OR (storage.foldername(name))[1] = public.current_org()::text)
  );

CREATE POLICY "agency_logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agency-logos'
    AND public.is_org_admin()
    AND (public.is_superadmin() OR (storage.foldername(name))[1] = public.current_org()::text)
  );