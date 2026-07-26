
CREATE TABLE public.user_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.user_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_folders TO authenticated;
GRANT ALL ON public.user_folders TO service_role;
ALTER TABLE public.user_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folders select" ON public.user_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own folders insert" ON public.user_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own folders update" ON public.user_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own folders delete" ON public.user_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER user_folders_updated BEFORE UPDATE ON public.user_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX ON public.user_folders(user_id, parent_id);

ALTER TABLE public.user_files
  ADD COLUMN folder_id uuid REFERENCES public.user_folders(id) ON DELETE SET NULL,
  ADD COLUMN is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN last_accessed_at timestamptz;
CREATE INDEX ON public.user_files(user_id, folder_id);
CREATE INDEX ON public.user_files(user_id, is_favorite);
CREATE INDEX ON public.user_files(user_id, last_accessed_at DESC);
