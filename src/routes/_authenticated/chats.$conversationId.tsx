import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversation, getMessages, sendMessage, deleteConversation, leaveConversation,
  addReaction, removeReaction, togglePin, deleteMessage, forwardMessage,
  uploadAttachment, attachmentSignedUrl, markConversationRead, listConversations,
  type Message, type Reaction, type ConversationSummary,
} from "@/lib/chat-api";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, GroupAvatar } from "@/components/chat/avatar";
import {
  ArrowLeft, Send, Trash2, Paperclip, Search, X, Pin, Image as ImageIcon,
  Reply as ReplyIcon, Forward, Users, MoreVertical, Download, LogOut, Mic, Square,
} from "lucide-react";
import { toast } from "sonner";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export const Route = createFileRoute("/_authenticated/chats/$conversationId")({
  ssr: false,
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = useParams({ from: "/_authenticated/chats/$conversationId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [forwardFor, setForwardFor] = useState<Message | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingIds, setTypingIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingSentAt = useRef(0);

  const { data: conv } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getConversation(conversationId),
  });

  // Load current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // Load messages
  useEffect(() => {
    let cancel = false;
    getMessages(conversationId).then((m) => { if (!cancel) setMessages(m); });
    return () => { cancel = true; };
  }, [conversationId]);

  // Realtime: messages + reactions + presence + typing
  useEffect(() => {
    if (!me) return;
    const msgCh = supabase.channel(`conv-${conversationId}-msgs`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const m = payload.new as Message;
          // Fetch reply metadata if any
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, reactions: [] }]);
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, ...m, reactions: x.reactions } : x));
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.old as { id: string };
          setMessages((prev) => prev.filter((x) => x.id !== m.id));
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          const rec = (payload.new ?? payload.old) as Reaction;
          setMessages((prev) => prev.map((x) => {
            if (x.id !== rec.message_id) return x;
            const others = (x.reactions ?? []).filter((r) => !(r.user_id === rec.user_id && r.emoji === rec.emoji));
            return { ...x, reactions: payload.eventType === "DELETE" ? others : [...others, rec] };
          }));
        })
      .subscribe();

    const presenceCh = supabase.channel(`conv-${conversationId}-presence`, {
      config: { presence: { key: me } },
    });
    presenceCh
      .on("presence", { event: "sync" }, () => {
        const state = presenceCh.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = payload?.user_id as string | undefined;
        if (!uid || uid === me) return;
        setTypingIds((prev) => new Set(prev).add(uid));
        setTimeout(() => {
          setTypingIds((prev) => { const n = new Set(prev); n.delete(uid); return n; });
        }, 3500);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await presenceCh.track({ online_at: new Date().toISOString() });
      });
    typingChannelRef.current = presenceCh;

    return () => { supabase.removeChannel(msgCh); supabase.removeChannel(presenceCh); typingChannelRef.current = null; };
  }, [me, conversationId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingIds.size]);

  // Mark read
  useEffect(() => {
    markConversationRead(conversationId).then(() => qc.invalidateQueries({ queryKey: ["conversations"] }));
  }, [conversationId, messages.length, qc]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    const currentReply = replyTo;
    setReplyTo(null);
    try {
      await sendMessage(conversationId, { content: text, reply_to_id: currentReply?.id ?? null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
      setInput(text);
      setReplyTo(currentReply);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max 20 MB");
      return;
    }
    setSending(true);
    try {
      const att = await uploadAttachment(conversationId, file);
      await sendMessage(conversationId, { attachment: att, reply_to_id: replyTo?.id ?? null });
      setReplyTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSending(false);
    }
  };

  const broadcastTyping = () => {
    if (!me || !typingChannelRef.current) return;
    const now = Date.now();
    if (now - typingSentAt.current < 2000) return;
    typingSentAt.current = now;
    typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: me } });
  };

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter((m) => (m.content ?? "").toLowerCase().includes(q));
  }, [messages, search]);

  const pinned = useMemo(() => messages.filter((m) => m.pinned_at), [messages]);

  const otherMembers = conv?.members.filter((p) => p.id !== me) ?? [];
  const title = conv?.type === "group" ? conv.name ?? "Group" : conv?.other?.display_name ?? "…";
  const online = conv?.type === "direct" && conv.other ? onlineIds.has(conv.other.id) : false;
  const typingLabel = useMemo(() => {
    if (typingIds.size === 0) return null;
    const names = Array.from(typingIds).map((uid) => conv?.members.find((m) => m.id === uid)?.display_name ?? "Someone");
    if (names.length === 1) return `${names[0]} is typing…`;
    return `${names.slice(0, 2).join(", ")} typing…`;
  }, [typingIds, conv]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card/95 backdrop-blur">
        <Link to="/chats" className="p-1 -ml-1 rounded-md hover:bg-accent">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {conv?.type === "group"
          ? <GroupAvatar name={conv.name} size={36} />
          : conv?.other ? <Avatar profile={conv.other} size={36} /> : <GroupAvatar name="?" size={36} />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate flex items-center gap-1.5">
            {conv?.type === "group" && <Users className="w-3.5 h-3.5 text-muted-foreground" />}
            {title}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {conv?.type === "group"
              ? `${conv.members.length} members`
              : online ? <span className="text-green-500">● online</span> : conv?.other ? `@${conv.other.username}` : ""}
          </div>
        </div>
        <button onClick={() => setSearchOpen((v) => !v)} className="p-2 rounded-md hover:bg-accent" aria-label="Search">
          <Search className="w-5 h-5" />
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-2 rounded-md hover:bg-accent" aria-label="More">
            <MoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-popover border rounded-lg shadow-lg z-50 py-1 text-sm">
              {pinned.length > 0 && (
                <button onClick={() => { setShowPinned(true); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2">
                  <Pin className="w-4 h-4" /> Pinned ({pinned.length})
                </button>
              )}
              {conv?.type === "group" && (
                <button onClick={async () => {
                  if (!confirm("Leave this group?")) return;
                  try { await leaveConversation(conversationId); toast.success("Left group"); navigate({ to: "/chats" }); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                }} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> Leave group
                </button>
              )}
              <button onClick={async () => {
                if (!confirm("Delete this conversation? This cannot be undone.")) return;
                try { await deleteConversation(conversationId); toast.success("Deleted"); navigate({ to: "/chats" }); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              }} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> Delete chat
              </button>
            </div>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="px-4 py-2 border-b bg-card/50 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages"
            className="flex-1 bg-transparent text-sm focus:outline-none" />
          <button onClick={() => { setSearch(""); setSearchOpen(false); }} className="p-1 rounded hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pinned.length > 0 && !showPinned && !search && (
        <button onClick={() => setShowPinned(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent/40 border-b text-xs text-left hover:bg-accent">
          <Pin className="w-3.5 h-3.5" />
          <span className="truncate flex-1">{pinned[pinned.length - 1].content ?? pinned[pinned.length - 1].attachment_name}</span>
          <span className="text-muted-foreground">{pinned.length} pinned</span>
        </button>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {(showPinned ? pinned : filteredMessages).map((m, i, arr) => {
          const mine = m.sender_id === me;
          const prev = arr[i - 1];
          const showTime = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
          const showSender = conv?.type === "group" && !mine && (!prev || prev.sender_id !== m.sender_id);
          const senderProf = conv?.members.find((p) => p.id === m.sender_id);
          return (
            <div key={m.id}>
              {showTime && (
                <div className="text-center text-[11px] text-muted-foreground py-2">
                  {formatMsgTime(m.created_at)}
                </div>
              )}
              <MessageBubble
                m={m}
                mine={mine}
                showSender={showSender ? senderProf?.display_name : null}
                allMessages={messages}
                active={activeMessageId === m.id}
                onActivate={() => setActiveMessageId(activeMessageId === m.id ? null : m.id)}
                onReply={() => { setReplyTo(m); setActiveMessageId(null); inputRef.current?.focus(); }}
                onForward={() => { setForwardFor(m); setActiveMessageId(null); }}
                onPin={async () => {
                  try { await togglePin(m.id, !m.pinned_at); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                  setActiveMessageId(null);
                }}
                onDelete={async () => {
                  if (!confirm("Delete this message?")) return;
                  try { await deleteMessage(m.id); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                  setActiveMessageId(null);
                }}
                onReact={async (emoji) => {
                  const has = (m.reactions ?? []).some((r) => r.user_id === me && r.emoji === emoji);
                  try {
                    if (has) await removeReaction(m.id, emoji);
                    else await addReaction(m.id, emoji);
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                  setActiveMessageId(null);
                }}
                me={me}
              />
            </div>
          );
        })}
        {typingLabel && !search && !showPinned && (
          <div className="text-xs text-muted-foreground px-3">{typingLabel}</div>
        )}
        {filteredMessages.length === 0 && !showPinned && (
          <div className="text-center text-sm text-muted-foreground pt-10">
            {search ? "No matches" : "No messages yet — say hi 👋"}
          </div>
        )}
        {showPinned && (
          <div className="text-center pt-4">
            <button onClick={() => setShowPinned(false)} className="text-xs text-primary underline">Back to all messages</button>
          </div>
        )}
      </div>

      {replyTo && (
        <div className="border-t bg-card/60 px-3 py-2 flex items-start gap-2">
          <ReplyIcon className="w-4 h-4 text-primary mt-0.5" />
          <div className="flex-1 min-w-0 text-xs">
            <div className="text-primary font-medium">Replying to {conv?.members.find((p) => p.id === replyTo.sender_id)?.display_name ?? "message"}</div>
            <div className="truncate text-muted-foreground">{replyTo.content ?? replyTo.attachment_name}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-end gap-2 p-3 border-t bg-card">
        <input ref={fileRef} type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="p-2.5 rounded-full hover:bg-accent text-muted-foreground" aria-label="Attach">
          <Paperclip className="w-5 h-5" />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); broadcastTyping(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder="Type a message"
          className="flex-1 resize-none max-h-32 px-4 py-2.5 rounded-2xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="submit" disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>

      {forwardFor && <ForwardDialog message={forwardFor} currentConversationId={conversationId} onClose={() => setForwardFor(null)} />}
    </div>
  );
}

function MessageBubble({
  m, mine, showSender, active, onActivate, onReply, onForward, onPin, onDelete, onReact, me,
}: {
  m: Message;
  mine: boolean;
  showSender: string | null | undefined;
  allMessages: Message[];
  active: boolean;
  onActivate: () => void;
  onReply: () => void;
  onForward: () => void;
  onPin: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  me: string | null;
}) {
  const reactionSummary = summarizeReactions(m.reactions ?? []);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
      <div className="max-w-[80%] flex flex-col">
        {showSender && (
          <div className="text-[11px] text-muted-foreground px-2 mb-0.5">{showSender}</div>
        )}
        <div className="relative">
          <div
            onClick={onActivate}
            className="cursor-pointer rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm relative"
            style={{
              backgroundColor: mine ? "hsl(var(--primary))" : "hsl(var(--muted))",
              color: mine ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
            }}
          >
            {m.pinned_at && (
              <Pin className={`absolute -top-1.5 ${mine ? "-left-1.5" : "-right-1.5"} w-3.5 h-3.5 text-primary bg-background rounded-full p-0.5`} />
            )}
            {m.reply_to && (
              <div className="mb-1.5 border-l-2 border-current pl-2 opacity-70 text-xs">
                <div className="truncate max-w-full">{m.reply_to.content ?? m.reply_to.attachment_name ?? "Attachment"}</div>
              </div>
            )}
            {m.attachment_url && <AttachmentView msg={m} />}
            {m.content && <div>{m.content}</div>}
            {m.edited_at && <div className="text-[10px] opacity-60 mt-0.5">edited</div>}
          </div>

          {active && (
            <div className={`absolute z-10 top-full mt-1 ${mine ? "right-0" : "left-0"} bg-popover border rounded-full shadow-lg px-1 py-1 flex items-center gap-0.5`}>
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
                  className="w-8 h-8 hover:bg-accent rounded-full text-base">{emoji}</button>
              ))}
              <div className="w-px h-5 bg-border mx-0.5" />
              <button onClick={(e) => { e.stopPropagation(); onReply(); }} className="w-8 h-8 hover:bg-accent rounded-full grid place-items-center" title="Reply">
                <ReplyIcon className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onForward(); }} className="w-8 h-8 hover:bg-accent rounded-full grid place-items-center" title="Forward">
                <Forward className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onPin(); }} className="w-8 h-8 hover:bg-accent rounded-full grid place-items-center" title={m.pinned_at ? "Unpin" : "Pin"}>
                <Pin className={`w-4 h-4 ${m.pinned_at ? "text-primary" : ""}`} />
              </button>
              {mine && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-8 h-8 hover:bg-accent rounded-full grid place-items-center text-destructive" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
        {reactionSummary.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
            {reactionSummary.map((r) => {
              const iReacted = r.userIds.includes(me ?? "");
              return (
                <button key={r.emoji}
                  onClick={() => onReact(r.emoji)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${iReacted ? "bg-primary/10 border-primary/40" : "bg-card border-border"}`}
                >
                  {r.emoji} {r.userIds.length}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentView({ msg }: { msg: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    if (msg.attachment_url) attachmentSignedUrl(msg.attachment_url).then((u) => { if (!cancel) setUrl(u); });
    return () => { cancel = true; };
  }, [msg.attachment_url]);
  if (!msg.attachment_type) return null;
  const type = msg.attachment_type;
  if (!url) return <div className="text-xs opacity-70">Loading…</div>;
  if (type.startsWith("image/")) {
    return <img src={url} alt={msg.attachment_name ?? ""} className="rounded-lg max-h-64 max-w-full mb-1" />;
  }
  if (type.startsWith("video/")) {
    return <video controls src={url} className="rounded-lg max-h-64 max-w-full mb-1" />;
  }
  if (type.startsWith("audio/")) {
    return <audio controls src={url} className="mb-1" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" download={msg.attachment_name ?? "file"}
      className="flex items-center gap-2 bg-background/40 rounded-lg p-2 mb-1 hover:bg-background/60 text-xs">
      <Download className="w-4 h-4" />
      <span className="truncate">{msg.attachment_name ?? "file"}</span>
    </a>
  );
}

function summarizeReactions(reactions: Reaction[]) {
  const map = new Map<string, string[]>();
  reactions.forEach((r) => {
    const arr = map.get(r.emoji) ?? [];
    arr.push(r.user_id);
    map.set(r.emoji, arr);
  });
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

function ForwardDialog({ message, currentConversationId, onClose }: { message: Message; currentConversationId: string; onClose: () => void }) {
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listConversations().then(setConvs); }, []);
  const send = async (cid: string) => {
    setBusy(true);
    try { await forwardMessage(message, cid); toast.success("Forwarded"); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Forward to</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        <ul className="overflow-y-auto divide-y">
          {convs.filter((c) => c.id !== currentConversationId).map((c) => (
            <li key={c.id}>
              <button onClick={() => send(c.id)} disabled={busy}
                className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-accent/40 text-left rounded">
                {c.type === "group"
                  ? <GroupAvatar name={c.name} size={36} />
                  : c.other ? <Avatar profile={c.other} size={36} /> : <GroupAvatar name="?" size={36} />}
                <span className="truncate">{c.type === "group" ? (c.name ?? "Group") : (c.other?.display_name ?? "…")}</span>
              </button>
            </li>
          ))}
          {convs.filter((c) => c.id !== currentConversationId).length === 0 && (
            <li className="text-sm text-muted-foreground py-6 text-center">No other conversations</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function formatMsgTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    year: sameYear ? undefined : "numeric",
  });
}
