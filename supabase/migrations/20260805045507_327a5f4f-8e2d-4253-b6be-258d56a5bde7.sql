CREATE TABLE public.group_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','voice')),
  topic text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_channels TO authenticated;
GRANT ALL ON public.group_channels TO service_role;

ALTER TABLE public.group_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view channels" ON public.group_channels
  FOR SELECT TO authenticated USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Members create channels" ON public.group_channels
  FOR INSERT TO authenticated WITH CHECK (public.is_group_member(group_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Admins update channels" ON public.group_channels
  FOR UPDATE TO authenticated USING (public.is_group_admin(group_id, auth.uid()))
  WITH CHECK (public.is_group_admin(group_id, auth.uid()));
CREATE POLICY "Admins delete channels" ON public.group_channels
  FOR DELETE TO authenticated USING (public.is_group_admin(group_id, auth.uid()));

CREATE INDEX idx_group_channels_group ON public.group_channels(group_id, position);

CREATE TRIGGER group_channels_updated
  BEFORE UPDATE ON public.group_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.messages ADD COLUMN channel_id uuid REFERENCES public.group_channels(id) ON DELETE CASCADE;
CREATE INDEX idx_messages_channel ON public.messages(channel_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.channel_group_id(_channel_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.group_channels WHERE id = _channel_id;
$$;

REVOKE EXECUTE ON FUNCTION public.channel_group_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_group_id(uuid) TO authenticated, service_role;

CREATE POLICY "Members read channel messages" ON public.messages
  FOR SELECT TO authenticated
  USING (channel_id IS NOT NULL AND public.is_group_member(public.channel_group_id(channel_id), auth.uid()));

CREATE POLICY "Members send channel messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (channel_id IS NOT NULL AND sender_id = auth.uid()
    AND public.is_group_member(public.channel_group_id(channel_id), auth.uid()));

CREATE POLICY "Members update channel messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (channel_id IS NOT NULL AND public.is_group_member(public.channel_group_id(channel_id), auth.uid()))
  WITH CHECK (channel_id IS NOT NULL AND public.is_group_member(public.channel_group_id(channel_id), auth.uid()));

CREATE POLICY "Authors or admins delete channel messages" ON public.messages
  FOR DELETE TO authenticated
  USING (channel_id IS NOT NULL AND (
    sender_id = auth.uid() OR public.is_group_admin(public.channel_group_id(channel_id), auth.uid())
  ));

CREATE POLICY "Members react in channels" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id AND m.channel_id IS NOT NULL
      AND public.is_group_member(public.channel_group_id(m.channel_id), auth.uid())
  ));

CREATE POLICY "Members add channel reactions" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id AND m.channel_id IS NOT NULL
      AND public.is_group_member(public.channel_group_id(m.channel_id), auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.create_default_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.group_channels (group_id, name, type, position, created_by)
  VALUES (NEW.id, 'general', 'text', 0, NEW.created_by),
         (NEW.id, 'General Voice', 'voice', 1, NEW.created_by);
  RETURN NEW;
END; $$;

CREATE TRIGGER study_groups_default_channels
  AFTER INSERT ON public.study_groups
  FOR EACH ROW EXECUTE FUNCTION public.create_default_channels();

INSERT INTO public.group_channels (group_id, name, type, position, created_by)
SELECT g.id, 'general', 'text', 0, g.created_by FROM public.study_groups g
WHERE NOT EXISTS (SELECT 1 FROM public.group_channels c WHERE c.group_id = g.id AND c.type = 'text');

INSERT INTO public.group_channels (group_id, name, type, position, created_by)
SELECT g.id, 'General Voice', 'voice', 1, g.created_by FROM public.study_groups g
WHERE NOT EXISTS (SELECT 1 FROM public.group_channels c WHERE c.group_id = g.id AND c.type = 'voice');

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_channels;