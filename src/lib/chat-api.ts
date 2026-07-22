import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

export async function getMyProfile(): Promise<Profile> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user!.id;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (error) throw error;
  return data as Profile;
}

export async function getFriends(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("friend:profiles!friendships_friend_id_fkey(id, username, display_name, avatar_url)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { friend: Profile }[]).map((r) => r.friend).filter(Boolean);
}

export async function addFriendByUsername(username: string): Promise<Profile> {
  const uname = username.trim().toLowerCase();
  const { data: userRes } = await supabase.auth.getUser();
  const me = userRes.user!.id;
  const { data: prof, error: pErr } = await supabase
    .from("profiles").select("*").eq("username", uname).maybeSingle();
  if (pErr) throw pErr;
  if (!prof) throw new Error("User not found");
  if (prof.id === me) throw new Error("That's you!");
  // Create both directions
  const { error: e1 } = await supabase.from("friendships")
    .upsert({ user_id: me, friend_id: prof.id }, { onConflict: "user_id,friend_id" });
  if (e1) throw e1;
  await supabase.from("friendships")
    .upsert({ user_id: prof.id, friend_id: me }, { onConflict: "user_id,friend_id" });
  return prof as Profile;
}

export async function getMessages(friendId: string): Promise<Message[]> {
  const { data: userRes } = await supabase.auth.getUser();
  const me = userRes.user!.id;
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${me},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${me})`)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(friendId: string, content: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const me = userRes.user!.id;
  const { error } = await supabase.from("messages")
    .insert({ sender_id: me, recipient_id: friendId, content });
  if (error) throw error;
}

export async function getFriendProfile(friendId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", friendId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export const QR_PREFIX = "pingr:user:";
