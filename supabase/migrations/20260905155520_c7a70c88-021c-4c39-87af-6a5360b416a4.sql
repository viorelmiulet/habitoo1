CREATE POLICY "org media read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('property-media','crm-documents') AND (storage.foldername(name))[1] = public.current_org()::text);

CREATE POLICY "org media insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('property-media','crm-documents') AND (storage.foldername(name))[1] = public.current_org()::text);

CREATE POLICY "org media update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('property-media','crm-documents') AND (storage.foldername(name))[1] = public.current_org()::text);

CREATE POLICY "org media delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('property-media','crm-documents') AND (storage.foldername(name))[1] = public.current_org()::text);