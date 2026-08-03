
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated, service_role;
