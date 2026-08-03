
-- ============ STUDY GROUPS ============
CREATE TABLE public.study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  subject text,
  join_code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_groups TO authenticated;
GRANT ALL ON public.study_groups TO service_role;

CREATE TABLE public.study_group_members (
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_members TO authenticated;
GRANT ALL ON public.study_group_members TO service_role;

CREATE OR REPLACE FUNCTION public.is_group_member(_gid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.study_group_members WHERE group_id = _gid AND user_id = _uid);
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_gid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.study_group_members
    WHERE group_id = _gid AND user_id = _uid AND role IN ('owner','admin'));
$$;

ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can look up groups" ON public.study_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users create groups" ON public.study_groups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "admins update groups" ON public.study_groups
  FOR UPDATE TO authenticated USING (public.is_group_admin(id, auth.uid()))
  WITH CHECK (public.is_group_admin(id, auth.uid()));
CREATE POLICY "owner deletes group" ON public.study_groups
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read membership" ON public.study_group_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()));
CREATE POLICY "self joins or admin adds" ON public.study_group_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR public.is_group_admin(group_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.study_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
  );
CREATE POLICY "self leaves or admin removes" ON public.study_group_members
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_group_admin(group_id, auth.uid()));
CREATE POLICY "admin updates roles" ON public.study_group_members
  FOR UPDATE TO authenticated USING (public.is_group_admin(group_id, auth.uid()))
  WITH CHECK (public.is_group_admin(group_id, auth.uid()));

-- ============ SHARED NOTES ============
CREATE TABLE public.group_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_notes TO authenticated;
GRANT ALL ON public.group_notes TO service_role;
ALTER TABLE public.group_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read notes" ON public.group_notes FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members add notes" ON public.group_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members edit notes" ON public.group_notes FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()))
  WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "author or admin deletes notes" ON public.group_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_group_admin(group_id, auth.uid()));

-- ============ SHARED FILES ============
CREATE TABLE public.group_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_files TO authenticated;
GRANT ALL ON public.group_files TO service_role;
ALTER TABLE public.group_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read group files" ON public.group_files FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members add group files" ON public.group_files FOR INSERT TO authenticated
  WITH CHECK (uploader_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "uploader or admin deletes group files" ON public.group_files FOR DELETE TO authenticated
  USING (uploader_id = auth.uid() OR public.is_group_admin(group_id, auth.uid()));

-- ============ TASKS ============
CREATE TABLE public.group_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_tasks TO authenticated;
GRANT ALL ON public.group_tasks TO service_role;
ALTER TABLE public.group_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read tasks" ON public.group_tasks FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members create tasks" ON public.group_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members update tasks" ON public.group_tasks FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()))
  WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "creator or admin deletes tasks" ON public.group_tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_group_admin(group_id, auth.uid()));

-- ============ SHARED PLANNER ============
CREATE TABLE public.group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_events TO authenticated;
GRANT ALL ON public.group_events TO service_role;
ALTER TABLE public.group_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read events" ON public.group_events FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members create events" ON public.group_events FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members update events" ON public.group_events FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()))
  WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "creator or admin deletes events" ON public.group_events FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_group_admin(group_id, auth.uid()));

-- ============ SHARED FLASHCARDS ============
CREATE TABLE public.group_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_decks TO authenticated;
GRANT ALL ON public.group_decks TO service_role;
ALTER TABLE public.group_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read decks" ON public.group_decks FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members create decks" ON public.group_decks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members update decks" ON public.group_decks FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()))
  WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "creator or admin deletes decks" ON public.group_decks FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_group_admin(group_id, auth.uid()));

CREATE TABLE public.group_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.group_decks(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_cards TO authenticated;
GRANT ALL ON public.group_cards TO service_role;
ALTER TABLE public.group_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read cards" ON public.group_cards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_decks d WHERE d.id = deck_id AND public.is_group_member(d.group_id, auth.uid())));
CREATE POLICY "members write cards" ON public.group_cards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.group_decks d WHERE d.id = deck_id AND public.is_group_member(d.group_id, auth.uid())));
CREATE POLICY "members update cards" ON public.group_cards FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_decks d WHERE d.id = deck_id AND public.is_group_member(d.group_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.group_decks d WHERE d.id = deck_id AND public.is_group_member(d.group_id, auth.uid())));
CREATE POLICY "members delete cards" ON public.group_cards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_decks d WHERE d.id = deck_id AND public.is_group_member(d.group_id, auth.uid())));

-- ============ SHARED QUIZZES ============
CREATE TABLE public.group_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_quizzes TO authenticated;
GRANT ALL ON public.group_quizzes TO service_role;
ALTER TABLE public.group_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read quizzes" ON public.group_quizzes FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members create quizzes" ON public.group_quizzes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members update quizzes" ON public.group_quizzes FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()))
  WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "creator or admin deletes quizzes" ON public.group_quizzes FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_group_admin(group_id, auth.uid()));

CREATE TABLE public.group_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.group_quizzes(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_quiz_attempts TO authenticated;
GRANT ALL ON public.group_quiz_attempts TO service_role;
ALTER TABLE public.group_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read attempts" ON public.group_quiz_attempts FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "users record own attempts" ON public.group_quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));

-- ============ SHARED AI ============
CREATE TABLE public.group_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.group_ai_messages TO authenticated;
GRANT ALL ON public.group_ai_messages TO service_role;
ALTER TABLE public.group_ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read group ai" ON public.group_ai_messages FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members write group ai" ON public.group_ai_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "admins clear group ai" ON public.group_ai_messages FOR DELETE TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()));

-- ============ TRIGGERS ============
CREATE TRIGGER update_study_groups_updated_at BEFORE UPDATE ON public.study_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_notes_updated_at BEFORE UPDATE ON public.group_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_tasks_updated_at BEFORE UPDATE ON public.group_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_events_updated_at BEFORE UPDATE ON public.group_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_decks_updated_at BEFORE UPDATE ON public.group_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_quizzes_updated_at BEFORE UPDATE ON public.group_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sgm_user ON public.study_group_members(user_id);
CREATE INDEX idx_group_notes_group ON public.group_notes(group_id);
CREATE INDEX idx_group_tasks_group ON public.group_tasks(group_id);
CREATE INDEX idx_group_events_group ON public.group_events(group_id);
CREATE INDEX idx_group_files_group ON public.group_files(group_id);
CREATE INDEX idx_group_ai_group ON public.group_ai_messages(group_id, created_at);
