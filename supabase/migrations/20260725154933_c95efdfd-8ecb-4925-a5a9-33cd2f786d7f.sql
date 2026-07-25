
-- Role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('student', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS study_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date date;

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role);
$$;

-- Update handle_new_user to support Google (no username in metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_username TEXT; v_display TEXT; v_role public.app_role;
BEGIN
  v_username := lower(coalesce(
    NEW.raw_user_meta_data->>'username',
    regexp_replace(split_part(coalesce(NEW.email, ''), '@', 1), '[^a-z0-9_]', '', 'g'),
    'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10)
  ));
  IF length(v_username) < 3 THEN
    v_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  END IF;
  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_username := v_username || substr(replace(NEW.id::text, '-', ''), 1, 4);
  END LOOP;
  v_display := coalesce(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_username
  );
  v_role := coalesce((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  INSERT INTO public.profiles (id, username, display_name, avatar_url, email, role)
  VALUES (NEW.id, v_username, v_display, NEW.raw_user_meta_data->>'avatar_url', NEW.email, v_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Ensure trigger exists on auth.users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- HOMEWORK ITEMS
CREATE TABLE IF NOT EXISTS public.homework_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text,
  description text,
  due_date timestamptz,
  priority text NOT NULL DEFAULT 'normal',
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_items TO authenticated;
GRANT ALL ON public.homework_items TO service_role;
ALTER TABLE public.homework_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own homework select" ON public.homework_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own homework insert" ON public.homework_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own homework update" ON public.homework_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own homework delete" ON public.homework_items FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER homework_items_updated BEFORE UPDATE ON public.homework_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PLANNER EVENTS
CREATE TABLE IF NOT EXISTS public.planner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'personal',
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  reminder_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planner_events TO authenticated;
GRANT ALL ON public.planner_events TO service_role;
ALTER TABLE public.planner_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events select" ON public.planner_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own events insert" ON public.planner_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own events update" ON public.planner_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own events delete" ON public.planner_events FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER planner_events_updated BEFORE UPDATE ON public.planner_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS planner_events_user_start ON public.planner_events(user_id, starts_at);

-- SCHOOL ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_announcements TO authenticated;
GRANT ALL ON public.school_announcements TO service_role;
ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read announcements" ON public.school_announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "teachers create announcements" ON public.school_announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher') AND auth.uid() = author_id);
CREATE POLICY "teachers update own announcements" ON public.school_announcements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'teacher') AND auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "teachers delete own announcements" ON public.school_announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'teacher') AND auth.uid() = author_id);
CREATE TRIGGER announcements_updated BEFORE UPDATE ON public.school_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER FILES (metadata; actual files in storage bucket)
CREATE TABLE IF NOT EXISTS public.user_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_files TO authenticated;
GRANT ALL ON public.user_files TO service_role;
ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own files select" ON public.user_files FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own files insert" ON public.user_files FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own files update" ON public.user_files FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own files delete" ON public.user_files FOR DELETE TO authenticated USING (auth.uid() = user_id);
