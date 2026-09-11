-- Mail attachments are private: superadmin read only, writes stay service-role.
CREATE POLICY "Superadmins read mail attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mail-attachments' AND public.is_superadmin());