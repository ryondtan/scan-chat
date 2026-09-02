CREATE TYPE public.staff_role AS ENUM ('admin', 'moderator');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_staff_role(_user_id uuid, _role public.staff_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins grant roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admins revoke roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE public.allowed_email_domains (
  domain text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT ON public.allowed_email_domains TO anon;
GRANT SELECT, INSERT, DELETE ON public.allowed_email_domains TO authenticated;
GRANT ALL ON public.allowed_email_domains TO service_role;
ALTER TABLE public.allowed_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read allowed domains" ON public.allowed_email_domains FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins add domains" ON public.allowed_email_domains FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admins remove domains" ON public.allowed_email_domains FOR DELETE TO authenticated USING (public.is_admin());
INSERT INTO public.allowed_email_domains (domain) VALUES ('pluit.ipeka.sch.id') ON CONFLICT DO NOTHING;

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins write audit log" ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.grant_owner_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'ryond_audric@pluit.ipeka.sch.id' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_grant_owner_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_admin();

CREATE TRIGGER on_auth_user_confirmed_grant_owner_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_owner_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE lower(email) = 'ryond_audric@pluit.ipeka.sch.id' AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT json_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'students', (SELECT count(*) FROM public.profiles WHERE role = 'student'),
    'teachers', (SELECT count(*) FROM public.profiles WHERE role = 'teacher'),
    'new_users_7d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'groups', (SELECT count(*) FROM public.study_groups),
    'conversations', (SELECT count(*) FROM public.conversations),
    'messages', (SELECT count(*) FROM public.messages),
    'messages_24h', (SELECT count(*) FROM public.messages WHERE created_at > now() - interval '24 hours'),
    'files', (SELECT count(*) FROM public.user_files),
    'quizzes', (SELECT count(*) FROM public.group_quizzes)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(_search text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE (id uuid, username text, display_name text, role public.app_role, created_at timestamptz, is_admin boolean, is_moderator boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.role, p.created_at,
         public.has_staff_role(p.id, 'admin'),
         public.has_staff_role(p.id, 'moderator')
  FROM public.profiles p
  WHERE _search IS NULL OR _search = ''
     OR p.username ILIKE '%' || _search || '%'
     OR p.display_name ILIKE '%' || _search || '%'
  ORDER BY p.created_at DESC
  LIMIT least(coalesce(_limit, 50), 200);
END;
$$;