import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PlatformStats = {
  users: number;
  students: number;
  teachers: number;
  new_users_7d: number;
  groups: number;
  conversations: number;
  messages: number;
  messages_24h: number;
  files: number;
  quizzes: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  role: "student" | "teacher";
  created_at: string;
  is_admin: boolean;
  is_moderator: boolean;
};

/** Server/database decides admin status — never a frontend flag. */
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: fetchIsAdmin,
    staleTime: 60_000,
  });
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) throw error;
  return data as unknown as PlatformStats;
}

export async function fetchAdminUsers(search: string): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc("admin_list_users", {
    _search: search || undefined,
    _limit: 100,
  });
  if (error) throw error;
  return (data ?? []) as unknown as AdminUserRow[];
}

export async function setStaffRole(
  userId: string,
  role: "admin" | "moderator",
  enabled: boolean,
) {
  if (enabled) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) throw error;
  }
  await logAdminAction(enabled ? `grant_${role}` : `revoke_${role}`, userId);
}

export async function logAdminAction(action: string, target?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase
    .from("admin_audit_log")
    .insert({ actor_id: data.user.id, action, target: target ?? null });
}

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  created_at: string;
};

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, action, target, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllowedDomains(): Promise<string[]> {
  const { data, error } = await supabase
    .from("allowed_email_domains")
    .select("domain")
    .order("domain");
  if (error) return [];
  return (data ?? []).map((d) => d.domain);
}

export async function addAllowedDomain(domain: string) {
  const clean = domain.trim().toLowerCase().replace(/^@/, "");
  const { error } = await supabase.from("allowed_email_domains").insert({ domain: clean });
  if (error) throw error;
  await logAdminAction("add_domain", clean);
}

export async function removeAllowedDomain(domain: string) {
  const { error } = await supabase.from("allowed_email_domains").delete().eq("domain", domain);
  if (error) throw error;
  await logAdminAction("remove_domain", domain);
}
