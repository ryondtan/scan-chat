REVOKE ALL ON FUNCTION public.admin_platform_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_staff_role(uuid, public.staff_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_owner_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_role(uuid, public.staff_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;