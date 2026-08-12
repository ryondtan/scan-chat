import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type Message = {
  id: string;
  conversation_id: string | null;
  sender_id: string;
  recipient_id: string | null;
  content: string | null;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
  pinned_at: string | null;
  reply_to_id: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reactions?: Reaction[];
  reply_to?: Pick<Message, "id" | "content" | "sender_id" | "attachment_name" | "attachment_type"> | null;
  sender?: Profile | null;
};

export type Conversation = {
  id: string;
  type: "direct" | "group";
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ConversationSummary = Conversation & {
  members: Profile[];
  other?: Profile | null;
  last_message: Message | null;
  unread: number;
  last_read_at: string;
};

export const QR_PREFIX = "pingr:user:";

async function me() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

/* ============ PROFILE / FRIENDS (kept) ============ */

export async function getMyProfile(): Promise<Profile> {
  const uid = await me();
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

export async function getFriendProfile(friendId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", friendId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export type FriendRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
  sender?: Profile;
  recipient?: Profile;
};

export async function sendFriendRequest(username: string): Promise<Profile> {
  const uname = username.trim().toLowerCase();
  const uid = await me();
  const { data: prof, error: pErr } = await supabase
    .from("profiles").select("*").eq("username", uname).maybeSingle();
  if (pErr) throw pErr;
  if (!prof) throw new Error("User not found");
  if (prof.id === uid) throw new Error("That's you!");
  const { data: existing } = await supabase
    .from("friendships").select("id").eq("user_id", uid).eq("friend_id", prof.id).maybeSingle();
  if (existing) throw new Error(`You're already friends with @${prof.username}`);
  const { data: incoming } = await supabase
    .from("friend_requests").select("*")
    .eq("sender_id", prof.id).eq("recipient_id", uid).eq("status", "pending").maybeSingle();
  if (incoming) {
    const { error: uErr } = await supabase.from("friend_requests")
      .update({ status: "accepted" }).eq("id", incoming.id);
    if (uErr) throw uErr;
    return prof as Profile;
  }
  const { error } = await supabase.from("friend_requests")
    .upsert({ sender_id: uid, recipient_id: prof.id, status: "pending" }, { onConflict: "sender_id,recipient_id" });
  if (error) throw error;
  return prof as Profile;
}

export async function getIncomingRequests(): Promise<FriendRequest[]> {
  const uid = await me();
  const { data, error } = await supabase
    .from("friend_requests")
    .select("*, sender:profiles!friend_requests_sender_id_fkey(id, username, display_name, avatar_url)")
    .eq("recipient_id", uid).eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FriendRequest[];
}
export async function getOutgoingRequests(): Promise<FriendRequest[]> {
  const uid = await me();
  const { data, error } = await supabase
    .from("friend_requests")
    .select("*, recipient:profiles!friend_requests_recipient_id_fkey(id, username, display_name, avatar_url)")
    .eq("sender_id", uid).eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FriendRequest[];
}
export async function acceptFriendRequest(id: string) {
  const { error } = await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", id);
  if (error) throw error;
}
export async function declineFriendRequest(id: string) {
  const { error } = await supabase.from("friend_requests").update({ status: "declined" }).eq("id", id);
  if (error) throw error;
}
export async function cancelFriendRequest(id: string) {
  const { error } = await supabase.from("friend_requests").delete().eq("id", id);
  if (error) throw error;
}

/* ============ CONVERSATIONS ============ */

export async function listConversations(): Promise<ConversationSummary[]> {
  const uid = await me();
  const { data: memberships, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, conversation:conversations!inner(id, type, name, created_by, created_at, updated_at)")
    .eq("user_id", uid);
  if (error) throw error;
  const rows = (memberships ?? []) as unknown as {
    conversation_id: string;
    last_read_at: string;
    conversation: Conversation;
  }[];
  if (rows.length === 0) return [];
  const cids = rows.map((r) => r.conversation_id);

  const { data: rawMembers } = await supabase
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", cids);
  const memberRows = (rawMembers ?? []) as { conversation_id: string; user_id: string }[];
  const uids = Array.from(new Set(memberRows.map((r) => r.user_id)));
  const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", uids);
  const pmap = new Map<string, Profile>();
  (profs ?? []).forEach((p) => pmap.set(p.id, p as Profile));
  const membersByConv = new Map<string, Profile[]>();
  memberRows.forEach((m) => {
    const p = pmap.get(m.user_id);
    if (!p) return;
    const arr = membersByConv.get(m.conversation_id) ?? [];
    arr.push(p);
    membersByConv.set(m.conversation_id, arr);
  });

  // Last message per conv
  const { data: msgs } = await supabase
    .from("messages")
    .select("*")
    .in("conversation_id", cids)
    .order("created_at", { ascending: false })
    .limit(500);
  const lastByConv = new Map<string, Message>();
  const unreadByConv = new Map<string, number>();
  const lastReadByConv = new Map(rows.map((r) => [r.conversation_id, r.last_read_at]));
  (msgs ?? []).forEach((m) => {
    const mm = m as Message;
    if (!mm.conversation_id) return;
    if (!lastByConv.has(mm.conversation_id)) lastByConv.set(mm.conversation_id, mm);
    const lr = lastReadByConv.get(mm.conversation_id);
    if (mm.sender_id !== uid && lr && mm.created_at > lr) {
      unreadByConv.set(mm.conversation_id, (unreadByConv.get(mm.conversation_id) ?? 0) + 1);
    }
  });

  const summaries: ConversationSummary[] = rows.map((r) => {
    const members = membersByConv.get(r.conversation_id) ?? [];
    const other = r.conversation.type === "direct" ? members.find((p) => p.id !== uid) ?? null : null;
    return {
      ...r.conversation,
      members,
      other,
      last_message: lastByConv.get(r.conversation_id) ?? null,
      unread: unreadByConv.get(r.conversation_id) ?? 0,
      last_read_at: r.last_read_at,
    };
  });
  // Sort by last activity
  summaries.sort((a, b) => {
    const at = a.last_message?.created_at ?? a.created_at;
    const bt = b.last_message?.created_at ?? b.created_at;
    return bt.localeCompare(at);
  });
  return summaries;
}

export async function getConversation(id: string): Promise<ConversationSummary | null> {
  const uid = await me();
  const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  if (!conv) return null;
  const { data: mems } = await supabase.from("conversation_members").select("user_id, last_read_at").eq("conversation_id", id);
  const memRows = (mems ?? []) as { user_id: string; last_read_at: string }[];
  const uids = memRows.map((m) => m.user_id);
  const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", uids);
  const members = (profs ?? []) as Profile[];
  const other = conv.type === "direct" ? members.find((p) => p.id !== uid) ?? null : null;
  const myMem = memRows.find((m) => m.user_id === uid);
  return {
    ...(conv as Conversation),
    members,
    other,
    last_message: null,
    unread: 0,
    last_read_at: myMem?.last_read_at ?? new Date(0).toISOString(),
  };
}

export async function ensureDirectConversation(otherId: string): Promise<string> {
  const uid = await me();
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id, conversation:conversations!inner(type)")
    .eq("user_id", uid);
  const cids = ((mine ?? []) as unknown as { conversation_id: string; conversation: { type: string } }[])
    .filter((r) => r.conversation.type === "direct")
    .map((r) => r.conversation_id);
  if (cids.length) {
    const { data: others } = await supabase
      .from("conversation_members").select("conversation_id, user_id").in("conversation_id", cids);
    const byConv = new Map<string, string[]>();
    (others ?? []).forEach((r) => {
      const arr = byConv.get(r.conversation_id) ?? [];
      arr.push(r.user_id);
      byConv.set(r.conversation_id, arr);
    });
    for (const [cid, users] of byConv) {
      if (users.length === 2 && users.includes(otherId) && users.includes(uid)) return cid;
    }
  }
  const { data: conv, error } = await supabase.from("conversations")
    .insert({ type: "direct", created_by: uid }).select().single();
  if (error) throw error;
  const { error: mErr } = await supabase.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: uid },
    { conversation_id: conv.id, user_id: otherId },
  ]);
  if (mErr) throw mErr;
  return conv.id;
}

