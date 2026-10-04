CREATE POLICY "Superadmins can read blog media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'blog-media' AND public.is_superadmin());

CREATE POLICY "Superadmins can upload blog media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'blog-media' AND public.is_superadmin());

CREATE POLICY "Superadmins can update blog media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'blog-media' AND public.is_superadmin())
WITH CHECK (bucket_id = 'blog-media' AND public.is_superadmin());

CREATE POLICY "Superadmins can delete blog media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'blog-media' AND public.is_superadmin());