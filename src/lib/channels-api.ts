import { supabase } from "@/integrations/supabase/client";
import type { Message, Profile, Reaction } from "@/lib/chat-api";

export type ChannelType = "text" | "voice";

export type Channel = {
  id: string;
  group_id: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  created_by: string;
  created_at: string;
};

async function me() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function listChannels(groupId: string): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("group_channels")
    .select("*")
    .eq("group_id", groupId)
    .order("type", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Channel[];
}

export async function createChannel(groupId: string, name: string, type: ChannelType) {
  const uid = await me();
  const clean = name.trim().replace(/\s+/g, type === "text" ? "-" : " ").slice(0, 40);
  if (!clean) throw new Error("Channel name required");
  const { data, error } = await supabase
    .from("group_channels")
    .insert({ group_id: groupId, name: clean, type, created_by: uid, position: 99 })
    .select()
    .single();
  if (error) throw error;
  return data as Channel;
}

export async function renameChannel(channelId: string, name: string) {
  const { error } = await supabase.from("group_channels").update({ name: name.trim() }).eq("id", channelId);
  if (error) throw error;
}

export async function deleteChannel(channelId: string) {
  const { error } = await supabase.from("group_channels").delete().eq("id", channelId);
  if (error) throw error;
}

export async function getChannelMessages(channelId: string, limit = 200): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Message[]).reverse();
  if (rows.length === 0) return rows;

  // Resolve replied-to messages separately (avoids self-referencing embed issues)
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean) as string[])];
  if (replyIds.length) {
    const { data: parents } = await supabase
      .from("messages")
      .select("id, content, sender_id, attachment_name, attachment_type")
      .in("id", replyIds);
    const byId = new Map((parents ?? []).map((p) => [p.id, p]));
    rows.forEach((r) => {
      if (r.reply_to_id) {
        const p = byId.get(r.reply_to_id);
        if (p) (r as unknown as { reply_to: unknown }).reply_to = p;
      }
    });
  }

  const { data: reacts } = await supabase
    .from("message_reactions")
    .select("*")
    .in("message_id", rows.map((r) => r.id));
  const byMsg = new Map<string, Reaction[]>();
  (reacts ?? []).forEach((r) => {
    const arr = byMsg.get(r.message_id) ?? [];
    arr.push(r as Reaction);
    byMsg.set(r.message_id, arr);
  });
  rows.forEach((r) => {
    r.reactions = byMsg.get(r.id) ?? [];
  });
  return rows;
}

export async function searchChannelMessages(groupId: string, query: string): Promise<Message[]> {
  const channels = await listChannels(groupId);
  const ids = channels.filter((c) => c.type === "text").map((c) => c.id);
  if (ids.length === 0 || !query.trim()) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .in("channel_id", ids)
    .ilike("content", `%${query.trim()}%`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as Message[];
}

export async function sendChannelMessage(
  channelId: string,
  msg: { content?: string | null; reply_to_id?: string | null; attachment?: { url: string; type: string; name: string; size: number } | null },
) {
  const uid = await me();
  const content = msg.content?.trim() || null;
  if (!content && !msg.attachment) throw new Error("Empty message");
  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      sender_id: uid,
      content,
      reply_to_id: msg.reply_to_id ?? null,
      attachment_url: msg.attachment?.url ?? null,
      attachment_type: msg.attachment?.type ?? null,
      attachment_name: msg.attachment?.name ?? null,
      attachment_size: msg.attachment?.size ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Message;
}

export async function uploadChannelAttachment(channelId: string, file: File) {
  const uid = await me();
  const key = `${uid}/${channelId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(key, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return { url: key, type: file.type || "application/octet-stream", name: file.name, size: file.size };
}

export async function getProfilesByIds(ids: string[]): Promise<Record<string, Profile>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  const map: Record<string, Profile> = {};
  (data ?? []).forEach((p) => {
    map[p.id] = p as Profile;
  });
  return map;
}