export async function createGroupConversation(name: string, memberIds: string[]): Promise<string> {
  const uid = await me();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Group name required");
  if (memberIds.length === 0) throw new Error("Add at least one member");
  const { data: conv, error } = await supabase.from("conversations")
    .insert({ type: "group", name: trimmed, created_by: uid }).select().single();
  if (error) throw error;
  const all = Array.from(new Set([uid, ...memberIds]));
  const { error: mErr } = await supabase.from("conversation_members").insert(
    all.map((u) => ({ conversation_id: conv.id, user_id: u, role: u === uid ? "admin" : "member" })),
  );
  if (mErr) throw mErr;
  return conv.id;
}

export async function renameGroup(conversationId: string, name: string) {
  const { error } = await supabase.from("conversations").update({ name: name.trim() }).eq("id", conversationId);
  if (error) throw error;
}

export async function leaveConversation(conversationId: string) {
  const uid = await me();
  const { error } = await supabase.from("conversation_members")
    .delete().eq("conversation_id", conversationId).eq("user_id", uid);
  if (error) throw error;
}

export async function deleteConversation(conversationId: string) {
  const { error } = await supabase.from("conversations").delete().eq("id", conversationId);
  if (error) throw error;
}

/* ============ MESSAGES ============ */

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Message[];
  if (rows.length === 0) return rows;
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

  const { data: reacts } = await supabase.from("message_reactions")
    .select("*").in("message_id", rows.map((r) => r.id));
  const byMsg = new Map<string, Reaction[]>();
  (reacts ?? []).forEach((r) => {
    const arr = byMsg.get(r.message_id) ?? [];
    arr.push(r as Reaction);
    byMsg.set(r.message_id, arr);
  });
  rows.forEach((r) => { r.reactions = byMsg.get(r.id) ?? []; });
  return rows;
}

