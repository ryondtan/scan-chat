import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getFriends, deleteChat, type Profile } from "@/lib/chat-api";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats/")({
  ssr: false,
  component: ChatsPage,
});

type LastMsg = { content: string; created_at: string; from_me: boolean; unread: boolean };

function ChatsPage() {
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const [lastByFriend, setLastByFriend] = useState<Record<string, LastMsg>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const me = userRes.user?.id;
      if (!me) return;
      const { data } = await supabase
        .from("messages").select("*")
        .order("created_at", { ascending: false }).limit(500);
      if (cancel || !data) return;
      const map: Record<string, LastMsg> = {};
      for (const m of data) {
        const other = m.sender_id === me ? m.recipient_id : m.sender_id;
        if (map[other]) continue;
        map[other] = {
          content: m.content,
          created_at: m.created_at,
          from_me: m.sender_id === me,
          unread: m.sender_id !== me && !m.read_at,
        };
      }
      setLastByFriend(map);
    })();
    return () => { cancel = true; };
  }, [friends]);

  useEffect(() => {
    const ch = supabase.channel("chats-preview")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const { data: userRes } = await supabase.auth.getUser();
        const me = userRes.user?.id;
        if (!me) return;
        const m = payload.new as { sender_id: string; recipient_id: string; content: string; created_at: string };
        const other = m.sender_id === me ? m.recipient_id : m.sender_id;
        setLastByFriend((prev) => ({
          ...prev,
          [other]: { content: m.content, created_at: m.created_at, from_me: m.sender_id === me, unread: m.sender_id !== me },
        }));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b bg-card/50">
        <h1 className="text-2xl font-bold">Chats</h1>
      </header>
      {friends.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y">
          {friends.map((f) => <ChatRow key={f.id} friend={f} last={lastByFriend[f.id]} />)}
        </ul>
      )}
    </div>
  );
}

function ChatRow({ friend, last }: { friend: Profile; last?: LastMsg }) {
  return (
    <li>
      <Link to="/chats/$friendId" params={{ friendId: friend.id }}
        className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition">
        <Avatar profile={friend} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold truncate">{friend.display_name}</span>
            {last && <span className="text-xs text-muted-foreground shrink-0">{formatTime(last.created_at)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground truncate flex-1">
              {last ? (last.from_me ? "You: " : "") + last.content : `@${friend.username}`}
            </p>
            {last?.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function Avatar({ profile, size = 48 }: { profile: Profile; size?: number }) {
  const initial = (profile.display_name || profile.username || "?")[0]?.toUpperCase();
  return (
    <div style={{ width: size, height: size }}
      className="rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0">
      {initial}
    </div>
  );
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
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <MessageCircle className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg">No chats yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Add a friend by scanning their QR code or entering their username.
      </p>
      <Link to="/friends" className="mt-5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
        Add a friend
      </Link>
    </div>
  );
}
