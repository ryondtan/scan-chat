
-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('direct','group')),
  name text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX conversation_members_user_idx ON public.conversation_members(user_id);

-- Security definer helper to avoid recursive RLS on conversation_members
CREATE OR REPLACE FUNCTION public.is_conversation_member(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = _cid AND user_id = _uid);
$$;

-- Conversations policies
CREATE POLICY "members read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id, auth.uid()));
CREATE POLICY "users create conversations" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator updates conversation" ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator deletes conversation" ON public.conversations FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Members policies
CREATE POLICY "members view own memberships" ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "creator or self adds member" ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
  );
CREATE POLICY "self updates membership" ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "self or creator removes member" ON public.conversation_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
  );

-- ============ MESSAGES ADDITIONS ============
ALTER TABLE public.messages
  ADD COLUMN conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_type text,
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_size bigint,
  ADD COLUMN pinned_at timestamptz,
  ADD COLUMN edited_at timestamptz;

ALTER TABLE public.messages ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at DESC);

-- Add member-based policies for messages (keep legacy sender/recipient policies for old rows)
CREATE POLICY "members read conv messages" ON public.messages FOR SELECT TO authenticated
  USING (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members send conv messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND conversation_id IS NOT NULL
    AND public.is_conversation_member(conversation_id, auth.uid())
  );
CREATE POLICY "sender updates own message" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "members pin messages" ON public.messages FOR UPDATE TO authenticated
  USING (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()));

-- ============ REACTIONS ============
CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read reactions" ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.conversation_id IS NOT NULL
      AND public.is_conversation_member(m.conversation_id, auth.uid())
  ));
CREATE POLICY "members add reactions" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.conversation_id IS NOT NULL
      AND public.is_conversation_member(m.conversation_id, auth.uid())
  ));
CREATE POLICY "users remove own reactions" ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============ REALTIME ============
DO $rt$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $rt$;

-- ============ BACKFILL DIRECT CONVERSATIONS FROM FRIENDSHIPS ============
-- For each unordered friendship pair, create one direct conversation and link legacy messages
DO $$
DECLARE
  r record;
  cid uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT LEAST(user_id, friend_id) AS a, GREATEST(user_id, friend_id) AS b
    FROM public.friendships
  LOOP
    -- skip if a direct conversation with these two members already exists
    SELECT c.id INTO cid
    FROM public.conversations c
    WHERE c.type = 'direct'
      AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = r.a)
      AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = r.b)
      AND (SELECT COUNT(*) FROM public.conversation_members m WHERE m.conversation_id = c.id) = 2
    LIMIT 1;

    IF cid IS NULL THEN
      INSERT INTO public.conversations (type, created_by) VALUES ('direct', r.a) RETURNING id INTO cid;
      INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (cid, r.a), (cid, r.b);
    END IF;

    UPDATE public.messages SET conversation_id = cid
    WHERE conversation_id IS NULL
      AND ((sender_id = r.a AND recipient_id = r.b) OR (sender_id = r.b AND recipient_id = r.a));
  END LOOP;
END $$;