export type OutgoingMessage = {
  content?: string | null;
  reply_to_id?: string | null;
  attachment?: {
    url: string;
    type: string;
    name: string;
    size: number;
  } | null;
};

export async function sendMessage(conversationId: string, msg: OutgoingMessage) {
  const uid = await me();
  const content = msg.content?.trim() || null;
  if (!content && !msg.attachment) throw new Error("Empty message");
  const { data, error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: uid,
    content,
    reply_to_id: msg.reply_to_id ?? null,
    attachment_url: msg.attachment?.url ?? null,
    attachment_type: msg.attachment?.type ?? null,
    attachment_name: msg.attachment?.name ?? null,
    attachment_size: msg.attachment?.size ?? null,
  }).select().single();
  if (error) throw error;
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  return data as Message;
}

export async function editMessage(id: string, content: string) {
  const { error } = await supabase.from("messages")
    .update({ content, edited_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function deleteMessage(id: string) {
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw error;
}

export async function togglePin(id: string, pinned: boolean) {
  const { error } = await supabase.from("messages")
    .update({ pinned_at: pinned ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function forwardMessage(sourceMessage: Message, targetConversationId: string) {
  return sendMessage(targetConversationId, {
    content: sourceMessage.content ?? undefined,
    attachment: sourceMessage.attachment_url
      ? {
          url: sourceMessage.attachment_url,
          type: sourceMessage.attachment_type ?? "application/octet-stream",
          name: sourceMessage.attachment_name ?? "attachment",
          size: sourceMessage.attachment_size ?? 0,
        }
      : null,
  });
}

export async function markConversationRead(conversationId: string) {
  const uid = await me();
  await supabase.from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId).eq("user_id", uid);
}

/* ============ REACTIONS ============ */

export async function addReaction(messageId: string, emoji: string) {
  const uid = await me();
  const { error } = await supabase.from("message_reactions")
    .upsert({ message_id: messageId, user_id: uid, emoji }, { onConflict: "message_id,user_id,emoji" });
  if (error) throw error;
}

export async function removeReaction(messageId: string, emoji: string) {
  const uid = await me();
  const { error } = await supabase.from("message_reactions")
    .delete().eq("message_id", messageId).eq("user_id", uid).eq("emoji", emoji);
  if (error) throw error;
}

/* ============ ATTACHMENTS ============ */

const BUCKET = "chat-attachments";

export async function uploadAttachment(conversationId: string, file: File) {
  const uid = await me();
  const key = `${uid}/${conversationId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return { url: key, type: file.type || "application/octet-stream", name: file.name, size: file.size };
}

export async function attachmentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/* ============ LEGACY (kept for back-compat) ============ */

export async function deleteChat(friendId: string) {
  // Legacy: delete direct conversation with friend
  const cid = await ensureDirectConversation(friendId);
  await deleteConversation(cid);
}
