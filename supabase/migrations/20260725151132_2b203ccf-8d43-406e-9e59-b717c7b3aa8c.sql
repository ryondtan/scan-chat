
CREATE TABLE public.tutor_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.tutor_messages TO authenticated;
GRANT ALL ON public.tutor_messages TO service_role;
ALTER TABLE public.tutor_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own tutor messages" ON public.tutor_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tutor messages" ON public.tutor_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own tutor messages" ON public.tutor_messages
  FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX tutor_messages_user_created_idx ON public.tutor_messages(user_id, created_at);
