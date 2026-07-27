import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getFriends, createGroupConversation } from "@/lib/chat-api";
import { Avatar } from "@/components/chat/avatar";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats/new")({
  ssr: false,
  head: () => ({
    meta: [{ title: "New group — Lumen" }],
  }),
  component: NewGroupPage,
});

function NewGroupPage() {
  const navigate = useNavigate();
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!name.trim() || selected.size === 0 || creating) return;
    setCreating(true);
    try {
      const cid = await createGroupConversation(name, Array.from(selected));
      navigate({ to: "/chats/$conversationId", params: { conversationId: cid } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create group");
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card/50 sticky top-0 z-10">
        <Link to="/chats" className="p-1 -ml-1 rounded-md hover:bg-accent"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="font-semibold text-lg flex-1">New group</h1>
        <button
          onClick={create}
          disabled={!name.trim() || selected.size === 0 || creating}
          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </header>
      <div className="p-4 space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          className="w-full px-3 py-2.5 rounded-lg bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="text-xs text-muted-foreground">
          {selected.size === 0 ? "Add members" : `${selected.size} selected`}
        </div>
      </div>
      {friends.length === 0 ? (
        <div className="px-6 py-10 text-sm text-muted-foreground text-center">
          Add friends first before creating a group.
        </div>
      ) : (
        <ul className="divide-y">
          {friends.map((f) => {
            const on = selected.has(f.id);
            return (
              <li key={f.id}>
                <button
                  onClick={() => toggle(f.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/40 text-left"
                >
                  <Avatar profile={f} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{f.display_name}</div>
                    <div className="text-sm text-muted-foreground truncate">@{f.username}</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full grid place-items-center border ${on ? "bg-primary border-primary text-primary-foreground" : "bg-transparent border-muted-foreground/40"}`}>
                    {on && <Check className="w-4 h-4" />}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
