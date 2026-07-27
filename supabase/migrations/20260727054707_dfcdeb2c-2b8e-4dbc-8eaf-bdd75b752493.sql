
-- Storage RLS for chat-attachments (path convention: <user_id>/<conversation_id>/<file>)
CREATE POLICY "chat upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "chat read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "chat delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Restrict helper to authenticated only
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
