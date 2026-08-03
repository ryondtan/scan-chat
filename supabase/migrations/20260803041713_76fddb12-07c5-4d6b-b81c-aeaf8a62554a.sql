
CREATE POLICY "group members read group files storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'group-files' AND public.is_group_member(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "group members upload group files storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'group-files' AND public.is_group_member(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "group members delete group files storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'group-files' AND public.is_group_member(((storage.foldername(name))[1])::uuid, auth.uid()));
