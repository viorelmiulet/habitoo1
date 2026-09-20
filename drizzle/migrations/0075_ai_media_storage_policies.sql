CREATE POLICY "Agentia citeste media AI proprie"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ai-media' AND (storage.foldername(name))[1] = public.current_org()::text);

CREATE POLICY "Agentia incarca media AI proprie"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ai-media' AND (storage.foldername(name))[1] = public.current_org()::text);

CREATE POLICY "Agentia sterge media AI proprie"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ai-media' AND (storage.foldername(name))[1] = public.current_org()::text);