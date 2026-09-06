CREATE POLICY "avatars read org" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (public.current_org())::text);

CREATE POLICY "avatars insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (public.current_org())::text AND (storage.foldername(name))[2] = (auth.uid())::text);

CREATE POLICY "avatars update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (public.current_org())::text AND (storage.foldername(name))[2] = (auth.uid())::text);

CREATE POLICY "avatars delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (public.current_org())::text AND (storage.foldername(name))[2] = (auth.uid())::text);