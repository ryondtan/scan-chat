import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMessages, sendMessage, getFriendProfile, deleteChat, type Message } from "@/lib/chat-api";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { Avatar } from "./chats.index";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats/$friendId")({
  ssr: false,
  component: ConversationPage,
});

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

function ConversationPage() {
  const { friendId } = useParams({ from: "/_authenticated/chats/$friendId" });
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  const { data: friend } = useQuery({
    queryKey: ["friend", friendId], queryFn: () => getFriendProfile(friendId),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancel = false;
    getMessages(friendId).then((m) => { if (!cancel) setMessages(m); });
    return () => { cancel = true; };
  }, [friendId]);

  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel(`conv-${friendId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if ((m.sender_id === me && m.recipient_id === friendId) ||
            (m.sender_id === friendId && m.recipient_id === me)) {
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, friendId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => { inputRef.current?.focus(); }, [friendId]);

  // Mark incoming as read
  useEffect(() => {
    if (!me) return;
    const unread = messages.filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
    if (unread.length) {
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    }
  }, [messages, me]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendMessage(friendId, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
      setInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--chat-canvas)" }}>
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card/95 backdrop-blur">
        <Link to="/chats" className="p-1 -ml-1 rounded-md hover:bg-accent">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {friend && <Avatar profile={friend} size={36} />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{friend?.display_name ?? "…"}</div>
          {friend && <div className="text-xs text-muted-foreground truncate">@{friend.username}</div>}
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Delete this entire chat? This cannot be undone.")) return;
            try {
              await deleteChat(friendId);
              toast.success("Chat deleted");
              navigate({ to: "/chats" });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to delete");
            }
          }}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive"
          aria-label="Delete chat"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.map((m, i) => {
          const mine = m.sender_id === me;
          const prev = messages[i - 1];
          const showTime = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
          return (
            <div key={m.id}>
              {showTime && (
                <div className="text-center text-[11px] text-muted-foreground py-2">
                  {formatMsgTime(m.created_at)}
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm"
                  style={{
                    backgroundColor: mine ? "var(--chat-bubble-me)" : "var(--chat-bubble-them)",
                    color: mine ? "var(--chat-bubble-me-foreground)" : "var(--chat-bubble-them-foreground)",
                  }}
                  title={new Date(m.created_at).toLocaleString()}
                >
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground pt-10">
            Say hi to {friend?.display_name ?? "your friend"} 👋
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 p-3 border-t bg-card">
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message"
          className="flex-1 px-4 py-2.5 rounded-full bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <button type="submit" disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
