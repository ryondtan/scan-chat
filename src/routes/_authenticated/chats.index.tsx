import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listConversations, deleteConversation, leaveConversation, type ConversationSummary } from "@/lib/chat-api";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, GroupAvatar } from "@/components/chat/avatar";
import { MessageCircle, Plus, Users, MoreVertical, Trash2, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chats — Lumen" },
      { name: "description", content: "Your private and group conversations." },
    ],
  }),
  component: ChatsPage,
});

function ChatsPage() {
  const qc = useQueryClient();
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  useEffect(() => {
    const ch = supabase.channel("chats-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b bg-card/50 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Chats</h1>
        <Link to="/chats/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium">
          <Plus className="w-4 h-4" /> New group
        </Link>
      </header>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y">
          {conversations.map((c) => <ChatRow key={c.id} conv={c} />)}
        </ul>
      )}
    </div>
  );
}

function ChatRow({ conv }: { conv: ConversationSummary }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = conv.type === "group" ? conv.name || "Untitled group" : conv.other?.display_name ?? "Chat";
  const subtitle = conv.last_message
    ? previewText(conv.last_message.content, conv.last_message.attachment_type, conv.last_message.attachment_name)
    : conv.type === "group"
      ? `${conv.members.length} members`
      : conv.other ? `@${conv.other.username}` : "";

  const run = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setMenu(false);
    }
  };

  return (
    <li className="relative flex items-center">
      <button
        onClick={() => navigate({ to: "/chats/$conversationId", params: { conversationId: conv.id } })}
        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 hover:bg-accent/40 text-left"
      >
        {conv.type === "group"
          ? <GroupAvatar name={conv.name} />
          : conv.other ? <Avatar profile={conv.other} /> : <GroupAvatar name="?" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold truncate flex items-center gap-1.5">
              {conv.type === "group" && <Users className="w-3.5 h-3.5 text-muted-foreground" />}
              {title}
            </span>
            {conv.last_message && (
              <span className="text-xs text-muted-foreground shrink-0">
                {formatTime(conv.last_message.created_at)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-sm truncate flex-1 ${conv.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {subtitle}
            </p>
            {conv.unread > 0 && (
              <span className="text-xs min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground grid place-items-center font-medium">
                {conv.unread}
              </span>
            )}
          </div>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}
        className="p-2 mr-2 rounded-md hover:bg-accent text-muted-foreground"
        aria-label="Chat options"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div className="absolute right-3 top-12 z-50 w-44 bg-popover border rounded-lg shadow-lg py-1 text-sm">
            {conv.type === "group" && (
              <button
                disabled={busy}
                onClick={() => {
                  if (!confirm("Leave this group?")) return;
                  run(() => leaveConversation(conv.id), "Left group");
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Leave group
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
                run(() => deleteConversation(conv.id), "Chat deleted");
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-destructive"
            >
              <Trash2 className="w-4 h-4" /> Delete chat
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function previewText(content: string | null, attType: string | null, attName: string | null): string {
  if (content) return content;
  if (attType?.startsWith("image/")) return "📷 Photo";
  if (attType?.startsWith("video/")) return "🎬 Video";
  if (attType?.startsWith("audio/")) return "🎤 Audio";
  if (attName) return `📎 ${attName}`;
  return "";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-16">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <MessageCircle className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg">No chats yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Start a conversation by opening a friend's chat, or create a group.
      </p>
      <div className="flex gap-2 mt-5">
        <Link to="/friends" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          Friends
        </Link>
        <Link to="/chats/new" className="px-4 py-2 rounded-lg border text-sm font-medium">
          New group
        </Link>
      </div>
    </div>
  );
}
